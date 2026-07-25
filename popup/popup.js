// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const rmsSection = document.getElementById('rmsSection');
const rmsValue = document.getElementById('rmsValue');
const rmsLevel = document.getElementById('rmsLevel');

// RMS Utility (inline for popup)
const RMS = {
  classifyLevel: function(rmsValue) {
    if (rmsValue < 0.01) return 'SILENCE';
    else if (rmsValue < 0.1) return 'LOW';
    else if (rmsValue < 0.3) return 'MEDIUM';
    else if (rmsValue < 0.7) return 'HIGH';
    else return 'CRITICAL';
  },
  rmsToPercentage: function(rmsValue) {
    return Math.min(100, Math.max(0, rmsValue * 100));
  }
};

// Update UI state
function updateUI(connected) {
  if (connected) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.textContent = 'Connected - Capturing Audio';
    statusDiv.className = 'connected';
    rmsSection.style.display = 'block';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = 'Not Connected';
    statusDiv.className = 'disconnected';
    rmsSection.style.display = 'none';
    rmsValue.textContent = '0.0000';
    rmsLevel.textContent = 'Level: --';
  }
}

// Update RMS display
function updateRMSDisplay(rmsValueNum) {
  const rmsFormatted = rmsValueNum.toFixed(4);
  const level = RMS.classifyLevel(rmsValueNum);
  
  rmsValue.textContent = rmsFormatted;
  rmsValue.style.color = getLevelColor(level);
  rmsLevel.textContent = 'Level: ' + level + ' (' + RMS.rmsToPercentage(rmsValueNum).toFixed(1) + '%)';
}

// Get color based on RMS level
function getLevelColor(level) {
  switch (level) {
    case 'SILENCE': return '#ff6b6b';
    case 'LOW': return '#ffa94d';
    case 'MEDIUM': return '#95df6c';
    case 'HIGH': return '#3ac7a3';
    case 'CRITICAL': return '#d9363e';
    default: return '#333';
  }
}

// Event Listeners
startBtn.addEventListener('click', () => {
  console.log('Starting capture from popup...');
  
  // Use getDisplayMedia as alternative to tabCapture
  // This allows capturing screen/tab with user permission
  const constraints = {
    video: {
      displaySurface: "tab"  // Try to capture the current tab
    },
    audio: true
  };
  
  navigator.mediaDevices.getDisplayMedia(constraints)
    .then((stream) => {
      console.log('Got stream from getDisplayMedia:', stream);
      console.log('Stream ID:', stream.id);
      console.log('Stream tracks:', stream.getTracks());
      
      // Initialize audio processing directly in popup context
      initAudioProcessing(stream);
      
      // Update UI
      updateUI(true);
    })
    .catch((error) => {
      console.error('Error starting capture with getDisplayMedia:', error);
      
      // Fallback to regular tab capture if getDisplayMedia fails
      console.log('Trying chrome.tabCapture.capture as fallback...');
      
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          console.error('Error querying active tab:', chrome.runtime.lastError);
          alert('Error: No active tab found. Please switch to a tab first.');
          return;
        }
        
        const activeTab = tabs[0];
        console.log('Active tab:', activeTab);
        
        // Check if this is a Chrome system page
        if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('chrome-extension://'))) {
          console.error('Cannot capture Chrome system pages');
          alert('Cannot capture Chrome system pages (chrome://, edge://, etc.)');
          return;
        }
        
        // Request tab capture with audio only
        const tabCaptureConstraints = {
          audio: true,
          video: false
        };
        
        chrome.tabCapture.capture(tabCaptureConstraints, (stream) => {
          if (chrome.runtime.lastError) {
            console.error('Error starting tab capture:', chrome.runtime.lastError);
            alert('Error starting capture: ' + chrome.runtime.lastError.message);
            return;
          }
          
          if (!stream) {
            console.error('No stream returned from tabCapture');
            alert('No stream returned from tabCapture');
            return;
          }
          
          console.log('Got stream from tabCapture fallback:', stream);
          
          // Initialize audio processing
          initAudioProcessing(stream);
          
          // Update UI
          updateUI(true);
        });
      });
    });
});

// Initialize audio processing in popup context
let popupAudioContext = null;
let popupMediaStreamSource = null;
let popupWorkletNode = null;
let popupCaptureStream = null;

function initAudioProcessing(stream) {
  popupCaptureStream = stream;
  
  try {
    // Create AudioContext
    popupAudioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 44100,
    });
    
    console.log('Popup AudioContext created with sampleRate:', popupAudioContext.sampleRate);
    
    // Create MediaStreamSource from tabCapture stream
    popupMediaStreamSource = popupAudioContext.createMediaStreamSource(stream);
    
    // Register AudioWorklet
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    console.log('Loading AudioWorklet from:', workletPath);
    
    popupAudioContext.audioWorklet.addModule(workletPath)
      .then(() => {
        console.log('AudioWorklet module loaded successfully');
        
        // Create AudioWorkletNode
        popupWorkletNode = new AudioWorkletNode(popupAudioContext, 'audio-analyzer', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
          channelCountMode: 'explicit',
          channelInterpretation: 'discrete'
        });
        
        // Connect source to worklet for analysis only
        // Do NOT connect to destination to avoid audio feedback loop
        popupMediaStreamSource.connect(popupWorkletNode);
        
        console.log('AudioWorkletNode created and connected');
        
        // Listen for messages from worklet
        popupWorkletNode.port.onmessage = (event) => {
          handlePopupWorkletMessage(event.data);
        };
        
        popupWorkletNode.port.onmessageerror = (event) => {
          console.error('Error receiving message from worklet:', event);
        };
        
        popupWorkletNode.port.onerror = (error) => {
          console.error('Worklet port error:', error);
        };
      })
      .catch((error) => {
        console.error('Error loading AudioWorklet:', error);
        alert('Error loading AudioWorklet: ' + error.message);
        stopAudioProcessing();
      });
      
  } catch (error) {
    console.error('Error initializing popup audio context:', error);
    alert('Error initializing audio: ' + error.message);
    stopAudioProcessing();
  }
}

function stopAudioProcessing() {
  if (popupAudioContext) {
    popupAudioContext.close().catch(console.error);
    popupAudioContext = null;
  }
  
  if (popupCaptureStream) {
    popupCaptureStream.getTracks().forEach((track) => {
      track.stop();
    });
    popupCaptureStream = null;
  }
  
  popupMediaStreamSource = null;
  popupWorkletNode = null;
  
  updateUI(false);
}

function handlePopupWorkletMessage(data) {
  if (data.type === 'METRICS') {
    console.log('[Popup - Worklet Metrics]');
    console.log('  RMS:', data.rms.toFixed(4));
    console.log('  Bass:', data.bass.toFixed(2));
    console.log('  Mid:', data.mid.toFixed(2));
    console.log('  Treble:', data.treble.toFixed(2));
    
    // Send RMS to background for logging (optional)
    chrome.runtime.sendMessage({
      type: 'WORKLET_METRICS',
      rms: data.rms
    });
    
    // Update UI
    updateRMSDisplay(data.rms);
  } else if (data.type === 'ERROR') {
    console.error('Worklet error:', data.message);
  } else if (data.type === 'READY') {
    console.log('AudioWorklet is ready');
  }
}

stopBtn.addEventListener('click', () => {
  console.log('Stopping capture from popup...');
  stopAudioProcessing();
});

// Listen for worklet metrics from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WORKLET_METRICS' && message.rms !== undefined) {
    updateRMSDisplay(message.rms);
  }
});

// Initialize UI state on load
updateUI(false);
