// offscreen.js — persistent capture context
let mediaStream = null;
let audioContext = null;
let cleanupScheduled = false;
let lastMetrics = null;
let currentCaptureSource = 'tab'; // 'tab' | 'mic' | 'combined'

// Audio Drop Counter
let audioDropCount = 0;
let lastContextState = 'running';
let lastStateChangeTime = 0;
const DROP_DEBOUNCE_MS = 500; // Minimum time between drops

// Suppress runtime.lastError spam when background is unavailable
function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      // Background terminated or no port — silent ignore
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === '_OFFSCREEN_START') {
    currentCaptureSource = message.captureSource || 'tab';
    startCapture(currentCaptureSource).then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_STOP') {
    stopCapture().then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_REQ_METRICS') {
    if (lastMetrics) {
      safeSendMessage({ type: '_OFFSCREEN_METRICS', data: lastMetrics });
      sendResponse({ ok: true, replayed: true });
    } else {
      sendResponse({ ok: false, error: 'No metrics available yet' });
    }
    return false;
  }
  
  return false;
});

async function startCapture(source) {
  try {
    if (mediaStream) return { ok: true, alreadyActive: true };
    
    let streamOptions;
    
    switch (source) {
      case 'mic': {
        // Microphone only
        streamOptions = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          },
          video: false
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(streamOptions);
        break;
      }
      
      case 'combined': {
        // Tab audio + microphone - need to capture both
        const tabStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          }
        });
        
        // Check if tab has audio tracks
        const tabAudioTracks = tabStream.getAudioTracks();
        if (tabAudioTracks.length === 0) {
          safeSendMessage({
            type: '_OFFSCREEN_ERROR',
            error: 'No tab audio — make sure to check "Share tab audio"'
          });
          cleanup();
          return { ok: false, error: 'no_tab_audio' };
        }
        
        // Get microphone
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          }
        });
        
        // Combine: create a new stream with both audio tracks
        const combinedStream = new MediaStream();
        tabAudioTracks.forEach(track => combinedStream.addTrack(track));
        micStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        
        // Stop mic stream (tracks are already added)
        micStream.getTracks().forEach(t => t.stop());
        
        mediaStream = combinedStream;
        break;
      }
      
      case 'tab':
      default: {
        // Tab audio only (default)
        streamOptions = {
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100
          }
        };
        mediaStream = await navigator.mediaDevices.getDisplayMedia(streamOptions);
        break;
      }
    }
    
    const audioTracks = mediaStream.getAudioTracks();
    
    if (audioTracks.length === 0) {
      safeSendMessage({
        type: '_OFFSCREEN_ERROR',
        error: 'No audio tracks — make sure to check "Share tab audio"'
      });
      cleanup();
      return { ok: false, error: 'no_audio_tracks' };
    }
    
    audioContext = new AudioContext({ sampleRate: 44100 });
    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    await audioContext.audioWorklet.addModule(workletPath);
    
    const workletNode = new AudioWorkletNode(audioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });
    audioSource.connect(workletNode);
    
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'METRICS') {
        lastMetrics = event.data;
        lastMetrics.audioDrops = audioDropCount;
        safeSendMessage({ type: '_OFFSCREEN_METRICS', data: event.data });
      }
    };
    
    // Monitor AudioContext state for drops
    audioContext.addEventListener('statechange', () => {
      const ctx = audioContext;
      if (!ctx) return;
      const newState = ctx.state;
      const now = Date.now();
      
      // Detect interrupted/suspended states (audio drops)
      if (lastContextState === 'running' && (newState === 'interrupted' || newState === 'suspended')) {
        if (now - lastStateChangeTime >= DROP_DEBOUNCE_MS) {
          audioDropCount++;
          lastStateChangeTime = now;
          
          // Send drop notification
          safeSendMessage({
            type: '_AUDIO_DROP',
            count: audioDropCount,
            timestamp: now
          });
        }
      }
      
      // Reset counter on return to running
      if (lastContextState !== 'running' && newState === 'running') {
        // Reset drop count on reconnect
        audioDropCount = 0;
        safeSendMessage({
          type: '_AUDIO_DROP_RESET',
          count: 0,
          timestamp: now
        });
      }
      
      lastContextState = newState;
    });
    
    mediaStream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        scheduleCleanup();
      });
    });
    
    return { ok: true };
  } catch (error) {
    // User cancelled the share dialog
    if (error.name === 'NotAllowedError') {
      safeSendMessage({
        type: '_OFFSCREEN_ERROR',
        error: 'User denied tab capture'
      });
      return { ok: false, error: 'capture_denied' };
    }
    
    // Other errors (permission, not available, etc.)
    safeSendMessage({
      type: '_OFFSCREEN_ERROR',
      error: error.message || 'Unknown capture error'
    });
    
    cleanup();
    return { ok: false, error: error.message };
  }
}

async function stopCapture() {
  cleanup();
  return { ok: true };
}

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => {
    cleanup();
  }, 100);
}

function cleanup() {
  cleanupScheduled = false;
  
  // Reset audio drop counter
  audioDropCount = 0;
  lastContextState = 'running';
  lastStateChangeTime = 0;
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  safeSendMessage({ type: '_OFFSCREEN_ENDED' });
}
