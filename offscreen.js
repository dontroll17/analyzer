// offscreen.js — persistent capture context
// Guard: skip real audio capture setup in non-browser environments (Jest, Node.js)
// This prevents Windows Defender false positives when running tests
const isBrowserEnv = typeof window !== 'undefined' || typeof chrome?.runtime?.id !== 'undefined';

const log = (self.__logger?.forModule('offscreen')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[OFFSCREEN]', m, ...a),
  error: (m, ...a) => console.error('[OFFSCREEN]', m, ...a),
};

// Centralized audio chain state (replaces window._ssaX to prevent race conditions)
// Vector crossfading: each effect has Wet and Dry GainNode pair with exponential smoothing
// G_wet(t) = 1 - e^(-α(t-t_curr)), G_dry(t) = e^(-α(t-t_curr))
// where α = 1/τ (tau = 15ms for 0dB transition at 44.1kHz)
const audioChain = {
  compressor: null,
  compressorWetGain: null,
  compressorDryGain: null,
  dcBlocker: null,
  lpf: null,
  peaking: null,
  peakingWetGain: null,
  peakingDryGain: null,
  delay: null,
  delayWetGain: null,
  delayDryGain: null,
  waveShaper: null,
  effectGain: null,
  masterGain: null,
  source: null,
  worklet: null,
  ready: false
};

let mediaStream = null;
let _metricsCounter = 0;
let _popupPort = null; // Direct port to popup for metrics (P.6)
let _popupConnectTimer = null;
let audioContext = null;
let cleanupScheduled = false;
let lastMetrics = null;
let currentCaptureSource = 'tab'; // 'tab' | 'mic' | 'combined'

// Crossfade constants: τ = 15ms, α = 1/τ for exponential smoothing
const CROSSFADE_TAU = 0.015; // 15ms time constant in seconds

// Silent Masking flag: blocks METRICS during Warm-up phase
let isSilentMaskingActive = false;

// Effects chain state (C.3.1 + C.3.2 + C.3.3 + C.3.4 + C.3.5)
let _effectsState = {
  compressor: { enabled: false, threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.250 },
  limiter: { enabled: false, threshold: -1, attack: 0.001, release: 0.1 },
  eq: {
    hpf: { enabled: false, frequency: 20 },
    lpf: { enabled: false, frequency: 22050 },
    peaking: { enabled: false, frequency: 1000, gain: 0, Q: 1 }
  },
  delay: { enabled: false, delayTime: 0, feedback: 0, mix: 0 }
};

// === P.4: Load effects settings from chrome.storage (offscreen self-loading) ===
// Elimimates the need for popup to send settings via setTimeout — offscreen reads directly.
function _loadEffectsFromStorage() {
  chrome.storage.local.get(['ssa_effectsSettings'], (result) => {
    if (!result.ssa_effectsSettings || typeof result.ssa_effectsSettings !== 'object') return;
    const s = _effectsState;
    const saved = result.ssa_effectsSettings;
    if (saved.compressor && typeof saved.compressor === 'object') {
      if (saved.compressor.threshold !== undefined) s.compressor.threshold = saved.compressor.threshold;
      if (saved.compressor.ratio !== undefined) s.compressor.ratio = saved.compressor.ratio;
      if (saved.compressor.knee !== undefined) s.compressor.knee = saved.compressor.knee;
      if (saved.compressor.attack !== undefined) s.compressor.attack = saved.compressor.attack;
      if (saved.compressor.release !== undefined) s.compressor.release = saved.compressor.release;
      if (typeof saved.compressor.active === 'boolean') s.compressor.enabled = saved.compressor.active;
    }
    if (saved.eq && typeof saved.eq === 'object') {
      if (typeof saved.eq.active === 'boolean') s.eq.enabled = saved.eq.active;
      if (saved.eq.hpfFreq !== undefined) s.eq.hpfFreq = saved.eq.hpfFreq;
      if (saved.eq.lpfFreq !== undefined) s.eq.lpfFreq = saved.eq.lpfFreq;
      if (saved.eq.peakFreq !== undefined) s.eq.peakFreq = saved.eq.peakFreq;
      if (saved.eq.peakGain !== undefined) s.eq.peakGain = saved.eq.peakGain;
      if (saved.eq.peakQ !== undefined) s.eq.peakQ = saved.eq.peakQ;
    }
    if (saved.limiter && typeof saved.limiter === 'object') {
      if (typeof saved.limiter.active === 'boolean') s.limiter.enabled = saved.limiter.active;
      if (saved.limiter.threshold !== undefined) s.limiter.threshold = saved.limiter.threshold;
    }
    if (saved.delay && typeof saved.delay === 'object') {
      if (typeof saved.delay.active === 'boolean') s.delay.enabled = saved.delay.active;
      if (saved.delay.delayTime !== undefined) s.delay.delayTime = saved.delay.delayTime;
      if (saved.delay.feedback !== undefined) s.delay.feedback = saved.delay.feedback;
      if (saved.delay.mix !== undefined) s.delay.mix = saved.delay.mix;
    }
  });
}

