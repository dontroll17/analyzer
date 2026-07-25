// Background script for Stream Sensation Analyzer
// In MV3, stream processing is handled in popup context

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message from popup:', message);
  
  if (message.type === 'START_CAPTURE_WITH_STREAM') {
    // In MV3, stream processing is now handled directly in popup context.
    console.log('Received START_CAPTURE_WITH_STREAM message');
    console.log('Note: Stream processing is now handled in popup context (MV3 limitation)');
    
    sendResponse({ 
      type: 'STATUS_UPDATE', 
      connected: false,
      note: 'Stream processing handled in popup context (MV3 limitation)'
    });
    return true;
  } else if (message.type === 'STOP_CAPTURE') {
    // Background no longer maintains audio context in MV3
    console.log('Stop message received (background context)');
    sendResponse({ type: 'STATUS_UPDATE', connected: false });
    return true;
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ type: 'STATUS_UPDATE', connected: false });
  } else if (message.type === 'WORKLET_METRICS') {
    // Forward metrics from popup to logging
    console.log('[Background - Worklet Metrics]', message);
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
