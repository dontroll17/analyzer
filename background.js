// background.js — manages offscreen document and message relay
let offscreenReady = false;
let isCapturing = false;
let popupPort = null;
let overlayPort = null;
let metricsQueue = []; // In-memory buffer (drained on reconnect)
const PERSISTENT_METRICS_KEY = 'ssa_metrics_queue'; // chrome.storage for persistence

// Check if offscreen API is available (may be disabled in some Chrome versions)
function canUseOffscreen() {
  return !!(chrome.offscreen && chrome.offscreen.createDocument);
}

// Keepalive alarm to prevent SW sleep during capture
// SW max lifetime ~30-60s, use 25s interval to stay safe
chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ssa_keepalive' && isCapturing && offscreenReady) {
    // Ping offscreen to keep SW alive
    chrome.runtime.sendMessage({ type: '_OFFSCREEN_REQ_METRICS' }).catch(() => {});
  }
});

async function createOffscreenDocument() {
  if (!canUseOffscreen()) {
    console.warn('[BG] chrome.offscreen API not available');
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
      console.error('[BG] Failed to create offscreen:', err);
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
    };
    port.onMessage.addListener(popupPortMessageHandler);

    // Drain queued metrics when popupPort reconnects (both in-memory and storage-persisted)
    if (metricsQueue.length > 0) {
      const toDrain = [...metricsQueue];
      metricsQueue = [];
      toDrain.forEach((m) => {
        try {
          popupPort.postMessage(m);
        } catch (e) {
          // popup disconnected
        }
      });
    }
    
    // Also drain storage-persisted metrics
    chrome.storage.local.get([PERSISTENT_METRICS_KEY], (result) => {
      const storageQueue = result[PERSISTENT_METRICS_KEY] || [];
      if (storageQueue.length > 0) {
        storageQueue.forEach((m) => {
          try {
            popupPort.postMessage(m);
          } catch (e) {
            // popup disconnected
          }
        });
        // Clear storage after draining
        chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
      }
    });
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
      sendResponse({ ok: true });
      return false;
    }
    
    // Persist to chrome.storage.local for reliability across SW wake/sleep (limit 80)
    chrome.storage.local.get([PERSISTENT_METRICS_KEY], (result) => {
      const queue = result[PERSISTENT_METRICS_KEY] || [];
      queue.push(d);
      if (queue.length > 80) queue.shift();
      chrome.storage.local.set({ [PERSISTENT_METRICS_KEY]: queue });
    });
    
    // Also add to in-memory queue (limit to 50 to prevent memory buildup)
    metricsQueue.push(d);
    if (metricsQueue.length > 50) {
      metricsQueue.shift();
    }
    
    // Forward to popup if connected
    if (popupPort) {
      try {
        popupPort.postMessage({ type: 'METRICS', ...d });
      } catch (e) {
        // popup message failed, try to reconnect
        popupPort = null;
      }
    }
    
    // Forward to overlay if connected
    if (overlayPort) {
      try {
        overlayPort.postMessage(message.data);
      } catch (e) {
        console.warn('[BG] Failed to forward metrics to overlay:', e.message);
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
  
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  createOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  createOffscreenDocument();
});

createOffscreenDocument();
