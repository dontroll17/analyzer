// offscreen.js — persistent capture context
const log = (self.__logger?.forModule('offscreen')) || {
  debug: () => {}, info: () => {}, warn: (m, ...a) => console.warn('[OFFSCREEN]', m, ...a),
  error: (m, ...a) => console.error('[OFFSCREEN]', m, ...a),
};

// Centralized audio chain state (replaces window._ssaX to prevent race conditions)
const audioChain = {
  compressor: null,
  hpf: null,
  lpf: null,
  peaking: null,
  delay: null,
  waveShaper: null,
  effectGain: null,
  bypassGain: null,
  source: null,
  worklet: null,
  ready: false
};

let mediaStream = null;
let _metricsCounter = 0;
let audioContext = null;
let cleanupScheduled = false;
let lastMetrics = null;
let currentCaptureSource = 'tab'; // 'tab' | 'mic' | 'combined'

// Effects chain state (C.3.1 + C.3.2 + C.3.3 + C.3.4 + C.3.5)
let _effectsState = {
  compressor: { enabled: false, threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.250 },
  limiter: { enabled: false, threshold: -1, attack: 0.001, release: 0.1 },
  eq: {
    hpf: { enabled: false, frequency: 20 },
    lpf: { enabled: false, frequency: 22050 },
    peaking: { enabled: false, frequency: 1000, gain: 0, Q: 1 }
  },
  delay: { delayTime: 0, feedback: 0, mix: 0 }
};

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

// Suppress runtime.lastError spam when background is unavailable
const MAX_SAFE_SEND_LOGS = 5; // Log first N errors, then silence
let _safeSendErrorCount = 0;
let _safeSendLastLogged = 0;

// Track per-track ended listeners for proper cleanup (prevent memory leaks)
const _trackEndedListeners = new Map(); // track -> listenerFn mapping

// Reference to audioContext statechange listener for cleanup
let _contextStateChangeHandler = null;

// C.3.2: Update compressor settings
function _updateCompressor(params) {
  if (!audioChain.ready || !audioChain.compressor) return;
  
  const comp = audioChain.compressor;
  if (params.enabled !== undefined) {
    _effectsState.compressor.enabled = params.enabled;
    // Toggle: ratio=1 (bypass) vs ratio=params.ratio (active)
    if (params.enabled) {
      comp.ratio.value = params.ratio !== undefined ? params.ratio : 12;
    } else {
      comp.ratio.value = 1; // bypass
    }
  }
  if (params.threshold !== undefined) comp.threshold.value = params.threshold;
  if (params.knee !== undefined) comp.knee.value = params.knee;
  if (params.ratio !== undefined && _effectsState.compressor.enabled) {
    comp.ratio.value = params.ratio;
  }
  // attack/release are in ms from UI, but AudioParam expects seconds [0, 1]
  if (params.attack !== undefined) comp.attack.value = params.attack / 1000;
  if (params.release !== undefined) comp.release.value = params.release / 1000;
}

// C.3.3: Soft-clipping limiter curve (4x oversample)
function createLimiterCurve(thresholdDb, oversampleRate) {
  // Convert dB threshold to linear
  const threshold = Math.pow(10, thresholdDb / 20);
  const samples = 441 * oversampleRate; // 10ms at oversampled rate
  const curve = new Float32Array(samples);
  
  // Soft-knee: smooth transition at threshold
  const knee = 0.05; // ±0.05 linear range
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2 / samples) - 1; // -1 to 1
    let y;
    
    if (Math.abs(x) > threshold + knee) {
      // Hard limiting beyond knee
      y = threshold + Math.sign(x) * (Math.abs(x) - threshold) * 0.1;
    } else if (Math.abs(x) > threshold - knee) {
      // Soft clipping region
      const t = (Math.abs(x) - (threshold - knee)) / (2 * knee); // 0-1
      y = Math.sign(x) * (threshold - knee + t * t * knee);
    } else {
      // Pass-through below knee
      y = x;
    }
    
    // Clamp to avoid DC offset
    curve[i] = Math.max(-1, Math.min(1, y));
  }
  
  // Final sample must mirror first for smooth interpolation
  curve[curve.length - 1] = -curve[0];
  
  return curve;
}

// C.3.3: Update limiter settings
function _updateLimiter(params) {
  if (!audioChain.ready || !audioChain.waveShaper) return;
  
  const ws = audioChain.waveShaper;
  const threshold = params.threshold !== undefined ? params.threshold : _effectsState.limiter.threshold;
  
  if (params.enabled !== undefined) _effectsState.limiter.enabled = params.enabled;
  if (params.enabled && _effectsState.limiter.enabled) {
    ws.curve = createLimiterCurve(threshold, 4);
    ws.oversample = '4x';
  } else {
    ws.curve = new Float32Array([0, 1]);
    ws.oversample = 'none';
  }
  
  if (params.threshold !== undefined) {
    _effectsState.limiter.threshold = threshold;
    if (_effectsState.limiter.enabled) ws.curve = createLimiterCurve(threshold, 4);
  }
  
  // NOTE: Limiter does NOT call _setEffectsActive — it's just one node in the chain
  // Routing is controlled by compressor EQ/delay toggles
}

