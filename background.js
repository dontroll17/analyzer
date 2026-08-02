// background.js — manages offscreen document and message relay
const log = (self.__logger?.forModule('bg')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[BG]', m, ...a),
  error: (m, ...a) => console.error('[BG]', m, ...a),
};

let offscreenReady = false;
let isCapturing = false;
let popupPort = null;
let _lastMetricsSnapshot = null; // Cache latest metrics for instant replay on reconnect
let overlayPort = null;
let metricsQueue = []; // In-memory buffer (drained on reconnect)
let persistentMetricsQueue = []; // Survives popup disconnect — used for instant replay (Phase 2.2)
let _bgMetricsRecv = 0; // total metrics received from offscreen
let globalPopupDisconnectTimer = null; // Grace period timer for popup disconnect
let popupDisconnectedWarned = false; // throttle: warn once when popup disconnects
const MAX_METRICS_QUEUE = 10; // Limit transient queue for stability
const MAX_PERSISTENT_METRICS = 500; // Max entries in persistent queue
const PERSISTENT_METRICS_KEY = 'ssa_metrics_queue'; // chrome.storage for persistence
const CAPTURING_KEY = 'ssa_capturing'; // persist capture state across SW restarts
const DROP_COUNT_KEY = 'ssa_audio_drop_count'; // persist drop count across popup disconnects

// === Storage write throttle (debounce 100ms) to prevent backpressure at 43fps ===
let _storageWriteTimer = null;
let _pendingMetricsData = null;
let _pendingDropCount = null;
const STORAGE_WRITE_DEBOUNCE_MS = 100; // 10fps max for storage

// In-memory ring buffer for metrics persistence
// Eliminates chrome.storage.local.get() before each write — reduces I/O by ~90%
let ringBuffer = [];
const RING_BUFFER_MAX = 80;
const STORAGE_FLUSH_INTERVAL_MS = 1000; // Flush to disk 1/sec (not 100ms = 10fps)

// === IndexedDB for long-term session history (Phase 2.3) ===
// chrome.storage.local has ~5MB quota; IndexedDB provides persistent large storage
const SESSION_DB_NAME = 'ssa-session-db';
const SESSION_DB_VERSION = 1;
const SESSION_STORE_NAME = 'sessions';
let sessionDB = null;
let dbReady = false;

function openSessionDB() {
  if (sessionDB || !('indexedDB' in self)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const request = indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        const store = db.createObjectStore(SESSION_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
    request.onsuccess = (event) => {
      sessionDB = event.target.result;
      dbReady = true;
      log.info('IndexedDB session store opened');
      resolve(true);
    };
    request.onerror = () => {
      log.warn('IndexedDB session store failed to open');
      resolve(false);
    };
  });
}

function appendToSessionDB(data) {
  if (!sessionDB || !dbReady) return;
  try {
    const tx = sessionDB.transaction([SESSION_STORE_NAME], 'readwrite');
    const store = tx.objectStore(SESSION_STORE_NAME);
    store.add({ ...data, timestamp: Date.now(), type: 'metrics' });
  } catch (e) {
    log.warn('Failed to append to IndexedDB:', e.message);
  }
}

function closeSessionDB() {
  if (sessionDB) {
    sessionDB.close();
    sessionDB = null;
    dbReady = false;
  }
}

// Open IndexedDB on startup
if ('indexedDB' in self) {
  openSessionDB();
}

function throttledPersistMetrics(data) {
  // Also flush pending drop count if any
  if (data.audioDrops !== undefined) {
    _pendingDropCount = data.audioDrops;
    chrome.storage.local.set({ [DROP_COUNT_KEY]: _pendingDropCount });
    _pendingDropCount = null;
  }
  
  // Push to ring buffer (overflow protection)
  ringBuffer.push(data);
  if (ringBuffer.length > RING_BUFFER_MAX) {
    ringBuffer.shift();
  }
  
  // Also append to IndexedDB for long-term session history
  appendToSessionDB(data);
  
  // Throttle: only one flush per interval
  if (_storageWriteTimer) return;
  _storageWriteTimer = setTimeout(() => {
    _storageWriteTimer = null;
    if (ringBuffer.length > 0) {
      // Atomic save: direct set, no read-before-write
      chrome.storage.local.set({ [PERSISTENT_METRICS_KEY]: ringBuffer }, () => {
        ringBuffer = []; // Clear after successful save
      });
    }
  }, STORAGE_FLUSH_INTERVAL_MS);
}

// Restore isCapturing from storage on startup (SW lifecycle)
chrome.storage.local.get([CAPTURING_KEY], (result) => {
  if (result[CAPTURING_KEY]) {
    isCapturing = result[CAPTURING_KEY];
    log.info('Restored isCapturing=true from storage (SW restart recovery)');
  }
});

