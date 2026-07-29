import { RMS } from '../dsp-engine/rms.js';

// ============================================
// Background port & capture state
// ============================================
let bgPort = null;
let bgMetricsHandler = null;
let captureActive = false;
let gracefulStop = false;
let isConnected = false;

// ============================================
// Theme Colors
// ============================================
const THEME_COLORS = {
  dark: {
    glitch: { GLITCH: '#f44336', DRIFT: '#FF9800', STABLE: '#4CAF50' },
    rms: { SILENCE: '#ff6b6b', LOW: '#ffa94d', MEDIUM: '#95df6c', HIGH: '#3ac7a3', CRITICAL: '#d9363e', default: '#333' },
    canvas: { bg: '#1a1a1a', grid: '#333333', oscLeft: '#2196F3', oscRight: '#f44336', timelineRef: '#333' },
    channel: { stereo: '#4CAF50', mono: '#888' }
  },
  light: {
    glitch: { GLITCH: '#E53935', DRIFT: '#FB8C00', STABLE: '#43A047' },
    rms: { SILENCE: '#ef5350', LOW: '#FFA726', MEDIUM: '#66BB6A', HIGH: '#26A69A', CRITICAL: '#D32F2F', default: '#bdbdbd' },
    canvas: { bg: '#fafafa', grid: '#e0e0e0', oscLeft: '#1E88E5', oscRight: '#E53935', timelineRef: '#e0e0e0' },
    channel: { stereo: '#43A047', mono: '#666' }
  }
};

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function tc(key) {
  return THEME_COLORS[getTheme()][key];
}

// ============================================
// DOM Elements
// ============================================
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusDiv = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');
const rmsSection = document.getElementById('rmsSection');
const rmsValue = document.getElementById('rmsValue');
const peakValue = document.getElementById('peakValue');
const rmsLevel = document.getElementById('rmsLevel');
const rmsBar = document.getElementById('rmsBar');
const freqBandsSection = document.getElementById('freqBandsSection');
const bassBar = document.getElementById('bassBar');
const midBar = document.getElementById('midBar');
const trebleBar = document.getElementById('trebleBar');
const bassValue = document.getElementById('bassValue');
const midValue = document.getElementById('midValue');
const trebleValue = document.getElementById('trebleValue');

// Oscilloscope elements
const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
const oscilloscopeCtx = oscilloscopeCanvas ? oscilloscopeCanvas.getContext('2d') : null;
const exportBtn = document.getElementById('exportBtn');
const exportLogBtn = document.getElementById('exportLogBtn');
const oscilloscopeSection = document.getElementById('oscilloscopeSection');
const timelineCanvas = document.getElementById('timelineCanvas');
const timelineCtx = timelineCanvas ? timelineCanvas.getContext('2d') : null;
const timelineSection = document.getElementById('timelineSection');
const channelIndicator = document.getElementById('channelIndicator');

// Oscilloscope option buttons
const freezeBtn = document.getElementById('freezeBtn');
const clearOscBtn = document.getElementById('clearOscBtn');
const zoomBtn = document.getElementById('zoomBtn');
const logScaleBtn = document.getElementById('logScaleBtn');
const freezeLabel = document.getElementById('freezeLabel');

// Entropy section elements
const entropySection = document.getElementById('entropySection');
const entropyValue = document.getElementById('entropyValue');
const entropyState = document.getElementById('entropyState');
const flatnessValue = document.getElementById('flatnessValue');
const entropyHint = document.getElementById('entropyHint');

// Glitch settings elements
const thresholdSlider = document.getElementById('thresholdSlider');
const thresholdValue = document.getElementById('thresholdValue');
const resetSensitivityBtn = document.getElementById('resetSensitivityBtn');
const glitchSettings = document.getElementById('glitchSettings');
const glitchStatus = document.getElementById('glitchStatus');
const glitchStateDot = document.getElementById('glitchStateDot');

// Glitch log (max 500 entries, FIFO)
const GLITCH_LOG_MAX = 500;
let glitchLog = [];
let currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };
let lastGlitchState = 'STABLE';

// Glitch timeline history
const TIMELINE_MAX = 300;
let glitchHistory = [];
let lastTimelineRecord = 0;
let CAPTURE_START_TIME = 0;

// Oscilloscope history buffers (ring buffer: Float32Array, HISTORY_SIZE=1024)
// Buffers are overwritten each frame by updateOscilloscopeFromWaveform()
// When waveform is present: set() replaces all samples
// When waveform is not (hold frame): buffers remain unchanged
const HISTORY_SIZE = 1024;
let leftChannelHistory = new Float32Array(HISTORY_SIZE);
let rightChannelHistory = new Float32Array(HISTORY_SIZE);

// Oscilloscope options state
let oscFreeze = false;
let oscZoom = false; // false = full buffer (1024), true = visible samples only
let oscLogScale = false; // false = linear, true = logarithmic Y-axis

// rAF throttle for Canvas rendering
let pendingOscDraw = null;
let pendingTimelineDraw = false;
let rafScheduled = false;

// ============================================
// Performance Monitoring
// ============================================
const PERF_KEY = 'perfMonitorActive';
let perfActive = false;
let perfFrameCount = 0;
let perfLastTime = 0;
let perfDrawTimes = [];
let PERF_MAX_DRAWS = 30;

const perfMonitorHeader = document.getElementById('perfMonitorHeader');
const perfMonitor = document.getElementById('perfMonitor');
const perfFps = document.getElementById('perfFps');
const perfDrawTime = document.getElementById('perfDrawTime');
const perfQueue = document.getElementById('perfQueue');
const togglePerfBtn = document.getElementById('togglePerfBtn');

// Perf monitor visibility state (separate from perfActive which tracks measurement)
let perfVisible = false;