// C.3.4: Parametric EQ update
function _updateEQ(params) {
  if (!audioChain.ready || !audioChain.hpf || !audioChain.lpf || !audioChain.peaking) return;
  
  const hpf = audioChain.hpf;
  const lpf = audioChain.lpf;
  const peak = audioChain.peaking;
  
  if (params.enabled !== undefined) {
    _effectsState.eq.enabled = params.enabled;
  }
  
  // HPF — toggle frequency: 20Hz (bypass) vs value (active)
  if (params.hpfFreq !== undefined) {
    _effectsState.eq.hpfFreq = params.hpfFreq;
    if (_effectsState.eq.enabled) {
      hpf.frequency.value = params.hpfFreq;
    } else {
      hpf.frequency.value = 20; // bypass
    }
  }
  
  // LPF — toggle frequency: 22050Hz (bypass) vs value (active)
  if (params.lpfFreq !== undefined) {
    _effectsState.eq.lpfFreq = params.lpfFreq;
    if (_effectsState.eq.enabled) {
      lpf.frequency.value = params.lpfFreq;
    } else {
      lpf.frequency.value = 22050; // bypass
    }
  }
  
  // Peaking gain — toggle: 0dB (bypass) vs value (active)
  if (params.peakFreq !== undefined) {
    _effectsState.eq.peakFreq = params.peakFreq;
    if (_effectsState.eq.enabled) peak.frequency.value = params.peakFreq;
  }
  if (params.peakGain !== undefined) {
    _effectsState.eq.peakGain = params.peakGain;
    if (_effectsState.eq.enabled) {
      peak.gain.value = params.peakGain;
    } else {
      peak.gain.value = 0; // bypass
    }
  }
  if (params.peakQ !== undefined) {
    _effectsState.eq.peakQ = params.peakQ;
    if (_effectsState.eq.enabled) peak.Q.value = params.peakQ;
  }
}

// C.3.5: Delay update
function _updateDelay(params) {
  if (!audioChain.ready || !audioChain.delay) return;
  
  if (params.enabled !== undefined) {
    _effectsState.delay.enabled = params.enabled;
  }
  
  if (params.delayTime !== undefined) {
    // popup sends delayTime in ms (0-1000), delay-processor expects seconds
    audioChain.delay.port.postMessage({ type: 'SET_DELAY', delayTime: params.delayTime / 1000 });
    _effectsState.delay.delayTime = params.delayTime;
  }
  if (params.feedback !== undefined) {
    audioChain.delay.port.postMessage({ type: 'SET_DELAY', feedback: params.feedback / 100 });
    _effectsState.delay.feedback = params.feedback;
  }
  if (params.mix !== undefined) {
    audioChain.delay.port.postMessage({ type: 'SET_DELAY', mix: params.mix / 100 });
    _effectsState.delay.mix = params.mix;
    // mix=0 = bypass, mix>0 = active
    const actualMix = _effectsState.delay.enabled ? params.mix / 100 : 0;
    audioChain.delay.port.postMessage({ type: 'SET_DELAY', mix: actualMix });
  }
}

