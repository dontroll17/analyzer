// background.js — manages offscreen document and message relay
let offscreenReady = false;
let isCapturing = false;
let popupPort = null;
let overlayPort = null;
let metricsQueue = []; // In-memory buffer (drained on reconnect)
const PERSISTENT_METRICS_KEY = 'ssa_metrics_queue'; // chrome.storage for persistence

async function createOffscreenDocument() {
  if (chrome.offscreen && !offscreenReady) {
    try {
      await chrome.offscreen.createDocument({
        justification: 'media_capture',
        reasons: ['USER_MEDIA'],
        url: 'offscreen.html'
      });
      offscreenReady = true;
    } catch (err) {
      // If already created, treat as ready
      if (err.message?.includes('single offscreen')) {
        offscreenReady = true;
      } else {
        console.error('[BG] Failed to create offscreen:', err);
        offscreenReady = false;
      }
    }
  }
}

// === Popup connection (persistent, for metrics relay) ===
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup-metrics') {
    popupPort = port;
    console.log('[BG] popup-metrics port connected, isCapturing:', isCapturing, 'queueLen:', metricsQueue.length);

    port.onDisconnect.addListener(() => {
      console.log('[BG] popup-metrics port disconnected');
      popupPort = null;
    });

    // Handle messages from popup
    port.onMessage.addListener((message) => {
      console.log('[BG] Received message from popup:', message?.type);
      if (message && message.type === 'REQUEST_METRICS') {
        console.log('[BG] Popup REQUEST_METRICS, isCapturing:', isCapturing);
        if (isCapturing) {
          chrome.runtime.sendMessage({ type: '_OFFSCREEN_REQ_METRICS' }, (resp) => {
            console.log('[BG] Offscreen response to REQ_METRICS:', resp);
          });
        } else {
          console.warn('[BG] Capturing not active, cannot replay metrics');
        }
      }
    });

    // Drain queued metrics when popupPort reconnects (both in-memory and storage-persisted)
    if (metricsQueue.length > 0) {
      console.log('[BG] Draining', metricsQueue.length, 'in-memory queued metrics to popup');
      const toDrain = [...metricsQueue];
      metricsQueue = [];
      toDrain.forEach((m, i) => {
        try {
          popupPort.postMessage(m);
        } catch (e) {
          console.warn('[BG] Failed to drain queued metric:', e.message);
        }
      });
    }
    
    // Also drain storage-persisted metrics
    chrome.storage.local.get([PERSISTENT_METRICS_KEY], (result) => {
      const storageQueue = result[PERSISTENT_METRICS_KEY] || [];
      if (storageQueue.length > 0) {
        console.log('[BG] Draining', storageQueue.length, 'storage-persisted metrics to popup');
        let sent = 0;
        storageQueue.forEach((m) => {
          try {
            popupPort.postMessage(m);
            sent++;
          } catch (e) {
            console.warn('[BG] Failed to drain storage metric:', e.message);
          }
        });
        // Clear storage after draining
        chrome.storage.local.remove([PERSISTENT_METRICS_KEY]);
        console.log('[BG] Sent', sent, 'storage metrics to popup, cleared storage');
      }
    });
  }
  
  // === Overlay connection (persistent, for overlay widget metrics) ===
  if (port.name === 'overlay-metrics') {
    overlayPort = port;
    console.log('[BG] overlay-metrics port connected');

    port.onDisconnect.addListener(() => {
      console.log('[BG] overlay-metrics port disconnected');
      overlayPort = null;
    });
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
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_START' }, response => {
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
      sendResponse({ ok: false, error: 'Offscreen not ready' });
    }
    return true;
  }
  
  if (message.type === 'REQUEST_STATUS') {
    console.log('[BG] REQUEST_STATUS from popup, isCapturing:', isCapturing);
    sendResponse({ isCapturing, hasMetrics: !!metricsQueue?.length });
    return false;
  }
  
  if (message.type === 'STOP_CAPTURE') {
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_STOP' }, response => {
        isCapturing = false;
        popupPort = null; // Clean up popup connection on stop
        metricsQueue = []; // Clear in-memory queue on stop
        chrome.storage.local.remove([PERSISTENT_METRICS_KEY]); // Clear storage queue
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
      popupPort = null;
      metricsQueue = []; // Clear in-memory queue on stop
      chrome.storage.local.remove([PERSISTENT_METRICS_KEY]); // Clear storage queue
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
    console.log('[BG] Got METRICS from offscreen:', {
      hasWaveform: !!message.data.waveform,
      waveformLen: message.data.waveform?.length,
      hold: message.data.waveformHold,
      rms: message.data.rms,
      frame: message.data.frame
    });
    
    // Persist to chrome.storage.local for reliability across SW wake/sleep
    chrome.storage.local.get([PERSISTENT_METRICS_KEY], (result) => {
      const queue = result[PERSISTENT_METRICS_KEY] || [];
      queue.push(message.data);
      if (queue.length > 100) queue.shift(); // Keep last 100
      chrome.storage.local.set({ [PERSISTENT_METRICS_KEY]: queue });
    });
    
    // Also add to in-memory queue
    metricsQueue.push(message.data);
    if (metricsQueue.length > 100) {
      metricsQueue.shift();
    }
    
    // Forward to popup if connected
    if (popupPort) {
      try {
        popupPort.postMessage(message.data);
      } catch (e) {
        console.warn('[BG] Failed to forward metrics to popup:', e.message);
      }
    } else {
      console.log('[BG] popupPort is null, metrics queued (in-memory:', metricsQueue.length, ', storage-persisted)');
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
  
  if (message.type === '_OFFSCREEN_ENDED') {
    isCapturing = false;
    if (popupPort) {
      popupPort.postMessage({ type: '_OFFSCREEN_ENDED' });
      popupPort.disconnect();
      popupPort = null;
    }
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
