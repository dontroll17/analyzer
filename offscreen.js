// offscreen.js — persistent capture context
let mediaStream = null;
let audioContext = null;
let cleanupScheduled = false;
let lastMetrics = null; // Store last metrics for replay on popup reconnect

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === '_OFFSCREEN_START') {
    startCapture().then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_STOP') {
    stopCapture().then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_REQ_METRICS') {
    // Immediately resend the last captured metrics
    console.log('[Offscreen] REQ_METRICS: replaying last metrics');
    if (lastMetrics) {
      chrome.runtime.sendMessage(
        { type: '_OFFSCREEN_METRICS', data: lastMetrics },
        () => {} // ignore response
      );
      sendResponse({ ok: true, replayed: true });
    } else {
      sendResponse({ ok: false, error: 'No metrics available yet' });
    }
    return false;
  }
  
  return false;
});

async function startCapture() {
  try {
    if (mediaStream) return { ok: true, alreadyActive: true };
    
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 44100
      }
    });
    
    const audioTracks = mediaStream.getAudioTracks();
    console.log('[Offscreen] Capture started. Video tracks:', mediaStream.getVideoTracks().length, 'Audio tracks:', audioTracks.length);
    
    if (audioTracks.length === 0) {
      console.error('[Offscreen] NO AUDIO TRACKS CAPTURED! In the Chrome dialog, make sure to check "Share tab audio"');
    } else {
      console.log('[Offscreen] Audio track state:', audioTracks[0].enabled, audioTracks[0].muted, audioTracks[0].readyState);
    }
    
    // Setup audio processing
    audioContext = new AudioContext({ sampleRate: 44100 });
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    await audioContext.audioWorklet.addModule(workletPath);
    
    const workletNode = new AudioWorkletNode(audioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });
    source.connect(workletNode);
    
    workletNode.port.onmessage = (event) => {
      if (event.data.type === 'METRICS') {
        console.log('[Offscreen] Worklet METRICS:', {
          hasWaveform: !!event.data.waveform,
          waveformLen: event.data.waveform?.length,
          hold: event.data.waveformHold,
          rms: event.data.rms,
          frame: event.data.frame
        });
        // Store last metrics for replay on popup reconnect
        lastMetrics = event.data;
        chrome.runtime.sendMessage(
          { type: '_OFFSCREEN_METRICS', data: event.data },
          () => {} // ignore response
        );
      }
    };
    
    // Monitor all tracks
    mediaStream.getTracks().forEach(track => {
      track.addEventListener('ended', () => {
        scheduleCleanup();
      });
    });
    
    return { ok: true };
  } catch (error) {
    console.error('[Offscreen] Error:', error);
    cleanup();
    return { ok: false, error: error.message };
  }
}

async function stopCapture() {
  cleanup();
  return { ok: true };
}

function scheduleCleanup() {
  // Avoid double-cleanup if multiple tracks end simultaneously
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  
  // Wait for all tracks to finish ending
  setTimeout(() => {
    cleanup();
  }, 100);
}

function cleanup() {
  cleanupScheduled = false;
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  chrome.runtime.sendMessage({ type: '_OFFSCREEN_ENDED' }, () => {});
}