function togglePerfMonitor() {
  perfVisible = !perfVisible;
  perfActive = perfVisible; // If visible, also start measuring
  
  if (perfMonitor) {
    perfMonitor.style.display = perfVisible ? 'block' : 'none';
  }
  
  if (togglePerfBtn) {
    togglePerfBtn.textContent = perfVisible ? 'Hide' : 'Perf';
  }
  
  chrome.storage.local.set({ [PERF_KEY]: perfVisible });
  
  // Start rAF loop when enabling
  if (perfVisible && !perfRunning) {
    requestAnimationFrame(perfFrameLoop);
  }
}

function updatePerfDisplay(fps, drawMs, queueLen) {
  if (!perfActive) return;

  if (perfFps) {
    const colorClass = fps >= 50 ? 'perf-good' : fps >= 25 ? 'perf-warn' : 'perf-bad';
    perfFps.className = `label-sm ${colorClass}`;
    perfFps.textContent = `FPS: ${fps}`;
  }
  if (perfDrawTime) {
    const colorClass = drawMs < 5 ? 'perf-good' : drawMs < 15 ? 'perf-warn' : 'perf-bad';
    perfDrawTime.className = `label-sm ${colorClass}`;
    perfDrawTime.textContent = `Draw: ${drawMs.toFixed(1)}ms`;
  }
  if (perfQueue) {
    const colorClass = queueLen < 5 ? 'perf-good' : queueLen < 20 ? 'perf-warn' : 'perf-bad';
    perfQueue.className = `label-sm ${colorClass}`;
    perfQueue.textContent = `Queue: ${queueLen}`;
  }
}

// Performance frame loop
let perfLastFrameTime = performance.now();
let perfRunning = false;
function perfFrameLoop(timestamp) {
  if (!perfActive) {
    perfRunning = false;
    return;
  }
  if (!perfRunning) perfRunning = true;

  const delta = timestamp - perfLastFrameTime;
  perfLastFrameTime = timestamp;
  perfFrameCount++;

  // Calculate FPS every 30 frames (~0.5s)
  if (perfFrameCount % 30 === 0) {
    const fps = Math.round(1000 / (delta || 16.67));
    const avgDrawMs = perfDrawTimes.length > 0
      ? perfDrawTimes.reduce((a, b) => a + b, 0) / perfDrawTimes.length
      : 0;

    updatePerfDisplay(fps, avgDrawMs, 0);
    perfDrawTimes = [];
  }

  requestAnimationFrame(perfFrameLoop);
}

// Performance-aware draw wrapper
function perfAwareDraw(leftSamples, rightSamples) {
  const start = performance.now();
  drawOscilloscope(leftSamples, rightSamples);
  const elapsed = performance.now() - start;

  perfDrawTimes.push(elapsed);
  if (perfDrawTimes.length > PERF_MAX_DRAWS) {
    perfDrawTimes.shift();
  }
}

// Load perf monitor state on startup
chrome.storage.local.get([PERF_KEY], (result) => {
  if (result[PERF_KEY]) {
    perfVisible = true;
    perfActive = true;
    if (perfMonitor) perfMonitor.style.display = 'block';
    if (togglePerfBtn) togglePerfBtn.textContent = 'Hide';
    // Start rAF loop since it was active before
    requestAnimationFrame(perfFrameLoop);
  }
});

if (togglePerfBtn) {
  togglePerfBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePerfMonitor();
  });
}

// 30fps cap for canvas rendering (human eye can't tell 60fps on oscilloscope)
const OSC_DRAW_INTERVAL = 33;
let lastOscDrawTime = 0;

function scheduleDraws(leftBuffer, rightBuffer, needsTimelineUpdate) {
  pendingOscDraw = { left: leftBuffer, right: rightBuffer };
  if (needsTimelineUpdate) pendingTimelineDraw = true;
  
  if (rafScheduled) return;
  rafScheduled = true;
  
  requestAnimationFrame((timestamp) => {
    rafScheduled = false;
    
    if (pendingOscDraw) {
      // Throttle to ~30fps
      const now = performance.now();
      if (now - lastOscDrawTime < OSC_DRAW_INTERVAL && lastOscDrawTime > 0) {
        // Skip draw but update buffer for next frame
        // Buffer is already Float32Array — no copy overhead
      } else {
        lastOscDrawTime = now;
        if (perfActive) {
          perfAwareDraw(pendingOscDraw.left, pendingOscDraw.right);
        } else {
          drawOscilloscope(pendingOscDraw.left, pendingOscDraw.right);
        }
      }
      // CRITICAL: Release reference to prevent memory leaks
      pendingOscDraw = null;
    }
    
    if (pendingTimelineDraw) {
      if (perfActive) {
        const tStart = performance.now();
        drawTimeline();
        perfDrawTimes.push(performance.now() - tStart);
      } else {
        drawTimeline();
      }
      pendingTimelineDraw = false;
    }
  });
}

// Wrapper for oscilloscope update that uses rAF
function updateOscilloscopeWithThrottle(leftSamples, rightSamples) {
  scheduleDraws(leftSamples, rightSamples, false);
}

// Wrapper for timeline update that uses rAF
function updateTimelineWithThrottle() {
  scheduleDraws(null, null, true);
}

// Context & Streams state
let popupAudioContext = null;
let popupMediaStreamSource = null;
let popupWorkletNode = null;
let popupCaptureStream = null;

let smoothedBass = 0;
let smoothedMid = 0;
let smoothedTreble = 0;

