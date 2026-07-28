// offscreen.js — persistent capture context
let mediaStream = null;
let audioContext = null;
let cleanupScheduled = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === '_OFFSCREEN_START') {
    startCapture().then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_STOP') {
    stopCapture().then(sendResponse);
    return true;
  }
  
  return false;
});

async function startCapture() {
  try {
    if (mediaStream) return { ok: true, alreadyActive: true };
    
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
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
        chrome.runtime.sendMessage(
          { type: '_OFFSCREEN_METRICS', data: event.data },
          () => {} // ignore sendResponse error
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