function persistCapturing() {
  chrome.storage.local.set({ [CAPTURING_KEY]: isCapturing });
}

// Check if offscreen API is available (may be disabled in some Chrome versions)
function canUseOffscreen() {
  return !!(chrome.offscreen && chrome.offscreen.hasDocument);
}

// Ensure offscreen document is ready using chrome.offscreen.hasDocument()
// This prevents Service Worker sleep by verifying document exists before sending messages
async function ensureOffscreenReady() {
  if (offscreenReady) return true;
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      offscreenReady = true;
      return true;
    }
    return await createOffscreenDocument();
  } catch (err) {
    log.error('ensureOffscreenReady failed:', err);
    return false;
  }
}

// Keepalive alarm to prevent SW sleep during capture
// SW max lifetime ~30-60s, use 15s interval (synced with offscreen keepalive)
chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'ssa_keepalive' && isCapturing) {
    // Use ensureOffscreenReady() to check/recreate offscreen document
    await ensureOffscreenReady();
    chrome.runtime.sendMessage(
      { type: '_OFFSCREEN_REQ_METRICS' },
      () => { if (chrome.runtime.lastError) { /* suppressed */ } }
    );
  }
});

async function createOffscreenDocument() {
  if (!canUseOffscreen()) {
    log.warn('chrome.offscreen API not available');
    return false;
  }
  
  if (offscreenReady) {
    return true;
  }
  
  try {
    await chrome.offscreen.createDocument({
      justification: 'media_capture',
      reasons: ['USER_MEDIA'],
      url: 'offscreen.html'
    });
    offscreenReady = true;
    return true;
  } catch (err) {
    // If already created, treat as ready
    if (err.message?.includes('single offscreen')) {
      offscreenReady = true;
      return true;
    } else {
      log.error('Failed to create offscreen:', err);
      offscreenReady = false;
      return false;
    }
  }
}

// Named handlers for popup port (cleanup on disconnect)
let popupPortDisconnectHandler = null;
let popupPortMessageHandler = null;