// Функция визуализации состояния глитч-детектора (глобальная)
function updateGlitchStatus(state, count) {
  const statusEl = document.getElementById('glitchStatus');
  const countEl = document.getElementById('glitchCount');
  const dotEl = document.getElementById('glitchStateDot');
  const glitchSectionEl = document.getElementById('glitchSection');
  const colors = tc('glitch');

  if (countEl) countEl.textContent = count;
  if (!statusEl) return;

  statusEl.textContent = state;

  switch (state) {
    case 'GLITCH':
      statusEl.style.color = colors.GLITCH;
      if (dotEl) dotEl.style.background = colors.GLITCH;
      if (glitchSectionEl) glitchSectionEl.classList.add('glitch-pulse');
      if (lastGlitchState !== 'GLITCH') {
        addGlitchLogEntry(count);
      }
      break;
    case 'DRIFT':
      statusEl.style.color = colors.DRIFT;
      if (dotEl) dotEl.style.background = colors.DRIFT;
      if (glitchSectionEl) glitchSectionEl.classList.remove('glitch-pulse');
      break;
    case 'STABLE':
    default:
      statusEl.style.color = colors.STABLE;
      if (dotEl) dotEl.style.background = colors.STABLE;
      if (glitchSectionEl) glitchSectionEl.classList.remove('glitch-pulse');
      break;
  }
  lastGlitchState = state;
}

// Коэффициент сглаживания (от 0.05 до 0.3):
// Меньше = более плавно/инертно, Больше = более резко
const SMOOTHING_FACTOR = 0.15;

// Update UI state
function updateUI(connected) {
  if (connected) {
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    if (statusDiv) {
      statusDiv.textContent = 'Connected - Capturing Audio';
      statusDiv.className = 'status connected';
    }
    if (rmsSection) rmsSection.style.display = 'block';
    if (freqBandsSection) freqBandsSection.style.display = 'block';
    if (oscilloscopeSection) oscilloscopeSection.style.display = 'block';
    if (glitchSettings) glitchSettings.style.display = 'block';
    if (timelineSection) timelineSection.style.display = 'block';
    if (entropySection) entropySection.style.display = '';
    if (entropyHint) entropyHint.style.display = '';
  } else {
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    if (statusDiv) {
      statusDiv.textContent = 'Not Connected';
      statusDiv.className = 'status disconnected';
    }
    if (rmsSection) rmsSection.style.display = 'none';
    if (freqBandsSection) freqBandsSection.style.display = 'none';
    if (oscilloscopeSection) oscilloscopeSection.style.display = 'none';
    if (glitchSettings) glitchSettings.style.display = 'none';
    if (timelineSection) timelineSection.style.display = 'none';
    if (entropySection) entropySection.style.display = 'none';
    if (entropyHint) entropyHint.style.display = 'none';

    // Сброс всех сглаженных переменных и счетчиков
    smoothedBass = 0;
    smoothedMid = 0;
    smoothedTreble = 0;
    glitchLog = [];
    glitchHistory = [];
    CAPTURE_START_TIME = 0;
    lastTimelineRecord = 0;

    if (rmsValue) rmsValue.textContent = '0.0000';
    if (peakValue) peakValue.textContent = 'Peak: --';
    if (rmsLevel) rmsLevel.textContent = 'Level: --';
    if (rmsBar) rmsBar.style.width = '0%';
    
    if (bassBar) bassBar.style.width = '0%';
    if (midBar) midBar.style.width = '0%';
    if (trebleBar) trebleBar.style.width = '0%';
    
    if (glitchStatus) {
      glitchStatus.textContent = 'STABLE';
      glitchStatus.style.color = tc('glitch').STABLE;
    }
    if (glitchStateDot) {
      glitchStateDot.style.background = tc('glitch').STABLE;
    }
    if (glitchSettings) glitchSettings.classList.remove('glitch-pulse');
    if (thresholdSlider) thresholdSlider.value = 85;
    if (thresholdValue) thresholdValue.textContent = '85%';

    // Reset oscilloscope options on stop
    oscFreeze = false;
    oscZoom = false;
    saveOscOptions();
    updateOscButtonStates();

    if (entropyValue) entropyValue.textContent = '0.00';
    if (flatnessValue) flatnessValue.textContent = '0.00';
    if (entropyState) {
      entropyState.textContent = 'STABLE';
      entropyState.style.color = tc('glitch').STABLE;
    }
  }
}

function getLevelColor(level) {
  const colors = tc('rms');
  return colors[level] || colors.default;
}

function updateRMSDisplay(rmsValueNum, peakRms) {
  const rmsFormatted = rmsValueNum.toFixed(4);
  const level = RMS.classifyLevel(rmsValueNum);
  const percentage = RMS.rmsToPercentage(rmsValueNum);
  
  if (rmsValue) {
    rmsValue.textContent = rmsFormatted;
    rmsValue.style.color = getLevelColor(level);
  }
  if (peakValue && peakRms !== undefined) {
    peakValue.textContent = 'Peak: ' + peakRms.toFixed(4);
  }
  if (rmsLevel) {
    rmsLevel.textContent = 'Level: ' + level + ' (' + percentage.toFixed(1) + '%)';
  }
  if (rmsBar) {
    rmsBar.style.width = percentage + '%';
    rmsBar.style.backgroundColor = getLevelColor(level);
  }
}

function updateFrequencyBands(bass, mid, treble, maxEnergy = 1.0) {
  const isValid = (val) => typeof val === 'number' && isFinite(val) && val >= 0;
  
  const rawBass = isValid(bass) ? bass : 0;
  const rawMid = isValid(mid) ? mid : 0;
  const rawTreble = isValid(treble) ? treble : 0;

  // Формула сглаживания LERP (Linear Interpolation):
  // Current = Current + (Target - Current) * Factor
  smoothedBass += (rawBass - smoothedBass) * SMOOTHING_FACTOR;
  smoothedMid += (rawMid - smoothedMid) * SMOOTHING_FACTOR;
  smoothedTreble += (rawTreble - smoothedTreble) * SMOOTHING_FACTOR;

  const bassPercent = Math.min(100, Math.max(0, smoothedBass));
  const midPercent = Math.min(100, Math.max(0, smoothedMid));
  const treblePercent = Math.min(100, Math.max(0, smoothedTreble));

  // Обновляем ширину полос
  if (bassBar) bassBar.style.width = bassPercent + '%';
  if (midBar) midBar.style.width = midPercent + '%';
  if (trebleBar) trebleBar.style.width = treblePercent + '%';

  // Обновляем текстовые значения
  if (bassValue) bassValue.textContent = Math.round(bassPercent) + '%';
  if (midValue) midValue.textContent = Math.round(midPercent) + '%';
  if (trebleValue) trebleValue.textContent = Math.round(treblePercent) + '%';
}