// === Equal-Power Crossfade helpers (fixes P.4 and P.5) ===
// Exponential crossfade (g_wet=1-e^(-t/τ), g_dry=e^(-t/τ)) has sum=1 but power dips:
// At midpoint (g=0.5): P=0.25+0.25=0.5 → -3dB volume drop.
// Equal-power uses sin/cos: g_wet=sin(θ), g_dry=cos(θ), where θ∈[0,π/2].
// This ensures g²_wet + g²_dry = 1 at all times → constant power.

/**
 * Create equal-power crossfade curve (sin/cos).
 * @param {number} steps - Number of samples in the curve
 * @returns {{ dryCurve: Float32Array, wetCurve: Float32Array }}
 */
function createEqualPowerCurve(steps) {
  const dryCurve = new Float32Array(steps);
  const wetCurve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const theta = (Math.PI * i) / (2 * steps);
    dryCurve[i] = Math.cos(theta);
    wetCurve[i] = Math.sin(theta);
  }
  return { dryCurve, wetCurve };
}

// Audio Drop Counter
let audioDropCount = 0;
let lastContextState = 'running';
let lastStateChangeTime = 0;
const DROP_DEBOUNCE_MS = 500; // Minimum time between drops

// Keepalive ping to prevent SW sleep (pings every 10s while capturing)
let _keepaliveTimer = null;

// Stream monitor for drop detection (polled every 200ms)
let _streamMonitorTimer = null;
let _streamMonitorStopped = false;
let _lastStreamActiveState = true;

// DSP time: periodically request from AudioWorklet via workletNode.port
let _dspTimeTimer = null;
let _lastWorkletTimestamp = 0;

// Persistent port to background for effect forwarding


// Suppress runtime.lastError spam when background is unavailable
// Chrome throws on sendMessage when SW/background is dead — suppress silently
// Must consume lastError inside callback to prevent console "Unchecked runtime.lastError" spam
function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, (resp) => {
    // Consume lastError inside callback to prevent console spam
    void chrome.runtime.lastError;
  });
}

// === P.6: Direct port to popup for metrics (bypass background relay) ===
// When popup is ready, offscreen connects directly and sends metrics via port.
// Background still receives metrics for persistence/queuing, but popup gets them directly.
function _ensurePopupPort() {
  if (_popupPort && !_popupPort._disconnected) return;
  
  try {
    _popupPort = chrome.runtime.connect({ name: 'offscreen-metrics' });
    log.info('P.6: Direct port to popup opened');
    
    _popupPort.onDisconnect.addListener(() => {
      _popupPort = null;
      // Reset reconnect timer — popup may have closed
      if (_popupConnectTimer) {
        clearTimeout(_popupConnectTimer);
        _popupConnectTimer = null;
      }
    });
    
    // Reschedule reconnection attempt
    _schedulePopupConnect();
  } catch (e) {
    log.warn('P.6: Failed to connect to popup:', e.message);
    _schedulePopupConnect();
  }
}

function _schedulePopupConnect() {
  if (_popupConnectTimer) return;
  _popupConnectTimer = setTimeout(() => {
    _popupConnectTimer = null;
    _ensurePopupPort();
  }, 500); // Try every 500ms
}

function _sendToPopup(data) {
  if (_popupPort && !_popupPort._disconnected) {
    try {
      _popupPort.postMessage(data);
      return true;
    } catch (e) {
      _popupPort = null;
    }
  }
  return false;
}

// Track per-track ended listeners for cleanup (prevent memory leaks)
const _trackEndedListeners = new Map(); // track -> listenerFn mapping

// Reference to audioContext statechange listener for cleanup
let _contextStateChangeHandler = null;

// RMS variance tracking for silence detection (DC offset from resampling)
const _rmsHistory = [];

// Silence log counter (throttle logs)
let _silenceLogCounter = 0;