// === Popup connection (persistent, for metrics relay) ===
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup-metrics') {
    popupPort = port;
    log.info('Popup connected');

    // Cancel any existing global disconnect timer (prevents race condition on reconnect)
    if (globalPopupDisconnectTimer) {
      clearTimeout(globalPopupDisconnectTimer);
      globalPopupDisconnectTimer = null;
    }
    
    popupPortDisconnectHandler = () => {
      // Only clear if port wasn't replaced by reconnect
      // NOTE: This handler NO LONGER clears ringBuffer or chrome.storage —
      // capture lifecycle is separate from UI lifecycle (Phase 2)
      const currentPort = popupPort;
      // Immediately mark as disconnected to prevent postMessage on dead port
      if (currentPort) currentPort._disconnected = true;
      globalPopupDisconnectTimer = setTimeout(() => {
        if (popupPort === currentPort) {
          log.info('Popup port disconnected, clearing only port reference');
          popupPort = null;
          // metricsQueue and ringBuffer persist until STOP_CAPTURE or _OFFSCREEN_ENDED
        } else {
          log.info('Popup port reconnected, ignoring stale disconnect');
        }
        globalPopupDisconnectTimer = null;
      }, 500); // 500ms grace period for reconnect
    };
    port.onDisconnect.addListener(popupPortDisconnectHandler);

    // Named handler for proper removal
    popupPortMessageHandler = (message) => {
      if (message && message.type === 'REQUEST_METRICS') {
        // Reset timer on active request
        if (globalPopupDisconnectTimer) {
          clearTimeout(globalPopupDisconnectTimer);
          globalPopupDisconnectTimer = null;
        }
        if (isCapturing) {
          chrome.runtime.sendMessage({ type: '_OFFSCREEN_REQ_METRICS' }, () => {});
        }
      }
      // Connection latency ping → pong (echo)
      if (message && message.type === '_PONG_REQUEST') {
        port.postMessage({ type: '_PONG_RESPONSE', pingTime: message.pingTime });
      }

    };
    port.onMessage.addListener(popupPortMessageHandler);

    // On reconnect: clear stale transient queue, replay from persistent queue (Phase 2.2)
    if (metricsQueue.length > 0) {
      log.debug('Discarding stale metrics queue:', metricsQueue.length);
      metricsQueue = [];
    }
    chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
    log.info('Popup reconnected, queues cleared');
    
    // Replay last metrics from persistent queue for instant snapshot
    if (persistentMetricsQueue.length > 0 && isCapturing) {
      const replayCount = Math.min(5, persistentMetricsQueue.length);
      const recentMetrics = persistentMetricsQueue.slice(-replayCount);
      for (const m of recentMetrics) {
        popupPort.postMessage({ type: 'METRICS', ...m });
      }
      log.info(`Replayed ${replayCount} recent metrics from persistent queue`);
    }
    
    // Reset disconnect warning flag on reconnect (allows warning on next disconnect)
    popupDisconnectedWarned = false;
    
    // Request fresh metrics immediately
    if (isCapturing) {
      log.info('Requesting fresh metrics from offscreen');
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_REQ_METRICS' }, () => {});
    }
  }
  
  // === Overlay connection (persistent, for overlay widget metrics) ===
  if (port.name === 'overlay-metrics') {
    overlayPort = port;

    let overlayDisconnectHandler = () => {
      overlayPort = null;
    };
    port.onDisconnect.addListener(overlayDisconnectHandler);
  }
  
  // === Overlay toggle (from popup icon click) ===
  if (port.name === 'overlay-toggle') {
    port.onMessage.addListener((data) => {
      if (data && data.type === 'TOGGLE') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs.length > 0) {
            try {
              // Ensure content.js is loaded before toggling
              await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                files: ['content.js']
              });
              chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_TOGGLE_OVERLAY' }, () => {});
            } catch (e) {
              // Content script injection failed — OK, tab may not be web page
            }
          }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // === From Popup ===
  if (message.type === 'START_CAPTURE') {
    log.warn('START_CAPTURE received from popup, captureSource:', message.captureSource);
    if (!canUseOffscreen()) {
      log.error('Offscreen API not available');
      sendResponse({ ok: false, error: 'Offscreen API not available in this Chrome version' });
      return true;
    }
    
    const captureSource = message.captureSource || 'tab';
    
    // Helper: inject content.js and show overlay (Phase 4.2)
    async function showOverlayOnActiveTab() {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;
      const tab = tabs[0];
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;
      
      try {
        // Inject content.js if not already loaded
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        log.info('content.js injected into tab', tab.id);
      } catch (e) {
        log.warn('Failed to inject content.js into tab', tab.id, ':', e.message);
      }
      
      // Send show overlay message after injection
      try {
        await chrome.tabs.sendMessage(tab.id, { type: '_SSA_SHOW_OVERLAY' });
        log.info('Show overlay signal sent to tab', tab.id);
      } catch (e) {
        log.warn('Failed to send show overlay to tab', tab.id, ':', e.message);
      }
    }
    
    async function handleStartResponse(response) {
      isCapturing = !!response?.ok;
      persistCapturing();
      log.info('START_CAPTURE response:', response?.ok ? 'ok' : response?.error);
      if (isCapturing) {
        await showOverlayOnActiveTab();
      }
      sendResponse(response);
    }
    
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_START', captureSource }, handleStartResponse);
    } else {
      // Try to create offscreen document — keep SW alive with async operation
      createOffscreenDocument().then((success) => {
        if (success) {
          chrome.runtime.sendMessage({ type: '_OFFSCREEN_START', captureSource }, handleStartResponse);
        } else {
          sendResponse({ ok: false, error: 'Failed to create offscreen document' });
        }
      });
    }
    return true;
  }
  
  if (message.type === 'REQUEST_STATUS') {
    sendResponse({ isCapturing, hasMetrics: !!metricsQueue?.length });
    return false;
  }
  
  if (message.type === 'STOP_CAPTURE') {
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_STOP' }, response => {
        isCapturing = false;
        persistCapturing();
        metricsQueue = []; // Clear in-memory queue on stop
        chrome.storage.local.remove([PERSISTENT_METRICS_KEY]); // Clear storage queue
        // Notify content script to hide overlay (silent)
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }, () => {});
          }
        });
        sendResponse(response);
      });
    } else {
      isCapturing = false;
      persistCapturing();
      metricsQueue = []; // Clear in-memory queue on stop
      chrome.storage.local.remove([PERSISTENT_METRICS_KEY]); // Clear storage queue
      // Note: popupPort is cleared by popupPortDisconnectHandler
      // Notify content script to hide overlay (silent)
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }, () => {});
        }
      });
      sendResponse({ ok: true });
    }
    return true;
  }
  
  // === From Offscreen ===
  if (message.type === '_OFFSCREEN_METRICS') {
    const d = message.data;
    
    // Cache latest metrics for instant replay on popup reconnect
    _lastMetricsSnapshot = d;
    
    // Only queue/metrics forward if capture is active
    if (!isCapturing) {
      log.warn('Dropping metrics: isCapturing=false');
      sendResponse({ ok: true });
      return false;
    }
    
    // Persist to chrome.storage.local via throttled debounce (prevents 43fps backpressure)
    throttledPersistMetrics(d);
    
    // Also add to transient in-memory queue (limit for stability)
    metricsQueue.push(d);
    if (metricsQueue.length > MAX_METRICS_QUEUE) {
      metricsQueue.shift();
    }
    
    // Push to persistent queue (survives popup disconnect for instant replay)
    persistentMetricsQueue.push(d);
    if (persistentMetricsQueue.length > MAX_PERSISTENT_METRICS) {
      persistentMetricsQueue.shift();
    }
    
    // Forward to popup if connected (live stream)
    if (popupPort && !popupPort._disconnected) {
      try {
        popupPort.postMessage({ type: 'METRICS', ...d });
      } catch (e) {
        log.error('Failed to forward to popup:', e.message);
        popupPort = null;
      }
    }
    // Send instant replay if popup just reconnected (cached metrics)
    else if (_lastMetricsSnapshot && !popupDisconnectedWarned) {
      popupDisconnectedWarned = true;
      log.warn('Popup disconnected — cached metrics not forwarded');
    } else {
      // Throttle: warn only once at disconnect, not every frame
      if (!popupDisconnectedWarned) {
        popupDisconnectedWarned = true;
        log.warn('Popup disconnected — metrics not forwarded to popup');
      }
    }
    
    // Forward to overlay if connected
    if (overlayPort) {
      try {
        overlayPort.postMessage({ type: 'METRICS', ...message.data });
      } catch (e) {
        log.warn('Failed to forward metrics to overlay:', e.message);
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  
  if (message.type === 'GET_CAPTURE_STATUS') {
    sendResponse({ isCapturing });
    return false;
  }
  
  // === Forward audio drop events to popup ===
  if (message.type === '_AUDIO_DROP') {
    if (popupPort && !popupPort._disconnected) {
      try {
        popupPort.postMessage(message);
      } catch (e) {
        // popup disconnected
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  
  if (message.type === '_AUDIO_DROP_RESET') {
    if (popupPort && !popupPort._disconnected) {
      try {
        popupPort.postMessage(message);
      } catch (e) {
        // popup disconnected
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  
  if (message.type === '_OFFSCREEN_ENDED') {
    isCapturing = false;
    persistCapturing();
    if (popupPort && !popupPort._disconnected) {
      try {
        popupPort.postMessage({ type: '_OFFSCREEN_ENDED' });
      } catch (e) {
        // port may be disconnected
      }
      try { popupPort.disconnect(); } catch (e) {}
    }
    // Also clear any lingering queues (including persistent replay buffer)
    metricsQueue = [];
    persistentMetricsQueue = [];
    chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
    // Notify content script to hide overlay (silent)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }, () => {});
      }
    });
    sendResponse({ ok: true });
    return false;
  }
  
  // === Keepalive from offscreen: keeps BG alive ===
  if (message.type === '_OFFSCREEN_KEEPALIVE') {
    // Restart keepalive alarm to extend SW lifetime
    // Alarm system resets on each interaction
    chrome.alarms.clear('ssa_keepalive', () => {
      chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.25 });
    });
    sendResponse({ ok: true });
    return false;
  }
  
  // === Forward debug metrics (DSP time, latency) to popup ===
  if (message.type === '_DEBUG_METRICS') {
    if (popupPort) {
      try {
        popupPort.postMessage({ type: '_DEBUG_METRICS', ...message });
      } catch (e) {
        log.warn('Failed to forward _DEBUG_METRICS to popup:', e.message);
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  
  // === Forward effects from popup to offscreen ===
  if (message && message.type.startsWith('_SSA_SET_')) {
    if (isCapturing && offscreenReady) {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          log.warn('Failed to forward effects to offscreen:', chrome.runtime.lastError.message);
        }
      });
    }
    sendResponse({ ok: true });
    return false;
  }
  
  return false;
});

// === Side Panel Support ===
// Use chrome.storage to persist user preference for side panel mode
const SIDE_PANEL_MODE_KEY = 'sidePanelMode'; // 'popup' | 'sidePanel'

// Set default side panel behavior (respects per-tab overrides via setOptions)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

// Handle extension icon click — route to popup or side panel based on user preference
chrome.action.onClicked.addListener(async (tab) => {
  const mode = await new Promise((resolve) => {
    chrome.storage.local.get([SIDE_PANEL_MODE_KEY], (result) => {
      resolve(result[SIDE_PANEL_MODE_KEY] || 'popup');
    });
  });
  
  if (mode === 'sidePanel') {
    // Ensure side panel shows the correct page for this tab
    await chrome.sidePanel.setOptions({
      tabId: tab.id,
      path: 'popup/popup.html'
    }).catch(() => {});
    
    // Open side panel
    await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
  // If mode is 'popup', Chrome shows the default popup automatically
});

// Note: offscreen document is created lazily via ensureOffscreenReady() when capture starts.
// Do NOT create on install/startup — Chrome requires justification and only one offscreen doc allowed.
