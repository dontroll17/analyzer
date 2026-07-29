// background.js — manages offscreen document and message relay
const log = (self.__logger?.forModule('bg')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[BG]', m, ...a),
  error: (m, ...a) => console.error('[BG]', m, ...a),
};

let offscreenReady = false;
let isCapturing = false;
let popupPort = null;
let overlayPort = null;
let metricsQueue = []; // In-memory buffer (drained on reconnect)
let _bgMetricsRecv = 0; // total metrics received from offscreen
let popupDisconnectedWarned = false; // throttle: warn once when popup disconnects
const MAX_METRICS_QUEUE = 10; // Limit queue for stability
const PERSISTENT_METRICS_KEY = 'ssa_metrics_queue'; // chrome.storage for persistence
const CAPTURING_KEY = 'ssa_capturing'; // persist capture state across SW restarts
const DROP_COUNT_KEY = 'ssa_audio_drop_count'; // persist drop count across popup disconnects

// === Storage write throttle (debounce 100ms) to prevent backpressure at 43fps ===
let _storageWriteTimer = null;
let _pendingMetricsData = null;
let _pendingDropCount = null;
const STORAGE_WRITE_DEBOUNCE_MS = 100; // 10fps max for storage

function throttledPersistMetrics(data) {
  _pendingMetricsData = data;
  // Capture latest drop count so it's included in the next flush
  if (data.audioDrops !== undefined) {
    _pendingDropCount = data.audioDrops;
  }
  if (_storageWriteTimer) return;
  _storageWriteTimer = setTimeout(() => {
    _storageWriteTimer = null;
    if (_pendingMetricsData) {
      chrome.storage.local.get([PERSISTENT_METRICS_KEY], (result) => {
        const queue = result[PERSISTENT_METRICS_KEY] || [];
        queue.push(_pendingMetricsData);
        if (queue.length > 80) queue.shift();
        chrome.storage.local.set({ [PERSISTENT_METRICS_KEY]: queue });
      });
      _pendingMetricsData = null;
    }
    // Also flush pending drop count if any
    if (_pendingDropCount !== null) {
      chrome.storage.local.set({ [DROP_COUNT_KEY]: _pendingDropCount });
      _pendingDropCount = null;
    }
  }, STORAGE_WRITE_DEBOUNCE_MS);
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
  return !!(chrome.offscreen && chrome.offscreen.createDocument);
}

// Keepalive alarm to prevent SW sleep during capture
// SW max lifetime ~30-60s, use 15s interval (synced with offscreen keepalive)
chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ssa_keepalive' && isCapturing && offscreenReady) {
    // Ping offscreen to keep SW alive
    chrome.runtime.sendMessage({ type: '_OFFSCREEN_REQ_METRICS' }).catch(() => {});
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

    // Clear queues on disconnect to prevent memory leak
    popupPortDisconnectHandler = () => {
      log.info('Popup port disconnected, queues cleared');
      popupPort = null;
      metricsQueue = [];
      chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
    };
    port.onDisconnect.addListener(popupPortDisconnectHandler);

    // Named handler for proper removal
    popupPortMessageHandler = (message) => {
      if (message && message.type === 'REQUEST_METRICS') {
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

    // On reconnect: clear stale queues and request fresh metrics (no drain)
    // Draining old metrics causes 5-10s delay when queue has 80-130 items
    if (metricsQueue.length > 0) {
      log.debug('Discarding stale metrics queue:', metricsQueue.length);
      metricsQueue = [];
    }
    chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
    
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
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_TOGGLE_OVERLAY' }).catch(() => {});
          }
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // === From Popup ===
  if (message.type === 'START_CAPTURE') {
    if (!canUseOffscreen()) {
      sendResponse({ ok: false, error: 'Offscreen API not available in this Chrome version' });
      return true;
    }
    
    const captureSource = message.captureSource || 'tab';
    
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_START', captureSource }, response => {
        isCapturing = !!response?.ok;
        persistCapturing();
        // Notify content script to show overlay
        if (isCapturing) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_SHOW_OVERLAY' }).catch(() => {});
            }
          });
        }
        sendResponse(response);
      });
    } else {
      // Try to create offscreen document
      createOffscreenDocument().then((success) => {
        if (success) {
          chrome.runtime.sendMessage({ type: '_OFFSCREEN_START', captureSource }, (response) => {
            isCapturing = !!response?.ok;
            persistCapturing();
            sendResponse(response);
          });
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
        // Note: popupPort is cleared by popupPortDisconnectHandler
        // Notify content script to hide overlay
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }).catch(() => {});
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
      // Notify content script to hide overlay
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }).catch(() => {});
        }
      });
      sendResponse({ ok: true });
    }
    return true;
  }
  
  if (message.type === 'GET_CAPTURE_STATUS') {
    sendResponse({ isCapturing });
    return false;
  }
  
  // === From Offscreen ===
  if (message.type === '_OFFSCREEN_METRICS') {
    const d = message.data;
    
    // Only queue/metrics forward if capture is active
    if (!isCapturing) {
      log.warn('Dropping metrics: isCapturing=false');
      sendResponse({ ok: true });
      return false;
    }
    
    // Persist to chrome.storage.local via throttled debounce (prevents 43fps backpressure)
    throttledPersistMetrics(d);
    
    // Also add to in-memory queue (limit for stability)
    metricsQueue.push(d);
    if (metricsQueue.length > MAX_METRICS_QUEUE) {
      metricsQueue.shift();
    }
    
    // Forward to popup if connected (live stream)
    if (popupPort) {
      try {
        popupPort.postMessage({ type: 'METRICS', ...d });
      } catch (e) {
        log.error('Failed to forward to popup:', e.message);
        popupPort = null;
      }
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
        overlayPort.postMessage(message.data);
      } catch (e) {
        log.warn('Failed to forward metrics to overlay:', e.message);
      }
    }
    sendResponse({ ok: true });
    return false;
  }
  
  // === Forward audio drop events to popup ===
  if (message.type === '_AUDIO_DROP') {
    if (popupPort) {
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
    if (popupPort) {
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
    if (popupPort) {
      popupPort.postMessage({ type: '_OFFSCREEN_ENDED' });
      popupPort.disconnect();
      // popupPort will be nullified by popupPortDisconnectHandler
    }
    // Also clear any lingering queues
    metricsQueue = [];
    chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
    // Notify content script to hide overlay
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { type: '_SSA_HIDE_OVERLAY' }).catch(() => {});
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

chrome.runtime.onInstalled.addListener(() => {
  createOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  createOffscreenDocument();
});

createOffscreenDocument();