function drawOscilloscope(leftBuffer, rightBuffer) {
  if (!oscilloscopeCtx || !oscilloscopeCanvas) return;

  const canvasWidth = oscilloscopeCanvas.width;
  const canvasHeight = oscilloscopeCanvas.height;
  const centerY = canvasHeight / 2;
  const colors = tc('canvas');

  oscilloscopeCtx.fillStyle = colors.bg;
  oscilloscopeCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  oscilloscopeCtx.strokeStyle = colors.grid;
  oscilloscopeCtx.lineWidth = 1;
  oscilloscopeCtx.beginPath();
  oscilloscopeCtx.moveTo(0, centerY);
  oscilloscopeCtx.lineTo(canvasWidth, centerY);
  oscilloscopeCtx.stroke();

  // Clamp values to [-1, 1] to prevent overflow
  const clamp = (v) => v > 1 ? 1 : v < -1 ? -1 : v;

  // Draw a single buffer directly (no array copy)
  const drawBuffer = (buf, color) => {
    if (!buf || buf.length === 0) return;
    oscilloscopeCtx.strokeStyle = color;
    oscilloscopeCtx.lineWidth = 1.5;
    oscilloscopeCtx.beginPath();
    
    const startIdx = oscZoom ? 0 : 0;
    const endIdx = oscZoom ? Math.min(buf.length, 256) : buf.length;
    
    for (let i = startIdx; i < endIdx; i++) {
      const x = (i / (endIdx - 1 || 1)) * canvasWidth;
      const normalized = oscLogScale
        ? Math.max(-1, Math.min(1, Math.log10(Math.abs(buf[i]) + 1e-10) / Math.log10(2) / 30))
        : clamp(buf[i]);
      const y = centerY - (normalized * centerY);
      if (i === startIdx) oscilloscopeCtx.moveTo(x, y);
      else oscilloscopeCtx.lineTo(x, y);
    }
    oscilloscopeCtx.stroke();
  };

  drawBuffer(leftBuffer, colors.oscLeft);
  drawBuffer(rightBuffer, colors.oscRight);
}

function updateOscilloscopeFromWaveform(waveform, hold, waveformRight, frozen = false) {
  // Hold frame: keep current drawing, skip update
  if (hold === true) return;
  
  // No waveform data — skip
  if (!waveform || waveform.length === 0) return;
  
  if (frozen) {
    // Freeze mode: don't update buffers, just redraw last frame
    if (leftChannelHistory.some(v => v !== 0)) {
      drawOscilloscope(leftChannelHistory, rightChannelHistory);
    }
    return;
  }
  
  if (waveformRight && waveformRight.length > 0) {
    // Stereo: separate L/R waveforms
    leftChannelHistory.set(waveform);
    rightChannelHistory.set(waveformRight);
  } else {
    // Mono: same data for both channels
    leftChannelHistory.set(waveform);
    rightChannelHistory.set(waveform);
  }
  
  // Zero out any unused samples
  if (waveform.length < HISTORY_SIZE) {
    leftChannelHistory.fill(0, waveform.length, HISTORY_SIZE);
    rightChannelHistory.fill(0, waveformRight?.length || waveform.length, HISTORY_SIZE);
  }
  
  // Pass Float32Array directly — no copy needed
  updateOscilloscopeWithThrottle(leftChannelHistory, rightChannelHistory);
}

function updateGlitchDisplay(state, count, entropy, entropyStateVal, flatness) {
  updateGlitchStatus(state, count);

  if (entropySection && entropy !== undefined) {
    entropySection.style.display = 'block';
  }
  if (entropyValue && entropy !== undefined) {
    entropyValue.textContent = entropy.toFixed(2);
  }
  if (flatnessValue !== null && flatness !== undefined) {
    flatnessValue.textContent = flatness.toFixed(2);
  }
  if (entropyState !== null && entropyStateVal) {
    entropyState.textContent = entropyStateVal;
    const colors = tc('glitch');
    switch (entropyStateVal) {
      case 'GLITCH':
        entropyState.style.color = colors.GLITCH;
        break;
      case 'DRIFT':
        entropyState.style.color = colors.DRIFT;
        break;
      case 'STABLE':
      default:
        entropyState.style.color = colors.STABLE;
        break;
    }
  }
}

