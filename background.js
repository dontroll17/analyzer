// Background script for Stream Sensation Analyzer
// In MV3, stream processing is handled in popup context
let isCapturing = false;
// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message from popup:', message);
  
  if (message.action === 'START_CAPTURE') {
    // Получаем capture stream через tabCapture API на уровне background
    chrome.tabCapture.getMediaStreamId({ targetTabId: sender.tab?.id }, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'No stream ID' });
        return;
      }
      
      // Здесь инициализируем Offscreen Document для безопасной работы с AudioContext
      isCapturing = true;
      sendResponse({ success: true });
    });
    return true; // Асинхронный отклик

  }
   if (message.action === 'STOP_CAPTURE') {
    isCapturing = false;
    sendResponse({ success: true });
  }

  if (message.action === 'GET_STATUS') {
    sendResponse({ isCapturing });
  }
  if (message.type === 'GET_CAPTURE_STATUS') {
    sendResponse({ isCapturing: isCapturing });
  }
});

// Handle extension installation/upgrade
chrome.runtime.onInstalled.addListener(() => {
  console.log('Stream Sensation Analyzer installed/updated');
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Stream Sensation Analyzer started');
});