// C.3.2: Update compressor settings (vector crossfading with smooth transitions)
// Uses setTargetAtTime for exponential smoothing: G(t) = G_final ± (G_final - G_initial) * e^(-αΔt)
// τ = 15ms ensures 0dB transition with no audible clicks
// ALWAYS updates _effectsState (for pre-capture parameter setting); only applies audio graph when ready
function _updateCompressor(params) {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  
  if (params.enabled !== undefined) {
    _effectsState.compressor.enabled = params.enabled;
  }
  if (params.threshold !== undefined) _effectsState.compressor.threshold = params.threshold;
  if (params.knee !== undefined) _effectsState.compressor.knee = params.knee;
  if (params.ratio !== undefined) _effectsState.compressor.ratio = params.ratio;
  if (params.attack !== undefined) _effectsState.compressor.attack = params.attack;
  if (params.release !== undefined) _effectsState.compressor.release = params.release;
  
  // Only apply audio graph changes when capture is active
  if (!audioChain.ready || !audioChain.compressor) return;
  
  const comp = audioChain.compressor;
  const dryGain = audioChain.compressorDryGain;
  const wetGain = audioChain.compressorWetGain;
  
  // Smooth gain transition for crossfading
  if (_effectsState.compressor.enabled) {
    // Activate compressor: wet→1, dry→0 — equal-power crossfade to prevent -3dB power dip
    // M.2: Use setTargetAtTime for exponential smoothing of compressor parameters
    // τ=15ms prevents clicks from abrupt parameter changes (ratio, threshold, knee)
    const ratio = _effectsState.compressor.ratio;
    const threshold = _effectsState.compressor.threshold;
    const knee = _effectsState.compressor.knee;
    const attack = _effectsState.compressor.attack / 1000;
    const release = _effectsState.compressor.release / 1000;
    
    // Smooth parameter transitions (exponential: G(t) = G_final ± (G_final - G_initial) · e^(-αΔt))
    comp.ratio.setTargetAtTime(ratio, t, CROSSFADE_TAU);
    comp.threshold.setTargetAtTime(threshold, t, CROSSFADE_TAU);
    comp.knee.setTargetAtTime(knee, t, CROSSFADE_TAU);
    comp.attack.setTargetAtTime(attack, t, CROSSFADE_TAU);
    comp.release.setTargetAtTime(release, t, CROSSFADE_TAU);
    
    // Cancel previous automation to prevent InvalidStateError (P.5)
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    const { dryCurve, wetCurve } = createEqualPowerCurve(Math.ceil(audioContext.sampleRate * CROSSFADE_TAU));
    wetGain.gain.setValueCurveAtTime(wetCurve, t, CROSSFADE_TAU);
    dryGain.gain.setValueCurveAtTime(dryCurve, t, CROSSFADE_TAU);
  } else {
    // Bypass compressor: wet→0, dry→1
    // Also reset compressor parameters to bypass state with smoothing
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    wetGain.gain.setTargetAtTime(0, t, CROSSFADE_TAU);
    dryGain.gain.setTargetAtTime(1, t, CROSSFADE_TAU);
    
    // Smoothly return compressor to bypass state (ratio=1, threshold=-100, knee=0)
    comp.ratio.setTargetAtTime(1, t, CROSSFADE_TAU);
    comp.threshold.setTargetAtTime(-100, t, CROSSFADE_TAU);
    comp.knee.setTargetAtTime(0, t, CROSSFADE_TAU);
    comp.attack.setTargetAtTime(0.003, t, CROSSFADE_TAU);
    comp.release.setTargetAtTime(0.250, t, CROSSFADE_TAU);
  }
}


// C.3.3: Update limiter settings
// ALWAYS updates _effectsState; only applies waveShaper when ready
function _updateLimiter(params) {
  const threshold = params.threshold !== undefined ? params.threshold : _effectsState.limiter.threshold;
  
  if (params.enabled !== undefined) _effectsState.limiter.enabled = params.enabled;
  if (params.threshold !== undefined) _effectsState.limiter.threshold = threshold;
  
  // Only apply audio graph changes when capture is active
  if (!audioChain.ready || !audioChain.waveShaper) return;
  
  const ws = audioChain.waveShaper;
  if (_effectsState.limiter.enabled) {
    ws.curve = createLimiterCurve(threshold, 4);
  } else {
    ws.curve = new Float32Array([0, 1]);
  }
}

// C.3.4: Parametric EQ update (vector crossfading after DC Blocker)
// Smooth transitions: LPF+Peaking use wet/dry crossfading with τ=15ms
function _updateEQ(params) {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  
  // ALWAYS update state (for pre-capture parameter setting)
  if (params.enabled !== undefined) {
    _effectsState.eq.enabled = params.enabled;
  }
  if (params.hpfFreq !== undefined) _effectsState.eq.hpfFreq = params.hpfFreq;
  if (params.lpfFreq !== undefined) _effectsState.eq.lpfFreq = params.lpfFreq;
  if (params.peakFreq !== undefined) _effectsState.eq.peakFreq = params.peakFreq;
  if (params.peakGain !== undefined) _effectsState.eq.peakGain = params.peakGain;
  if (params.peakQ !== undefined) _effectsState.eq.peakQ = params.peakQ;
  
  // Only apply audio graph changes when capture is active
  if (!audioChain.ready || !audioChain.dcBlocker || !audioChain.lpf || !audioChain.peaking) return;
  
  const dc = audioChain.dcBlocker;
  const lpf = audioChain.lpf;
  const peak = audioChain.peaking;
  const dryGain = audioChain.peakingDryGain;
  const wetGain = audioChain.peakingWetGain;
  
  // Apply parameter values from state (always active) — use smooth transitions to prevent IIR transients
  if (_effectsState.eq.enabled) {
    dc.frequency.setTargetAtTime(_effectsState.eq.hpfFreq, t, 0.01);
    lpf.frequency.setTargetAtTime(_effectsState.eq.lpfFreq, t, 0.01);
    peak.frequency.setTargetAtTime(_effectsState.eq.peakFreq, t, 0.01);
    peak.gain.setTargetAtTime(_effectsState.eq.peakGain, t, 0.01);
    peak.Q.setTargetAtTime(_effectsState.eq.peakQ, t, 0.01);
  }
  
  // Smooth gain transition for crossfading — equal-power to prevent -3dB dip
  if (_effectsState.eq.enabled) {
    // Cancel previous automation to prevent InvalidStateError (P.5)
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    const { dryCurve, wetCurve } = createEqualPowerCurve(Math.ceil(audioContext.sampleRate * CROSSFADE_TAU));
    wetGain.gain.setValueCurveAtTime(wetCurve, t, CROSSFADE_TAU);
    dryGain.gain.setValueCurveAtTime(dryCurve, t, CROSSFADE_TAU);
  } else {
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    wetGain.gain.setTargetAtTime(0, t, CROSSFADE_TAU);
    dryGain.gain.setTargetAtTime(1, t, CROSSFADE_TAU);
  }
}