function drawTimeline() {
  if (!timelineCtx || !timelineCanvas) return;

  var canvasWidth = timelineCanvas.width;
  var canvasHeight = timelineCanvas.height;
  var padding = 5;
  const colors = tc('canvas');

  timelineCtx.fillStyle = colors.bg;
  timelineCtx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (glitchHistory.length < 2) return;

  // Normalize timestamps relative to oldest point in window (prevents timeline disappearing after shift)
  const windowStart = glitchHistory[0].time;
  const windowEnd = glitchHistory[glitchHistory.length - 1].time;
  const windowDuration = windowEnd - windowStart;

  // Group consecutive points by state for batched color drawing
  var segments = [];
  var currentSegment = [];
  var currentState = null;
  
  for (var i = 0; i < glitchHistory.length; i++) {
    var point = glitchHistory[i];
    if (point.state !== currentState) {
      if (currentSegment.length > 0) {
        segments.push({ state: currentState, points: currentSegment });
      }
      currentState = point.state;
      currentSegment = [point];
    } else {
      currentSegment.push(point);
    }
  }
  if (currentSegment.length > 0) {
    segments.push({ state: currentState, points: currentSegment });
  }
  
  // Draw each segment with a single color (fewer stroke() calls)
  for (var s = 0; s < segments.length; s++) {
    var seg = segments[s];
    timelineCtx.strokeStyle = tc('glitch')[seg.state];
    timelineCtx.lineWidth = 1.5;
    timelineCtx.beginPath();
    
    for (var i = 0; i < seg.points.length; i++) {
      var point = seg.points[i];
      // Normalize X: relative to window start, not absolute time
      var x = ((point.time - windowStart) / (windowDuration || 1)) * (canvasWidth - padding * 2) + padding;
      var y = canvasHeight - padding - (point.rms * (canvasHeight - padding * 2));
      
      if (i === 0) {
        timelineCtx.moveTo(x, y);
      } else {
        timelineCtx.lineTo(x, y);
      }
    }
    timelineCtx.stroke();
  }

  // Draw 0.1 reference line
  timelineCtx.strokeStyle = colors.timelineRef;
  timelineCtx.lineWidth = 1;
  timelineCtx.setLineDash([3, 3]);
  var refY = canvasHeight - padding - (0.1 * (canvasHeight - padding * 2));
  timelineCtx.beginPath();
  timelineCtx.moveTo(padding, refY);
  timelineCtx.lineTo(canvasWidth - padding, refY);
  timelineCtx.stroke();
  timelineCtx.setLineDash([]);
}

// ============================================
// Shared metrics rendering (extracted from initAudioProcessing + updateMetricsFromOffscreen)
// ============================================

/**
 * Shared metrics renderer — dual path:
 * 1. Direct: popupWorkletNode.port.onmessage → applyMetrics (popup-initiated capture)
 * 2. Offscreen: background relay → bgPort.onMessage → applyMetrics (offscreen capture)
 *
 * @param {Object} data - METRICS payload from AudioWorklet
 * @param {number} data.rms - Root mean square energy (0–1)
 * @param {number} data.peakRMS - Peak amplitude (0–1)
 * @param {number} data.bass - Bass band percentage (0–100)
 * @param {number} data.mid - Mid band percentage (0–100)
 * @param {number} data.treble - Treble band percentage (0–100)
 * @param {number} [data.bassRight] - Right channel bass (undefined for mono)
 * @param {number} [data.midRight] - Right channel mid
 * @param {number} [data.trebleRight] - Right channel treble
 * @param {number} [data.rmsRight] - Right channel RMS
 * @param {Array} data.waveform - Left channel waveform (Float32Array, 1024 samples)
 * @param {Array} [data.waveformRight] - Right channel waveform (undefined for mono)
 * @param {boolean} [data.waveformHold] - True when waveform is throttled (skip draw)
 * @param {string} data.glitchState - STABLE / DRIFT / GLITCH
 * @param {number} data.glitchCount - Cumulative glitch counter
 * @param {number} data.entropy - Shannon entropy across 4 spectral bands
 * @param {number} data.flatness - Spectral flatness (geometric/arithmetic mean ratio)
 * @param {string} data.entropyState - Entropy classification (STABLE / DRIFT / GLITCH)
 */
function applyMetrics(data) {
  // Update current metrics state
  currentMetrics = {
    rms: data.rms,
    bass: data.bass,
    mid: data.mid,
    treble: data.treble,
    highFreqAnomaly: data.highFreqAnomaly,
    rmsRight: data.rmsRight
  };

  // Update RMS display
  updateRMSDisplay(data.rms, data.peakRMS);

  // Stereo: combine L+R for overall bands, or use mono data
  const isStereo = data.bassRight !== undefined;
  const combinedBass = isStereo
    ? (data.bass + data.bassRight) / 2
    : data.bass;
  const combinedMid = isStereo
    ? (data.mid + data.midRight) / 2
    : data.mid;
  const combinedTreble = isStereo
    ? (data.treble + data.trebleRight) / 2
    : data.treble;

  // Update channel indicator
  if (channelIndicator) {
    const chColors = tc('channel');
    channelIndicator.textContent = isStereo ? 'STEREO' : 'MONO';
    channelIndicator.style.color = isStereo ? chColors.stereo : chColors.mono;
  }

  const maxVal = Math.max(combinedBass, combinedMid, combinedTreble, 1);
  updateFrequencyBands(combinedBass, combinedMid, combinedTreble, maxVal);
  
  // Update oscilloscope (freeze handled inside updateOscilloscopeFromWaveform)
  // When frozen: keep drawing the last frame
  updateOscilloscopeFromWaveform(data.waveform, data.waveformHold, data.waveformRight, oscFreeze);

  // Glitch detection display
  updateGlitchDisplay(data.glitchState, data.glitchCount, data.entropy, data.entropyState, data.flatness);

  // Timeline recording (throttle ~5 Hz)
  if (CAPTURE_START_TIME === 0) { CAPTURE_START_TIME = Date.now(); }
  if (data.timestamp - lastTimelineRecord > 200) {
    glitchHistory.push({
      time: data.timestamp - CAPTURE_START_TIME,
      rms: data.rms,
      state: data.glitchState
    });
    lastTimelineRecord = data.timestamp;
    if (glitchHistory.length > TIMELINE_MAX) {
      glitchHistory.shift();
    }
    updateTimelineWithThrottle();
  }
}