function safeSendMessage(msg) {
  chrome.runtime.sendMessage(msg, () => {
    if (chrome.runtime.lastError) {
      // Log first N errors then throttle to prevent log spam during SW cycles
      const now = Date.now();
      if (_safeSendErrorCount < MAX_SAFE_SEND_LOGS && (now - _safeSendLastLogged > 5000)) {
        _safeSendLastLogged = now;
        _safeSendErrorCount++;
        log.warn(`safeSendMessage error #${_safeSendErrorCount}:`, chrome.runtime.lastError.message);
      }
    }
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
  if (message.type === '_SSA_SET_COMPRESSOR') {
    _updateCompressor({ enabled: message.active, ...message.params });
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === '_SSA_SET_LIMITER') {
    _updateLimiter({ enabled: message.active, ...message.params });
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === '_SSA_SET_EQ') {
    _updateEQ({ enabled: message.active, ...message.params });
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === '_SSA_SET_DELAY') {
    _updateDelay({ enabled: message.active, ...message.params });
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
  
  return false;
});

async function startCapture(source, tabStreamId) {
  try {
    if (mediaStream) return { ok: true, alreadyActive: true };
    
    let streamOptions;
    
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
            audio: true
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
            audio: true
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
    
    // C.3.1: Create effects chain
    // Default: source → bypassGain → worklet
    // Active: source → compressor → hpf → lpf → peaking → delay → waveShaper → effectGain → worklet
    const effectGainNode = audioContext.createGain(); // gain after effects chain
    
    // Create effect nodes (all bypassed by default via parameters)
    const compressorNode = audioContext.createDynamicsCompressor();
    // Compressor: set ratio=1 to effectively bypass
    compressorNode.ratio.value = 1;
    
    const hpfNode = audioContext.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = 20; // 20Hz — effectively bypassed
    
    const lpfNode = audioContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 22050; // Nyquist — effectively bypassed
    
    const peakingNode = audioContext.createBiquadFilter();
    peakingNode.type = 'peaking';
    peakingNode.frequency.value = 1000; // 1kHz center
    peakingNode.gain.value = 0; // 0dB — bypassed
    peakingNode.Q.value = 1;
    
    // C.3.5: Custom delay effect via AudioWorkletProcessor
    const delayWorkletPath = chrome.runtime.getURL('dsp-engine/delay-processor.js');
    await audioContext.audioWorklet.addModule(delayWorkletPath);
    
    const delayNode = new AudioWorkletNode(audioContext, 'delay-effect', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });
    
    const waveShaperNode = audioContext.createWaveShaper();
    waveShaperNode.curve = new Float32Array([0, 1]); // Linear (identity) — bypassed
    waveShaperNode.oversample = 'none';
    
    // Bypass gain (always connected)
    const bypassGainNode = audioContext.createGain();
    bypassGainNode.gain.value = 1;
    
    // Store effect references in centralized audioChain object
    audioChain.compressor = compressorNode;
    audioChain.hpf = hpfNode;
    audioChain.lpf = lpfNode;
    audioChain.peaking = peakingNode;
    audioChain.delay = delayNode;
    audioChain.waveShaper = waveShaperNode;
    audioChain.effectGain = effectGainNode;
    audioChain.bypassGain = bypassGainNode;
    audioChain.source = audioSource;
    
    // P.2: Create master normalization gain to compensate for dual-path summation
    // When both bypassGain and effectGain carry identical signal (effects bypassed),
    // direct connection to workletNode sums both → +6dB → potential clipping.
    // masterGainNode with gain=0.5 normalizes the summed signal.
    const masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0.5; // Compensate +6dB from dual-path summation
    audioChain.masterGain = masterGainNode;
    
    // Effects chain (internal node connections — all bypassed by default)
    compressorNode.connect(hpfNode);
    hpfNode.connect(lpfNode);
    lpfNode.connect(peakingNode);
    peakingNode.connect(delayNode);
    delayNode.connect(waveShaperNode);
    waveShaperNode.connect(effectGainNode);
    
    // P.2: Normalize dual-path summation through masterGain
    bypassGainNode.connect(masterGainNode);
    effectGainNode.connect(masterGainNode);
    masterGainNode.connect(workletNode);
    
    // Source connects to both bypass and effects chain
    audioSource.connect(bypassGainNode);
    audioSource.connect(compressorNode);
    
    // Legacy toggle (kept for backward compat)
    window._ssaSetEffectsActive = function(active) {
      // No-op: effects are now controlled per-node via parameters
    };
    
    // Save reference at module level so DSP timer can access it
    // (let declarations in async function are NOT visible to module-level vars)
    audioChain.worklet = workletNode;
    
    // Save reference in closure to prevent race with cleanup()
    const savedAudioContext = audioContext;
    
    // Mark audio chain as ready (prevents race in effect update handlers)
    audioChain.ready = true;
    
    // Start DSP time polling: request DSP time from worklet every 2s
    _dspTimeTimer = setInterval(() => {
      if (!audioChain.worklet || !audioChain.worklet.port) return;
      audioChain.worklet.port.postMessage({ type: 'REQUEST_DSP_TIME' });
    }, 2000);
    
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
        _lastWorkletTimestamp = event.data.timestamp || Date.now();
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
  
  // Stop DSP time polling
  if (_dspTimeTimer) {
    clearInterval(_dspTimeTimer);
    _dspTimeTimer = null;
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
  
  // Disconnect source from all nodes before cleanup
  if (audioChain.source) {
    try {
      audioChain.source.disconnect();
    } catch (_) {}
  }
  
  // Clear effects chain references — reset to clean bypass state
  audioChain.compressor = null;
  audioChain.hpf = null;
  audioChain.lpf = null;
  audioChain.peaking = null;
  if (audioChain.delay) {
    try { audioChain.delay.disconnect(); } catch (_) {}
    audioChain.delay = null;
  }
  audioChain.waveShaper = null;
  audioChain.bypassGain = null;
  audioChain.effectGain = null;
  // P.2: Clean up master normalization gain node
  if (audioChain.masterGain) {
    try { audioChain.masterGain.disconnect(); } catch (_) {}
    audioChain.masterGain = null;
  }
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
