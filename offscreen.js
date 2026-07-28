// offscreen.js — persistent capture context
let mediaStream = null;
let audioContext = null;
let cleanupScheduled = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen]', message.type);
  
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
    
    console.log('[Offscreen] Calling getDisplayMedia...');
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    
    console.log('[Offscreen] Stream acquired, tracks:', mediaStream.getTracks().length);
    
    // Setup audio processing
    audioContext = new AudioContext({ sampleRate: 44100 });
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    await audioContext.audioWorklet.addModule(workletPath);
    
    const workletNode = new AudioWorkletNode(audioContext, 'audio-analyzer');
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
        console.log('[Offscreen] Track ended:', track.kind);
        scheduleCleanup();
      });
    });
    
    console.log('[Offscreen] Ready!');
    return { ok: true };
  } catch (error) {
    console.error('[Offscreen] Error:', error);
    cleanup();
    return { ok: false, error: error.message };
  }
}

async function stopCapture() {
  cleanup();
  console.log('[Offscreen] Stopped');
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

console.log('[Offscreen] Loaded');