// Инициализация Audio Processing и сквозного проброса звука
async function initAudioProcessing(stream) {
  popupCaptureStream = stream;
  
  try {
    popupAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    
    if (popupAudioContext.state === 'suspended') {
      await popupAudioContext.resume();
    }

    popupMediaStreamSource = popupAudioContext.createMediaStreamSource(stream);
    const workletPath = chrome.runtime.getURL('dsp-engine/audio-worklet.js');
    
    await popupAudioContext.audioWorklet.addModule(workletPath);

    popupWorkletNode = new AudioWorkletNode(popupAudioContext, 'audio-analyzer', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'discrete'
    });

    // 1. Источник направляем в воркет для спектрального анализа
    popupMediaStreamSource.connect(popupWorkletNode);

    // 2. ВАЖНО: Подключаем воркет (или источник) к колонкам/наушникам, 
    // чтобы не было глушения оригинального звука
    popupWorkletNode.connect(popupAudioContext.destination);

    // Named handler for proper cleanup — previous handlers lost on reassignment
    const workletMetricsHandler = (event) => {
      const data = event.data;
      if (data && data.type === 'METRICS') {
        applyMetrics(data);
      }
    };
    popupWorkletNode.port.onmessage = workletMetricsHandler;

    updateUI(true);
  } catch (error) {
    console.error('[Popup] Error initializing audio:', error);
    alert('Audio init error: ' + error.message);
    stopAudioProcessing();
  }
}

function stopAudioProcessing() {
  gracefulStop = true;
  
  glitchLog = [];
  lastGlitchState = 'STABLE';
  currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };
  
  // CRITICAL: Clear all buffers to prevent memory leaks
  leftChannelHistory.fill(0);
  rightChannelHistory.fill(0);
  
  // Clear pending draw references
  pendingOscDraw = null;
  pendingTimelineDraw = false;
  
  // Clear channel history buffers
  if (popupMediaStreamSource) {
    try { popupMediaStreamSource.disconnect(); } catch (_) {}
    popupMediaStreamSource = null;
  }
  if (popupWorkletNode) {
    try { popupWorkletNode.disconnect(); } catch (_) {}
    popupWorkletNode = null;
  }
  if (popupAudioContext) {
    if (popupAudioContext.state !== 'closed') {
      popupAudioContext.close().catch(console.error);
    }
    popupAudioContext = null;
  }
  if (popupCaptureStream) {
    popupCaptureStream.getTracks().forEach(track => track.stop());
    popupCaptureStream = null;
  }
  
  // Disconnect from background — bgPortDisconnectHandler will clean up listeners and null bgPort
  if (bgPort) {
    try {
      bgPort.disconnect();
    } catch (_) {}
    // IMPORTANT: Do NOT null bgPort here — bgPortDisconnectHandler handles it
    // Nullifying here causes race condition with onDisconnect callback
  }
  
  isConnected = false;
  captureActive = false;
  updateUI(false);
  
  // Reset flag after a short delay to prevent race condition
  setTimeout(() => { gracefulStop = false; }, 200);
}

function addGlitchLogEntry(glitchCount) {
  const entry = {
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    glitchCount: glitchCount,
    rms: currentMetrics.rms,
    bass: currentMetrics.bass,
    mid: currentMetrics.mid,
    treble: currentMetrics.treble,
    highFreqAnomaly: currentMetrics.highFreqAnomaly
  };
  glitchLog.push(entry);
  if (glitchLog.length > GLITCH_LOG_MAX) {
    glitchLog.shift();
  }
  // Entry logged silently
}