// C.3.5: Delay update (vector crossfading with smooth transitions)
// τ = 15ms ensures smooth fade without clicks
function _updateDelay(params) {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  
  // ALWAYS update state (for pre-capture parameter setting)
  if (params.enabled !== undefined) {
    _effectsState.delay.enabled = !!params.enabled;
  } else {
    _effectsState.delay.enabled = _effectsState.delay.enabled || false;
  }
  if (params.delayTime !== undefined) _effectsState.delay.delayTime = params.delayTime;
  if (params.feedback !== undefined) _effectsState.delay.feedback = params.feedback;
  if (params.mix !== undefined) _effectsState.delay.mix = params.mix;
  
  // Only apply audio graph changes when capture is active
  if (!audioChain.ready || !audioChain.delay) return;
  
  const wetGain = audioChain.delayWetGain;
  const dryGain = audioChain.delayDryGain;
  
  // Smooth gain transition for crossfading — equal-power (cos/sin) to prevent -3dB dip
  // NOTE: cos²/sin² was removed because P = cos⁴+sin⁴ still dips to 0.5 (-3dB)
  // Equal power requires g_wet = sin(θ), g_dry = cos(θ) so that g²_wet + g²_dry = 1
  if (_effectsState.delay.enabled) {
    // Cancel previous automation to prevent InvalidStateError (P.5)
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    const { dryCurve, wetCurve } = createEqualPowerCurve(Math.ceil(audioContext.sampleRate * CROSSFADE_TAU));
    wetGain.gain.setValueCurveAtTime(wetCurve, t, CROSSFADE_TAU);
    dryGain.gain.setValueCurveAtTime(dryCurve, t, CROSSFADE_TAU);
  } else {
    // Bypass delay
    wetGain.gain.cancelScheduledValues(t);
    dryGain.gain.cancelScheduledValues(t);
    wetGain.gain.setTargetAtTime(0, t, CROSSFADE_TAU);
    dryGain.gain.setTargetAtTime(1, t, CROSSFADE_TAU);
  }
  
  // Send delay parameters to worklet (popup sends delayTime in ms, feedback/mix in 0-100)
  audioChain.delay.port.postMessage({
    type: 'SET_DELAY',
    delayTime: (_effectsState.delay.delayTime || 0) / 1000,
    feedback: (_effectsState.delay.feedback || 0) / 100,
    mix: (_effectsState.delay.mix || 0) / 100,
    sampleRate: audioContext.sampleRate
  });
}

// === Centralized effect message handler (used by both onMessage and port) ===
function _handleEffectMessage(message) {
  if (message.type === '_SSA_SET_COMPRESSOR') {
    _updateCompressor({ enabled: message.active, ...message.params });
  } else if (message.type === '_SSA_SET_LIMITER') {
    _updateLimiter({ enabled: message.active, ...message.params });
  } else if (message.type === '_SSA_SET_EQ') {
    _updateEQ({ enabled: message.active, ...message.params });
  } else if (message.type === '_SSA_SET_DELAY') {
    _updateDelay({ enabled: message.active, ...message.params });
  }
}

function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    // Silently ignore — background may be dead during SW restart, popup disconnected, etc.
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === '_OFFSCREEN_START') {
    currentCaptureSource = message.captureSource || 'tab';
    const streamId = message.tabStreamId || null;
    startCapture(currentCaptureSource, streamId).then(sendResponse);
    return true;
  }
  
  if (message.type === '_OFFSCREEN_STOP') {
    stopCapture().then(sendResponse);
    return true;
  }
  
  // Effect controls — popup sends { type, active, params }
  // offscreen receives active as top-level field, params nested
  // Effect controls — popup sends { type, active, params }
  // offscreen receives active as top-level field, params nested
  if (message.type === '_SSA_SET_COMPRESSOR' || message.type === '_SSA_SET_LIMITER' ||
      message.type === '_SSA_SET_EQ' || message.type === '_SSA_SET_DELAY') {
    log.info('Effect received:', message.type, message);
    _handleEffectMessage(message);
    sendResponse({ ok: true });
    return false;
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
  
  // P.6: Popup ready — establish direct port
  if (message.type === '_SSA_POPUP_READY') {
    log.info('P.6: Popup ready signal received');
    _ensurePopupPort();
    sendResponse({ ok: true });
    return false;
  }
  
  return false;
});

