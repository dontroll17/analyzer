// offscreen.js — persistent capture context
const log = (self.__logger?.forModule('offscreen')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[OFFSCREEN]', m, ...a),
  error: (m, ...a) => console.error('[OFFSCREEN]', m, ...a),
};

let mediaStream = null;
let _metricsCounter = 0;
let audioContext = null;
let cleanupScheduled = false;
let lastMetrics = null;
let currentCaptureSource = 'tab'; // 'tab' | 'mic' | 'combined'

// Audio Drop Counter
let audioDropCount = 0;
let lastContextState = 'running';
let lastStateChangeTime = 0;
const DROP_DEBOUNCE_MS = 500; // Minimum time between drops

// Keepalive ping to prevent SW sleep (pings every 15s while capturing)
let _keepaliveTimer = null;

// Stream monitor for drop detection (polled every 200ms)
let _streamMonitorTimer = null;
let _streamMonitorStopped = false;
let _lastStreamActiveState = true;

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
    
    // Start offscreen→BG keepalive to prevent SW sleep
    // SW wake threshold ~30-60s, ping every 15s to keep BG alive
    _keepaliveTimer = setInterval(() => {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_KEEPALIVE' }, () => {
        if (chrome.runtime.lastError) {
          // BG is dead — stop pinging
          clearInterval(_keepaliveTimer);
          _keepaliveTimer = null;
        }
      });
    }, 15000); // 15s — well under SW 30s lifetime
    
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
    
    // Save reference in closure to prevent race with cleanup()
    const savedAudioContext = audioContext;
    
    // Drop detection: poll MediaStream active state (reliable in MV3)
    // AudioContext.statechange is unreliable in offscreen docs — state stays 'running'
    // when user stops sharing. MediaStream.active=false fires reliably.
    _lastStreamActiveState = mediaStream.active;
    _streamMonitorStopped = false;
    _streamMonitorTimer = setInterval(() => {
      if (_streamMonitorStopped || !mediaStream) return;
      
      // Detect: was active, now inactive (user stopped sharing)
      if (_lastStreamActiveState && !mediaStream.active) {
        const now = Date.now();
        _lastStreamActiveState = false;
        
        // Check if any tracks still active before declaring drop
        const activeTracks = mediaStream.getTracks().filter(t => t.readyState === 'live');
        
        audioDropCount++;
        lastStateChangeTime = now;
        
        log.warn(`Stream dropped: active=false, liveTracks=${activeTracks.length}, dropCount=${audioDropCount}`);
        
        safeSendMessage({
          type: '_AUDIO_DROP',
          count: audioDropCount,
          timestamp: now,
          reason: 'stream_inactive'
        });
        
        // If no tracks left, this is a full stop
        if (activeTracks.length === 0) {
          _streamMonitorStopped = true;
          clearInterval(_streamMonitorTimer);
          _streamMonitorTimer = null;
          scheduleCleanup();
        }
      }
      
      // Detect: was inactive, now active (user resumed sharing)
      if (!_lastStreamActiveState && mediaStream.active) {
        audioDropCount = 0;
        safeSendMessage({
          type: '_AUDIO_DROP_RESET',
          count: 0,
          timestamp: Date.now()
        });
        _lastStreamActiveState = true;
      }
    }, 200); // Check every 200ms — responsive enough for user actions
    
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'METRICS') {
        _metricsCounter++;
        lastMetrics = event.data;
        lastMetrics.audioDrops = audioDropCount;
        safeSendMessage({ type: '_OFFSCREEN_METRICS', data: event.data });
        // Log every 1000 messages to avoid killing SW
        if (_metricsCounter % 1000 === 0) {
          log.info('Metrics sent:', _metricsCounter);
        }
      }
    };
    
    // Monitor AudioContext state for drops (secondary to stream polling)
    // statechange is unreliable in offscreen docs but may still fire in some cases
    audioContext.addEventListener('statechange', () => {
      const ctx = savedAudioContext;
      if (!ctx || ctx.state === 'closed') return;
      const newState = ctx.state;
      const now = Date.now();
      
      // Log state changes for debugging
      if (newState !== lastContextState) {
        log.info(`AudioContext statechange: ${lastContextState} → ${newState}`);
      }
      
      // Detect interrupted/suspended states (audio drops)
      if (lastContextState === 'running' && (newState === 'interrupted' || newState === 'suspended')) {
        if (now - lastStateChangeTime >= DROP_DEBOUNCE_MS) {
          audioDropCount++;
          lastStateChangeTime = now;
          
          log.warn(`AudioContext drop: state=${newState}, dropCount=${audioDropCount}`);
          
          safeSendMessage({
            type: '_AUDIO_DROP',
            count: audioDropCount,
            timestamp: now,
            reason: 'context_state'
          });
        }
      }
      
      // Reset counter on return to running
      if (lastContextState !== 'running' && newState === 'running') {
        audioDropCount = 0;
        safeSendMessage({
          type: '_AUDIO_DROP_RESET',
          count: 0,
          timestamp: now
        });
      }
      
      lastContextState = newState;
    });
    
    // Fallback: track 'ended' events (triggers full stop)
    mediaStream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        log.info(`Track ended: ${track.kind}/${track.label}`);
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
  
  // Stop keepalive ping
  if (_keepaliveTimer) {
    clearInterval(_keepaliveTimer);
    _keepaliveTimer = null;
  }
  
  // Stop stream monitoring
  _streamMonitorStopped = true;
  if (_streamMonitorTimer) {
    clearInterval(_streamMonitorTimer);
    _streamMonitorTimer = null;
  }
  
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