function exportGlitchLog() {
  if (glitchLog.length === 0) {
    alert('Лог глитчей пуст. Запустите захват аудио и дождитесь срабатывания детектора.');
    return;
  }
  const exportData = {
    exportDate: new Date().toISOString(),
    totalGlitches: glitchLog.length,
    maxEntries: GLITCH_LOG_MAX,
    entries: glitchLog
  };
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `glitch-log-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  let hasData = false;
  for (let i = 0; i < HISTORY_SIZE; i++) {
    if (leftChannelHistory[i] !== 0) { hasData = true; break; }
  }
  if (!hasData) {
    alert('Нет данных. Запустите захват аудио.');
    return;
  }

  var csv = 'timestamp_ms,left_channel,right_channel\n';
  var ts = Date.now();
  for (var i = 0; i < HISTORY_SIZE; i++) {
    csv += ts + ',' + leftChannelHistory[i].toFixed(6) + ',' + rightChannelHistory[i].toFixed(6) + '\n';
  }

  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'oscilloscope-' + Date.now() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sendSensitivityToWorklet(percentage) {
  if (!popupWorkletNode) return;
  const threshold = percentage / 100;
  popupWorkletNode.port.postMessage({
    type: 'SET_GITCH_CONFIG',
    highFreqThreshold: threshold
  });
}

// Background port disconnect handler — named for proper removal
function bgPortDisconnectHandler() {
  // Remove all listeners to prevent leaks
  if (bgPort) {
    bgPort.onMessage.removeListener(bgMetricsHandler);
    bgPort.onDisconnect.removeListener(bgPortDisconnectHandler);
  }
  
  isConnected = false;
  bgPort = null;
  bgMetricsHandler = null;
  
  // If capture was active when port disconnected, trigger reconnect
  if (captureActive) {
    // Port may have been recycled (SW woke up), try to reconnect
    setTimeout(() => {
      if (captureActive && !bgPort) {
        ensureBackgroundPort();
      }
    }, 500);
  }
  
  // Only update UI if capture was active (spontaneous disconnect)
  if (gracefulStop) {
    return;
  }
  
  // Port disconnected unexpectedly — stop capture gracefully
  captureActive = false;
  if (startBtn) {
    startBtn.textContent = 'Start Capture';
    startBtn.disabled = false;
  }
  updateUI(false);
}

// Send message to runtime with lastError suppression
function safeSendMessage(msg, callback) {
  chrome.runtime.sendMessage(msg, (response) => {
    if (chrome.runtime.lastError) {
      // SW may have terminated — ignore, will reconnect
      if (callback) callback(null);
      return;
    }
    if (callback) callback(response);
  });
}

// Send port message safely
function safePostMessage(port, msg) {
  try {
    if (port && !port._disconnected) {
      port.postMessage(msg);
    }
  } catch (e) {
    // Port disconnected
  }
}

// Background port — create ONCE at page load to prevent memory leaks
function ensureBackgroundPort() {
  if (bgPort) return true; // Already connected
  
  try {
    bgPort = chrome.runtime.connect({ name: 'popup-metrics' });
    isConnected = true;
    gracefulStop = false;
    
    // Named handler function for proper removeListener
    bgMetricsHandler = (data) => {
      if (!data) return;
      
      if (data.type === 'METRICS') {
        // Discard metrics if capture is not active (prevents post-stop spam)
        if (!captureActive) return;
        applyMetrics(data);
      }
      if (data.type === '_OFFSCREEN_ENDED') {
        gracefulStop = true; // Mark as graceful to prevent disconnect warning
        stopAudioProcessing();
        updateUI(false);
        captureActive = false;
        if (startBtn) {
          startBtn.textContent = 'Start Capture';
          startBtn.disabled = false;
        }
        setTimeout(() => { gracefulStop = false; }, 100);
      }
      // Handle offscreen capture errors (user cancelled, permission denied, etc.)
      if (data.type === '_OFFSCREEN_ERROR') {
        if (rmsLevel) {
          rmsLevel.textContent = 'Error: ' + (data.error || 'Capture failed');
          rmsLevel.style.color = tc('rms').SILENCE;
        }
        captureActive = false;
        if (startBtn) {
          startBtn.textContent = 'Start Capture';
          startBtn.disabled = false;
        }
      }
    };
    
    bgPort.onMessage.addListener(bgMetricsHandler);
    bgPort.onDisconnect.addListener(bgPortDisconnectHandler);
    
    // Send metrics request immediately after connect (in case capture is active)
    setTimeout(() => {
      if (bgPort) {
        bgPort.postMessage({ type: 'REQUEST_METRICS' });
      }
    }, 100);
    
    return true;
  } catch (e) {
    console.error('[Popup] Failed to create background port:', e);
    return false;
  }
}

function connectToBackground() {
  return ensureBackgroundPort();
}

startBtn.addEventListener('click', () => {
  if (captureActive) return;
  
  captureActive = true;
  startBtn.textContent = 'Capturing...';
  startBtn.disabled = true;

  connectToBackground();

  safeSendMessage({ type: 'START_CAPTURE' }, response => {
    if (response?.ok) {
      updateUI(true);
    } else {
      console.error('[Popup] Capture failed:', response?.error);
      alert('Ошибка: ' + (response?.error || 'Не удалось начать захват'));
      captureActive = false;
      if (startBtn) {
        startBtn.textContent = 'Start Capture';
        startBtn.disabled = false;
      }
    }
  });
});

stopBtn.addEventListener('click', () => {
  safeSendMessage({ type: 'STOP_CAPTURE' }, response => {
    stopAudioProcessing();
    captureActive = false;
    if (startBtn) {
      startBtn.textContent = 'Start Capture';
      startBtn.disabled = false;
    }
  });
});

chrome.runtime.sendMessage({ type: 'GET_CAPTURE_STATUS' }, (response) => {
  // Ignore lastError — SW may have terminated
  if (chrome.runtime.lastError) {
    updateUI(false);
    return;
  }

  if (response && response.isCapturing) {
    updateUI(true);
  } else {
    updateUI(false);
  }
});

// ============================================
// Slider & Sensitivity Controls
// ============================================

const SENSITIVITY_KEY = 'glitchSensitivity';
const SENSITIVITY_DEFAULT = 85;

// Load saved sensitivity on startup
chrome.storage.local.get([SENSITIVITY_KEY], (result) => {
  const saved = result[SENSITIVITY_KEY];
  if (typeof saved === 'number' && saved >= 60 && saved <= 90) {
    if (thresholdSlider) thresholdSlider.value = saved;
    if (thresholdValue) thresholdValue.textContent = saved + '%';
  } else if (thresholdSlider) {
    thresholdSlider.value = SENSITIVITY_DEFAULT;
    if (thresholdValue) thresholdValue.textContent = SENSITIVITY_DEFAULT + '%';
  }
});

// Обновление значения слайдера
if (thresholdSlider) {
  thresholdSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    if (thresholdValue) {
      thresholdValue.textContent = value + '%';
    }
    // Отправляем настройку в AudioWorklet в реальном времени
    sendSensitivityToWorklet(parseInt(value));
    // Сохраняем настройку
    chrome.storage.local.set({ [SENSITIVITY_KEY]: parseInt(value) });
  });
}

// Кнопка сброса чувствительности
if (resetSensitivityBtn) {
  resetSensitivityBtn.addEventListener('click', () => {
    if (thresholdSlider) thresholdSlider.value = SENSITIVITY_DEFAULT;
    if (thresholdValue) thresholdValue.textContent = SENSITIVITY_DEFAULT + '%';
    sendSensitivityToWorklet(SENSITIVITY_DEFAULT);
    chrome.storage.local.set({ [SENSITIVITY_KEY]: SENSITIVITY_DEFAULT });
  });
}

// Кнопка экспорта лога глитчей
if (exportLogBtn) {
  exportLogBtn.addEventListener('click', exportGlitchLog);
}

// Кнопка экспорта CSV осциллографа
if (exportBtn) {
  exportBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    exportCSV();
  });
  exportBtn.addEventListener('mousedown', function(e) {
    e.stopPropagation();
  });
}

// ============================================
// Theme Management
// ============================================

const THEME_KEY = 'theme';
const THEME_DEFAULT = 'dark';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '\u263C' : '\u263E';
  }
}

// Load saved theme on startup
chrome.storage.local.get([THEME_KEY], (result) => {
  const saved = result[THEME_KEY];
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    // Detect system preference
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }
});

if (themeToggle) {
  themeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const current = getTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    chrome.storage.local.set({ [THEME_KEY]: next });
  });
}

// ============================================
// Oscilloscope Redraw
// ============================================

function redrawOscilloscope() {
  // Check if there's any data
  let hasData = false;
  for (let i = 0; i < HISTORY_SIZE; i++) {
    if (leftChannelHistory[i] !== 0 || rightChannelHistory[i] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    if (perfActive) {
      perfAwareDraw(leftChannelHistory, rightChannelHistory);
    } else {
      drawOscilloscope(leftChannelHistory, rightChannelHistory);
    }
  }
}

// ============================================
// Oscilloscope Options (Freeze, Zoom, Log Scale)
// ============================================

const OSC_OPTIONS_KEY = 'oscOptions';

// Load saved oscilloscope options
chrome.storage.local.get([OSC_OPTIONS_KEY], (result) => {
  if (result[OSC_OPTIONS_KEY] && typeof result[OSC_OPTIONS_KEY] === 'object') {
    const opts = result[OSC_OPTIONS_KEY];
    if (opts.freeze) oscFreeze = true;
    if (opts.zoom) oscZoom = true;
    if (opts.logScale) oscLogScale = true;
    updateOscButtonStates();
  }
});

function saveOscOptions() {
  chrome.storage.local.set({
    [OSC_OPTIONS_KEY]: {
      freeze: oscFreeze,
      zoom: oscZoom,
      logScale: oscLogScale
    }
  });
}

function updateOscButtonStates() {
  if (freezeBtn) {
    freezeBtn.style.borderColor = oscFreeze ? 'var(--accent-blue)' : '';
    freezeBtn.style.background = oscFreeze ? 'var(--accent-blue-dark)' : '';
  }
  if (zoomBtn) {
    zoomBtn.style.borderColor = oscZoom ? 'var(--accent-blue)' : '';
    zoomBtn.style.background = oscZoom ? 'var(--accent-blue-dark)' : '';
  }
  if (logScaleBtn) {
    logScaleBtn.style.borderColor = oscLogScale ? 'var(--accent-blue)' : '';
    logScaleBtn.style.background = oscLogScale ? 'var(--accent-blue-dark)' : '';
  }
  if (freezeLabel) {
    freezeLabel.style.display = oscFreeze ? 'block' : 'none';
  }
}

if (freezeBtn) {
  freezeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    oscFreeze = !oscFreeze;
    saveOscOptions();
    updateOscButtonStates();
    
    // When freezing: save current buffers to pendingOscDraw for redraw
    if (oscFreeze) {
      pendingOscDraw = {
        left: new Float32Array(leftChannelHistory),
        right: new Float32Array(rightChannelHistory)
      };
    }
  });
}

if (zoomBtn) {
  zoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    oscZoom = !oscZoom;
    saveOscOptions();
    updateOscButtonStates();

    // Redraw with new zoom setting if capture is active
    if (!oscFreeze && leftChannelHistory.some(v => v !== 0)) {
      redrawOscilloscope();
    }
  });
}

if (logScaleBtn) {
  logScaleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    oscLogScale = !oscLogScale;
    saveOscOptions();
    updateOscButtonStates();

    // Redraw with new scale setting if capture is active
    if (!oscFreeze && leftChannelHistory.some(v => v !== 0)) {
      redrawOscilloscope();
    }
  });
}

if (clearOscBtn) {
  clearOscBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Clear history buffers
    leftChannelHistory.fill(0);
    rightChannelHistory.fill(0);
    // Clear freeze state
    oscFreeze = false;
    saveOscOptions();
    updateOscButtonStates();
    // Clear canvas
    if (oscilloscopeCtx && oscilloscopeCanvas) {
      const colors = tc('canvas');
      oscilloscopeCtx.fillStyle = colors.bg;
      oscilloscopeCtx.fillRect(0, 0, oscilloscopeCanvas.width, oscilloscopeCanvas.height);
      const centerY = oscilloscopeCanvas.height / 2;
      oscilloscopeCtx.strokeStyle = colors.grid;
      oscilloscopeCtx.lineWidth = 1;
      oscilloscopeCtx.beginPath();
      oscilloscopeCtx.moveTo(0, centerY);
      oscilloscopeCtx.lineTo(oscilloscopeCanvas.width, centerY);
      oscilloscopeCtx.stroke();
    }
  });
}

// ============================================
// Prevent popup closing on internal control clicks
// ============================================

// Предотвращаем всплытие кликов ТОЛЬКО на элементах управления
// (полностью запретить закрытие popup через stopPropagation нельзя — это поведение Chrome)
if (thresholdSlider) {
  thresholdSlider.addEventListener('click', (e) => e.stopPropagation());
  thresholdSlider.addEventListener('mousedown', (e) => e.stopPropagation());
}
if (resetSensitivityBtn) {
  resetSensitivityBtn.addEventListener('click', (e) => e.stopPropagation());
}
if (exportLogBtn) {
  exportLogBtn.addEventListener('click', (e) => e.stopPropagation());
}
if (clearOscBtn) {
  clearOscBtn.addEventListener('click', (e) => e.stopPropagation());
  clearOscBtn.addEventListener('mousedown', (e) => e.stopPropagation());
}
if (themeToggle) {
  themeToggle.addEventListener('click', (e) => e.stopPropagation());
  themeToggle.addEventListener('mousedown', (e) => e.stopPropagation());
}

// Cleanup when popup closes
window.addEventListener('beforeunload', async () => {
  let stopPending = false;
  
  if (captureActive) {
    // Try to send STOP_CAPTURE with fallback via setTimeout
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, (response) => {
          stopPending = true;
          // Ignore lastError — page unloading
          resolve(response);
        });
      });
    } catch (_) {
      // Fallback: if sendMessage fails, retry with setTimeout
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {});
      }, 50);
    }
  }
  
  if (bgPort) {
    // Remove listener before disconnecting
    if (bgMetricsHandler) {
      try { bgPort.onMessage.removeListener(bgMetricsHandler); } catch (_) {}
    }
    bgPort.disconnect();
    bgPort = null;
    bgMetricsHandler = null;
  }
});

// Initialize background port ONCE at page load — prevents memory leaks from multiple connections
ensureBackgroundPort(    