async function startCapture(source, tabStreamId) {
  try {
    if (mediaStream) return { ok: true, alreadyActive: true };
    
    let streamOptions;
    
    // P.4: Load saved effect settings from chrome.storage (self-loading)
    // This eliminates the need for popup to send settings via setTimeout.
    // Settings are loaded asynchronously and applied when audioChain.ready = true.
    _loadEffectsFromStorage();
    
    // Start offscreen→BG keepalive to prevent SW sleep
    // SW wake threshold ~30-60s, ping every 10s to keep BG alive
    _keepaliveTimer = setInterval(() => {
      chrome.runtime.sendMessage({ type: '_OFFSCREEN_KEEPALIVE' }, () => {
        if (chrome.runtime.lastError) {
          // BG is dead — stop pinging
          clearInterval(_keepaliveTimer);
          _keepaliveTimer = null;
        }
      });
    }, 10000); // 10s — well under SW 30s lifetime
    
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
        // Tab audio + microphone
        // getDisplayMedia will prompt user to share tab with audio
        try {
          mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1, height: 1, displaySurface: 'browser' },
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false
            }
          });
          
          // Now also get microphone
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100
            }
          });
          
          // Combine: create a new stream with tab + mic tracks
          const combinedStream = new MediaStream();
          mediaStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
          micStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
          
          // Stop mic stream (tracks are already added)
          micStream.getTracks().forEach(t => t.stop());
          mediaStream = combinedStream;
        } catch (err) {
          if (err.name === 'NotAllowedError') {
            return { ok: false, error: 'Capture denied by user' };
          }
          safeSendMessage({
            type: '_OFFSCREEN_ERROR',
            error: 'Combined capture failed: ' + err.message
          });
          return { ok: false, error: 'combined_capture_failed' };
        }
        break;
      }
      
      case 'tab':
      default: {
        // Tab audio only (default)
        // Use getDisplayMedia with audio (replaces tabCapture API removed in Chrome 123+)
        // This shows the native Chrome "Share tab audio" dialog
        try {
          mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 1, height: 1, displaySurface: 'browser' },
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false
            }
          });
          
          // User may have shared screen without audio - try to get tab audio only
          if (mediaStream.getAudioTracks().length === 0) {
            safeSendMessage({
              type: '_OFFSCREEN_ERROR',
              error: 'Please enable "Share tab audio" in the dialog'
            });
            mediaStream.getTracks().forEach(t => t.stop());
            cleanup();
            return { ok: false, error: 'no_tab_audio' };
          }
        } catch (getDisplayErr) {
          // getDisplayMedia may fail if user cancels or if extension context
          if (getDisplayErr.name === 'NotAllowedError') {
            return { ok: false, error: 'Tab capture denied by user' };
          }
          safeSendMessage({
            type: '_OFFSCREEN_ERROR',
            error: 'getDisplayMedia failed: ' + getDisplayErr.message
          });
          return { ok: false, error: 'getDisplay_media_failed' };
        }
        break;
      }
    }
    
    const audioTracks = mediaStream.getAudioTracks();
    
    // Guard: stream must be active — if false, user cancelled or permission denied
    if (!mediaStream.active) {
      safeSendMessage({
        type: '_OFFSCREEN_ERROR',
        error: 'Stream inactive — please grant permission in the dialog'
      });
      mediaStream.getTracks().forEach(t => t.stop());
      cleanup();
      return { ok: false, error: 'stream_inactive' };
    }
    
    if (audioTracks.length === 0) {
      safeSendMessage({
        type: '_OFFSCREEN_ERROR',
        error: 'No audio tracks — make sure to check "Share tab audio"'
      });
      cleanup();
      return { ok: false, error: 'no_audio_tracks' };
    }
    
    // === DYNAMIC SAMPLE RATE SYNC (Step 3) ===
    // Match AudioContext sampleRate to the input track to eliminate SRC (Sample Rate Conversion)
    // SRC is the primary cause of DC offset and subsonic artifacts in tab capture
    let targetSampleRate = 44100; // Fallback — Chrome's internal default
    try {
      const audioTrack = audioTracks[0];
      if (audioTrack.getSettings) {
        const settings = audioTrack.getSettings();
        if (settings.sampleRate && settings.sampleRate > 0) {
          targetSampleRate = settings.sampleRate;
        }
      }
    } catch (e) {
      // getSettings() not available in all browsers (e.g., older Chrome, screen capture APIs)
      log.info('getSettings() not available — using default sampleRate:', targetSampleRate);
    }
    
    // Create AudioContext at the track's native sampleRate — zero SRC = zero DC offset
    audioContext = new AudioContext({ sampleRate: targetSampleRate });
    log.info(`AudioContext initialized at ${targetSampleRate}Hz (match input track)`);
    
    const audioSource = audioContext.createMediaStreamSource(mediaStream);
    
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    await audioContext.audioWorklet.addModule(workletPath);
    
    const workletNode = new AudioWorkletNode(audioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,       // Fixed to 2 channels (L/R) — no dynamic reconfiguration
      channelCountMode: 'explicit', // Explicit mode: channelCount is strictly enforced
      channelInterpretation: 'discrete' // No automatic spatial mixing — L/R preserved independently
    });
    
    // === Phase Protocol: Vector Crossfading Audio Graph ===
    // All effects use Wet/Dry GainNode pairs with exponential smoothing (τ=15ms)
    // No connect()/disconnect() during runtime — only gain automation
    
    // NOTE: Since Sample Rate Sync (Step 3), audioContext.sampleRate === track.sampleRate
    // No SRC → no gain shift → no compensation needed. effectGainNode = unity gain.
    // masterGain corrected from 0.5 to 1.0 — bypass effects now report correct RMS/bands
    const effectGainNode = audioContext.createGain();
    effectGainNode.gain.value = 1.0; // Unity gain — no SRC compensation needed
    
    // === Compressor stage: Wet/Dry crossfading ===
    const compressorNode = audioContext.createDynamicsCompressor();
    compressorNode.ratio.value = 1;
    compressorNode.threshold.value = -100;
    compressorNode.knee.value = 0;
    compressorNode.attack.value = 0.003; // 3ms default attack (was 0 — caused unstable behaviour)
    compressorNode.release.value = 0.250; // 250ms default release (was 0 — compressed to 1.0s by processor)
    
    const compressorWetGain = audioContext.createGain();
    compressorWetGain.gain.value = 0; // Silent initially — handled by Silent Masking phase
    const compressorDryGain = audioContext.createGain();
    compressorDryGain.gain.value = 1; // Silent initially — handled by Silent Masking phase
    
    // === DC Blocker: 20Hz High-Pass Filter (H(z) = (1-αz⁻¹)/(1-z⁻¹)) ===
    // Always in chain — removes DC offset and subsonic rumble
    // α = e^(-2π·fc/fs) where fc=20Hz, fs=sampleRate
    const dcBlocker = audioContext.createBiquadFilter();
    dcBlocker.type = 'highpass';
    dcBlocker.frequency.value = 20; // 20Hz cutoff — standard DC blocker
    dcBlocker.Q.value = 0.707; // Butterworth response for flat passband
    
    // === EQ stage: LPF + Peaking with Wet/Dry crossfading ===
    const lpfNode = audioContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 22050; // Nyquist — effectively bypassed initially
    
    const peakingNode = audioContext.createBiquadFilter();
    peakingNode.type = 'peaking';
    peakingNode.frequency.value = 1000; // 1kHz center
    peakingNode.gain.value = 0; // 0dB — bypassed initially
    peakingNode.Q.value = 1;
    
    const peakingWetGain = audioContext.createGain();
    peakingWetGain.gain.value = 0; // Silent initially
    const peakingDryGain = audioContext.createGain();
    peakingDryGain.gain.value = 1; // Silent initially
    
    // === Delay stage: Wet/Dry crossfading ===
    const delayWorkletPath = chrome.runtime.getURL('dsp-engine/delay-processor.js');
    await audioContext.audioWorklet.addModule(delayWorkletPath);
    
    const delayNode = new AudioWorkletNode(audioContext, 'delay-effect', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,       // Fixed to 2 channels — explicit mode prevents runtime channel count changes
      channelCountMode: 'explicit', // Strict enforcement of channelCount = 2
      channelInterpretation: 'discrete' // L/R channels processed independently
    });
    
    // Send sample rate to delay processor for accurate delay calculation
    delayNode.port.postMessage({ sampleRate: audioContext.sampleRate });
    
    const delayWetGain = audioContext.createGain();
    delayWetGain.gain.value = 0; // Silent initially
    const delayDryGain = audioContext.createGain();
    delayDryGain.gain.value = 1; // Silent initially
    
    const waveShaperNode = audioContext.createWaveShaper();
    waveShaperNode.curve = new Float32Array([0, 1]); // Linear (identity) — bypassed
    waveShaperNode.oversample = '4x'; // Always on: prevents aliasing from soft-clipping harmonics above Nyquist
    
    // Master gain for graceful shutdown (ramp to 0 before close)
    // Unity gain (1.0): Wet/Dry crossfades sum to 1.0 mathematically
    const masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 1.0; // Unity gain — correct reference level
    
    // Store effect references in centralized audioChain object
    audioChain.compressor = compressorNode;
    audioChain.compressorWetGain = compressorWetGain;
    audioChain.compressorDryGain = compressorDryGain;
    audioChain.dcBlocker = dcBlocker;
    audioChain.lpf = lpfNode;
    audioChain.peaking = peakingNode;
    audioChain.peakingWetGain = peakingWetGain;
    audioChain.peakingDryGain = peakingDryGain;
    audioChain.delay = delayNode;
    audioChain.delayWetGain = delayWetGain;
    audioChain.delayDryGain = delayDryGain;
    audioChain.waveShaper = waveShaperNode;
    audioChain.effectGain = effectGainNode;
    audioChain.masterGain = masterGainNode;
    audioChain.source = audioSource;
    
    // === Vector Crossfading Routing (fixed, no runtime connect/disconnect) ===
    // Compressor stage: BOTH paths always connected, gain crossfades determine path
    compressorNode.connect(compressorWetGain);
    compressorNode.connect(compressorDryGain);
    audioSource.connect(compressorNode);
    
    // Compressor Wet/Dry → DC Blocker → LPF+Peaking
    compressorWetGain.connect(dcBlocker);
    compressorDryGain.connect(dcBlocker);
    
    // DC Blocker → LPF+Peaking (Wet/Dry routing after HPF)
    dcBlocker.connect(lpfNode);
    lpfNode.connect(peakingNode);
    peakingNode.connect(peakingWetGain);
    peakingNode.connect(peakingDryGain);
    
    // Peaking Wet/Dry → Delay
    // Wet path: peaking → delayNode → delayWetGain
    peakingWetGain.connect(delayNode);
    delayNode.connect(delayWetGain);
    // Dry path: peaking → delayDryGain (bypasses delayNode completely)
    peakingDryGain.connect(delayDryGain);

    // Delay Wet/Dry → waveShaper(limiter) → master → output
    delayWetGain.connect(waveShaperNode);
    delayDryGain.connect(waveShaperNode);
    waveShaperNode.connect(effectGainNode);
    effectGainNode.connect(masterGainNode);
    
    // Analysis tap: signal BEFORE effects (input level, always active)
    const analysisTap = audioContext.createGain();
    analysisTap.gain.value = 1;
    audioSource.connect(analysisTap);
    analysisTap.connect(workletNode);
    audioChain.analysisTap = analysisTap;

    // === P.1 CRITICAL: Connect graph to destination ===
    // Web Audio API uses Pull-Model — without destination, rendering stops,
    // audioContext.currentTime freezes, worklet metrics stop, automation freezes.
    // Even if output is muted, a connected destination is required for the graph
    // to keep processing. masterGain is already at unity (1.0).
    masterGainNode.connect(audioContext.destination);
    
    // Legacy toggle (kept for backward compat)
    window._ssaSetEffectsActive = function(active) {
      // No-op: effects are now controlled per-node via parameters
    };
    
    // Save reference at module level so DSP timer can access it
    // (let declarations in async function are NOT visible to module-level vars)
    audioChain.worklet = workletNode;
    
    // Save reference in closure to prevent race with cleanup()
    const savedAudioContext = audioContext;
    
    // === Phase 1: Silent Masking ===
    // All gain nodes already at initial values (wet=0, dry=1 for effects; master=0)
    // workletNode connected but METRICS suppressed in onmessage handler
    isSilentMaskingActive = true;
    
    // Set master gain to 0 initially (silent)
    audioChain.masterGain.gain.value = 0;
    
    // === Phase 2: Warm-up (100ms) ===
    // Fill delay lines, stabilize IIR filter coefficients, decay transient processes
    // AudioContext must be in 'running' state during warm-up
    await audioContext.resume();
    audioChain.ready = true;
    const warmUpDuration = 100; // ms — ~3840 samples at 48kHz
    await new Promise(resolve => setTimeout(resolve, warmUpDuration));
    
    // Apply saved effect states (may have been updated before capture started)
    _updateCompressor({});
    _updateEQ({});
    _updateLimiter({});
    _updateDelay({});
    
    // === Phase 3: Gradual Ramp-Up ===
    // Smooth transition: setTargetAtTime with τ=15ms for all gain nodes
    const ctx = audioContext;
    const t = ctx.currentTime;
    
    // Enable METRICS (end Silent Masking)
    isSilentMaskingActive = false;
    
    // Master gain: 0→1.0 with exponential smoothing (starts audio signal)
    // Target matches initial masterGainNode.gain.value for consistency
    audioChain.masterGain.gain.setTargetAtTime(1.0, t, CROSSFADE_TAU);
    
    // Start DSP time polling: request DSP time from worklet every 2s
    _dspTimeTimer = setInterval(() => {
      if (!audioChain.worklet || !audioChain.worklet.port) return;
      audioChain.worklet.port.postMessage({ type: 'REQUEST_DSP_TIME' });
    }, 2000);
    
    // Drop detection: poll MediaStream active state (reliable in MV3)
    // AudioContext.statechange is unreliable in offscreen docs — state stays 'running'
    // when user stops sharing. MediaStream.active=false fires reliably.
    // Start monitor IMMEDIATELY — we only reach here AFTER user granted permission
    _streamMonitorStopped = false;
    _lastStreamActiveState = mediaStream.active; // Capture initial state synchronously
    
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
      // During Silent Masking phase, suppress METRICS to prevent uncalibrated data
      // Metrics are only sent after Warm-up phase completes and master gain ramps up
      if (event.data.type === 'METRICS' && audioChain.ready && !isSilentMaskingActive) {
        _metricsCounter++;
        lastMetrics = event.data;
        lastMetrics.audioDrops = audioDropCount;
        _lastWorkletTimestamp = event.data.timestamp || Date.now();
        
        // Log first 5 frames for debugging (RMS + bands)
        if (_metricsCounter <= 5) {
          log.info('Frame', _metricsCounter, 'RMS:', event.data.rms.toFixed(4), 'Peak:', event.data.peakRMS.toFixed(4), 'Bands[B/M/T]:', event.data.bass.toFixed(1), event.data.mid.toFixed(1), event.data.treble.toFixed(1));
        }
        
        // P.6: Send metrics directly to popup via port (bypass background relay)
        const sentToPopup = _sendToPopup({ type: 'METRICS', ...event.data });
        if (!sentToPopup && _metricsCounter <= 10) {
          log.info('P.6: Popup not connected yet, will receive via background relay');
        }
        
        // Background relay still needed for persistence/queuing
        safeSendMessage({ type: '_OFFSCREEN_METRICS', data: event.data });
        // Log every 1000 messages to avoid killing SW
        if (_metricsCounter % 1000 === 0) {
          log.info('Metrics sent:', _metricsCounter);
        }
      }
      
      // Handle DSP time reports from AudioWorklet
      if (event.data.type === 'DSP_TIME_REPORT') {
        const dspTime = event.data.dspTime || 0;
        // Calculate latency: time between worklet processing and now
        const latency = _lastWorkletTimestamp > 0
          ? Date.now() - _lastWorkletTimestamp
          : 0;
        log.info(`DSP time: ${dspTime.toFixed(2)}ms, round-trip: ${latency.toFixed(1)}ms`);
        safeSendMessage({
          type: '_DEBUG_METRICS',
          dspTime: dspTime,
          latency: latency
        });
      }
    };
    
    // Monitor AudioContext state for drops (secondary to stream polling)
    // statechange is unreliable in offscreen docs but may still fire in some cases
    _contextStateChangeHandler = () => {
      const ctx = savedAudioContext;
      if (!ctx || ctx.state === 'closed') return;
      const newState = ctx.state;
      const now = Date.now();
      
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
    };
    audioContext.addEventListener('statechange', _contextStateChangeHandler);
    
    // Fallback: track 'ended' events (triggers full stop)
    mediaStream.getTracks().forEach(track => {
      const endedHandler = () => {
        log.info(`Track ended: ${track.kind}/${track.label}`);
        scheduleCleanup();
      };
      _trackEndedListeners.set(track, endedHandler);
      track.addEventListener('ended', endedHandler);
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
  
  // === Graceful Teardown: Master gain ramp-down (15ms) ===
  // Prevents audible click when closing AudioContext
  if (audioChain.masterGain && audioContext) {
    try {
      audioChain.masterGain.gain.setTargetAtTime(0, audioContext.currentTime, CROSSFADE_TAU);
    } catch (_) {}
  }
  
  // Wait for graceful ramp-down before full cleanup
  setTimeout(() => {
    _performCleanup();
  }, 20);
}

function _performCleanup() {
  // Stop DSP time polling
  if (_dspTimeTimer) {
    clearInterval(_dspTimeTimer);
    _dspTimeTimer = null;
  }
  
  // P.6: Clean up direct port to popup
  if (_popupPort) {
    try { _popupPort.disconnect(); } catch (_) {}
    _popupPort = null;
  }
  if (_popupConnectTimer) {
    clearTimeout(_popupConnectTimer);
    _popupConnectTimer = null;
  }
  
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
  
  // === Audio graph teardown: disconnect all nodes AFTER ramp-down ===
  // This ensures V8 garbage collector can immediately reclaim AudioNode objects
  try {
    // Disconnect delay worklet (has custom processor)
    if (audioChain.delay) {
      audioChain.delay.disconnect();
      audioChain.delay.port.close();
      audioChain.delay.port.onmessage = null; // Critical for GC
    }
    
    // Disconnect worklet node and clear message handler
    if (audioChain.worklet) {
      audioChain.worklet.disconnect();
      audioChain.worklet.port.close();
      audioChain.worklet.port.onmessage = null; // Critical for GC
    }
    
    // Disconnect entire chain in reverse order (output → input)
    if (audioChain.waveShaper) audioChain.waveShaper.disconnect();
    if (audioChain.effectGain) audioChain.effectGain.disconnect();
    if (audioChain.masterGain) audioChain.masterGain.disconnect();
    if (audioChain.delayWetGain) audioChain.delayWetGain.disconnect();
    if (audioChain.delayDryGain) audioChain.delayDryGain.disconnect();
    if (audioChain.peakingWetGain) audioChain.peakingWetGain.disconnect();
    if (audioChain.peakingDryGain) audioChain.peakingDryGain.disconnect();
    if (audioChain.dcBlocker) audioChain.dcBlocker.disconnect();
    if (audioChain.analysisTap) audioChain.analysisTap.disconnect();
    if (audioChain.compressor) audioChain.compressor.disconnect();
    if (audioChain.compressorWetGain) audioChain.compressorWetGain.disconnect();
    if (audioChain.compressorDryGain) audioChain.compressorDryGain.disconnect();
    if (audioChain.source) audioChain.source.disconnect();
  } catch (_) {}
  
  // Clear effects chain references — reset to clean bypass state
  audioChain.compressor = null;
  audioChain.compressorWetGain = null;
  audioChain.compressorDryGain = null;
  audioChain.dcBlocker = null;
  audioChain.lpf = null;
  audioChain.peaking = null;
  audioChain.peakingWetGain = null;
  audioChain.peakingDryGain = null;
  audioChain.delay = null;
  audioChain.delayWetGain = null;
  audioChain.delayDryGain = null;
  audioChain.analysisTap = null;
  audioChain.waveShaper = null;
  audioChain.effectGain = null;
  audioChain.masterGain = null;
  audioChain.source = null;
  audioChain.worklet = null;
  audioChain.ready = false;
  
  // Clear legacy references too (for backward compat)
  window._ssaWorkletNode = null;
  window._ssaCompressor = null;
  window._ssaHPF = null;
  window._ssaLPF = null;
  window._ssaPeaking = null;
  window._ssaDelay = null;
  window._ssaWaveShaper = null;
  window._ssaBypassGainNode = null;
  window._ssaEffectGainNode = null;
  window._ssaGainNode = null;
  // CRITICAL: Clean up _ssaSetEffectsActive (never cleaned before)
  window._ssaSetEffectsActive = null;
  
  // REMOVE track.ended listeners to prevent memory leaks
  _trackEndedListeners.forEach((listener, track) => {
    try { track.removeEventListener('ended', listener); } catch (_) {}
  });
  _trackEndedListeners.clear();
  
  // REMOVE AudioContext statechange listener
  if (_contextStateChangeHandler && audioContext) {
    try { audioContext.removeEventListener('statechange', _contextStateChangeHandler); } catch (_) {}
    _contextStateChangeHandler = null;
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
