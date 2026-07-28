// background.js — manages offscreen document and message relay
let offscreenReady = false;
let isCapturing = false;
let popupPort = null;

async function createOffscreenDocument() {
  if (chrome.offscreen && !offscreenReady) {
    try {
      await chrome.offscreen.createDocument({
        justification: 'media_capture',
        reasons: ['USER_MEDIA'],
        url: 'offscreen.html'
      });
      offscreenReady = true;
      console.log('[BG] Offscreen created');
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
    console.log('[BG] Popup connected');
    popupPort = port;

    port.onDisconnect.addListener(() => {
      console.log('[BG] Popup disconnected');
      popupPort = null;
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG]', sender.type, ':', message.type);
  
  // === From Popup ===
  if (message.type === 'START_CAPTURE') {
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_START' }, response => {
        isCapturing = !!response?.ok;
        sendResponse(response);
      });
    } else {
      sendResponse({ ok: false, error: 'Offscreen not ready' });
    }
    return true;
  }
  
  if (message.type === 'STOP_CAPTURE') {
    if (offscreenReady) {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_STOP' }, response => {
        isCapturing = false;
        popupPort = null; // Clean up popup connection on stop
        sendResponse(response);
      });
    } else {
      isCapturing = false;
      popupPort = null;
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
    // Forward metrics to popup via persistent connection
    if (popupPort) {
      popupPort.postMessage(message.data);
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
    console.log('[BG] Capture ended');
    sendResponse({ ok: true });
    return false;
  }
  
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Stream Sensation Analyzer installed/updated');
  createOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('Stream Sensation Analyzer started');
  createOffscreenDocument();
});

createOffscreenDocument();
