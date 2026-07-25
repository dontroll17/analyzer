// State variables
let audioContext = null;
let mediaStreamSource = null;
let workletNode = null;
let captureStream = null;
let isCapturing = false;
let audioWorkletLoaded = false;

// Make isCapturing globally accessible for debugging
// @ts-ignore
globalThis.isCapturing = isCapturing;

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message from popup:', message);
  
  if (message.type === 'START_CAPTURE') {
    // Get active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        console.error('No active tab found');
        sendResponse({ type: 'STATUS_UPDATE', connected: false });
        return;
      }
      
      const tabId = tabs[0].id;
      console.log('Starting capture for tab:', tabId);
      
      // Request tab capture with audio only
      const constraints = {
        audio: true,
        video: false
      };
      
      chrome.tabCapture.capture(constraints, (stream) => {
        if (chrome.runtime.lastError) {
          console.error('Error starting capture:', chrome.runtime.lastError);
          sendResponse({ type: 'STATUS_UPDATE', connected: false });
          return;
        }
        
        if (!stream) {
          console.error('No stream returned from tabCapture');
          sendResponse({ type: 'STATUS_UPDATE', connected: false });
          return;
        }
        
        console.log('Got stream from tabCapture:', stream);
        captureStream = stream;
        
        // Initialize AudioContext and process stream
        initAudioContext(stream)
          .then(() => {
            isCapturing = true;
            // Update global reference for debugging
            // @ts-ignore
            globalThis.isCapturing = isCapturing;
            console.log('Audio capture started successfully');
            sendResponse({ type: 'STATUS_UPDATE', connected: true });
          })
          .catch((error) => {
            console.error('Error initializing audio context:', error);
            sendResponse({ type: 'STATUS_UPDATE', connected: false });
          });
      });
    });
    
    return true; // Keep message channel open
  } else if (message.type === 'STOP_CAPTURE') {
    // Clean up audio context
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    // Stop all tracks in the capture stream
    if (captureStream) {
      captureStream.getTracks().forEach((track) => {
        track.stop();
      });
      captureStream = null;
    }
    
    mediaStreamSource = null;
    workletNode = null;
    audioWorkletLoaded = false;
    isCapturing = false;
    
    // Update global reference for debugging
    // @ts-ignore
    globalThis.isCapturing = isCapturing;
    
    console.log('Audio capture stopped');
    sendResponse({ type: 'STATUS_UPDATE', connected: false });
    return true; // Keep message channel open
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ type: 'STATUS_UPDATE', connected: isCapturing });
  }
});

// Initialize AudioContext and process capture stream
async function initAudioContext(stream) {
  try {
    // Create AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 44100,
    });
    
    console.log('AudioContext created with sampleRate:', audioContext.sampleRate);
    
    // Create MediaStreamSource from tabCapture stream
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    
    // Register AudioWorklet
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    console.log('Loading AudioWorklet from:', workletPath);
    
    await audioContext.audioWorklet.addModule(workletPath);
    console.log('AudioWorklet module loaded successfully');
    audioWorkletLoaded = true;
    
    // Create AudioWorkletNode
    workletNode = new AudioWorkletNode(audioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    });
    
    // Connect source to worklet for analysis
    mediaStreamSource.connect(workletNode);
    
    // Connect worklet to destination for playback (loopback)
    workletNode.connect(audioContext.destination);
    
    console.log('AudioWorkletNode created and connected');
    
    // Listen for messages from worklet
    workletNode.port.onmessage = (event) => {
      handleWorkletMessage(event.data);
    };
    
    workletNode.port.onmessageerror = (event) => {
      console.error('Error receiving message from worklet:', event);
    };
    
    // Handle worklet state changes
    workletNode.port.onerror = (error) => {
      console.error('Worklet port error:', error);
    };
    
  } catch (error) {
    console.error('Error initializing AudioContext or loading worklet:', error);
    throw error;
  }
}

// Handle messages from worklet
function handleWorkletMessage(data) {
  if (data.type === 'METRICS') {
    // Log metrics from worklet
    console.log('[Stream Sensation Analyzer - Worklet Metrics]');
    console.log('  Timestamp:', data.timestamp);
    console.log('  Frame:', data.frame);
    console.log('  RMS:', data.rms.toFixed(4));
    console.log('  Bass (0-220Hz):', data.bass.toFixed(2));
    console.log('  Mid (220-4400Hz):', data.mid.toFixed(2));
    console.log('  Treble (4400-22000Hz):', data.treble.toFixed(2));
    console.log('  High Frequency Anomaly:', data.highFreqAnomaly.toFixed(4));
    
    // Log sample spectrum data (first 20 bins)
    if (data.spectrum && data.spectrum.length >= 20) {
      const sampleData = data.spectrum.slice(0, 20);
      console.log('  Spectrum (first 20 bins):', sampleData);
    }
  } else if (data.type === 'ERROR') {
    console.error('Worklet error:', data.message);
  } else if (data.type === 'READY') {
    console.log('AudioWorklet is ready');
  } else {
    console.log('Unknown worklet message type:', data.type);
  }
}

// Handle extension installation/upgrade
chrome.runtime.onInstalled.addListener(() => {
  console.log('Stream Sensation Analyzer installed/updated');
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Stream Sensation Analyzer started');
});
