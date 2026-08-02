// popup-testable.js - Pure functions extracted from popup.js for unit testing
// All functions accept parameters instead of reading from DOM/Chrome API
// All functions return values instead of mutating DOM

// ============================================
// Constants
// ============================================

/**
 * Default values for audio effects (compressor, EQ, limiter, delay)
 */
export const EFFECTS_DEFAULTS = {
  compressor: { active: false, threshold: -24, ratio: 12, knee: 30, attack: 3, release: 250 },
  eq: { active: false, hpfFreq: 20, lpfFreq: 22050, peakFreq: 1000, peakGain: 0, peakQ: 1 },
  limiter: { active: false, threshold: -1 },
  delay: { active: false, delayTime: 0, feedback: 0, mix: 0 }
};

/**
 * Theme color palettes for dark, light, and neon themes
 */
export const THEME_COLORS = {
  dark: {
    glitch: { GLITCH: '#FF007F', DRIFT: '#9D00FF', STABLE: '#00E5FF' },
    rms: { SILENCE: '#FF007F', LOW: '#9D00FF', MEDIUM: '#00E5FF', HIGH: '#00B8D4', CRITICAL: '#FF4DA6', default: '#2C353F' },
    canvas: { bg: '#0B0C10', grid: 'rgba(69, 162, 158, 0.15)', oscLeft: '#00E5FF', oscRight: '#FF007F', timelineRef: 'rgba(69, 162, 158, 0.15)' },
    channel: { stereo: '#00E5FF', mono: '#8899AA' }
  },
  light: {
    glitch: { GLITCH: '#E53935', DRIFT: '#FB8C00', STABLE: '#43A047' },
    rms: { SILENCE: '#ef5350', LOW: '#FFA726', MEDIUM: '#66BB6A', HIGH: '#26A69A', CRITICAL: '#D32F2F', default: '#bdbdbd' },
    canvas: { bg: '#fafafa', grid: '#e0e0e0', oscLeft: '#1E88E5', oscRight: '#E53935', timelineRef: '#e0e0e0' },
    channel: { stereo: '#43A047', mono: '#666' }
  },
  neon: {
    glitch: { GLITCH: '#FF007F', DRIFT: '#9D00FF', STABLE: '#00E5FF' },
    rms: { SILENCE: '#FF007F', LOW: '#9D00FF', MEDIUM: '#00E5FF', HIGH: '#00B8D4', CRITICAL: '#FF4DA6', default: '#2C353F' },
    canvas: { bg: '#0B0C10', grid: 'rgba(69, 162, 158, 0.15)', oscLeft: '#00E5FF', oscRight: '#FF007F', timelineRef: 'rgba(69, 162, 158, 0.15)' },
    channel: { stereo: '#00E5FF', mono: '#8899AA' }
  }
};

// ============================================
// Configuration Constants
// ============================================

/**
 * History buffer size for waveform history
 */
export const HISTORY_SIZE = 1024;

/**
 * Theme cycle order
 */
export const THEME_CYCLE = ['neon', 'light', 'system'];

/**
 * Theme icons for theme toggle button
 */
const THEME_ICONS = {
  neon: '\uD83D\uDD06', // sparkles
  light: '\u263E', // light mode
  system: '\u263C' // dark mode (sun with rays)
};

/**
 * Default themes cycle order
 */
const DEFAULT_THEMES = ['neon', 'light', 'system'];

/**
 * Smoothing factor for frequency bands (0.05 to 0.3)
 * Lower = smoother/more inert, Higher = more reactive
 */
export const SMOOTHING_FACTOR = 0.15;

/**
 * Number of time slots in heatmap (50 slots = ~10 seconds at 5Hz)
 */
const HEATMAP_SLOTS = 50;

/**
 * Number of heatmap bands (Bass, Mid, Treble)
 */
const HEATMAP_BANDS = 3;

// ============================================
// Heatmap Functions
// ============================================

/**
 * Create empty heatmap data structure
 * @returns {Array.<Float32Array>} Array of 3 Float32Arrays (bands) x HEATMAP_SLOTS (time slots)
 */
function createEmptyHeatmapData() {
  return [
    new Float32Array(HEATMAP_SLOTS), // Bass
    new Float32Array(HEATMAP_SLOTS), // Mid
    new Float32Array(HEATMAP_SLOTS)  // Treble
  ];
}

/**
 * Update heatmap data with current metrics (pure function returning updated state)
 * @param {number} bass - Bass band value (0-100)
 * @param {number} mid - Mid band value (0-100)
 * @param {number} treble - Treble band value (0-100)
 * @param {boolean} isGlitch - Whether in glitch state
 * @param {number} heatmapTimeIndex - Current time slot index
 * @param {Array} [heatmapData] - Existing heatmap data (creates new if not provided)
 * @returns {{ heatmapData: Array, timeIndex: number, dirty: boolean }} Updated heatmap state
 */
export function updateHeatmapData(bass, mid, treble, isGlitch, heatmapTimeIndex, heatmapData) {
  // Normalize band values to 0-1 range
  const b = Math.min(1, bass / 100);
  const m = Math.min(1, mid / 100);
  const t = Math.min(1, treble / 100);
  
  // Boost values during glitch state
  const boost = isGlitch ? 1.5 : 1.0;
  
  // Create or use existing heatmap data
  const data = heatmapData || createEmptyHeatmapData();
  const newIndex = (heatmapTimeIndex + 1) % HEATMAP_SLOTS;
  
  data[0][heatmapTimeIndex] = Math.min(1, b * boost);
  data[1][heatmapTimeIndex] = Math.min(1, m * boost);
  data[2][heatmapTimeIndex] = Math.min(1, t * boost);
  
  return {
    heatmapData: data,
    timeIndex: newIndex,
    dirty: true
  };
}

/**
 * Get heatmap cell color based on value
 * @param {number} value - Cell value (0-1)
 * @returns {string} RGB color string
 */
export function getHeatmapColor(value) {
  const r = Math.min(255, Math.floor(Math.max(0, 1 - value) * 2 * 255));
  const g = Math.min(255, Math.floor(Math.max(0, 1 - Math.abs(value - 0.5) * 2) * 100));
  const b = Math.min(255, Math.floor(value * 2 * 255));
  return `rgb(${r},${g},${b})`;
}

/**
 * Calculate heatmap cell display position (accounts for wrap-around)
 * @param {number} slot - Slot index
 * @param {number} timeIndex - Current time index
 * @param {number} totalSlots - Total number of slots (HEATMAP_SLOTS)
 * @returns {number} Display slot position
 */
export function getHeatmapDisplaySlot(slot, timeIndex, totalSlots) {
  return (slot - timeIndex + totalSlots * 2) % totalSlots;
}

// ============================================
// Performance Monitoring Functions
// ============================================

/**
 * Performance monitoring state
 */
let _perfVisible = false;
let _perfActive = false;
let _perfFrameCount = 0;
let _perfDrawTimes = [];
let _perfAlertCount = 0;
let _lastLatency = 0;
let _lastDspTime = 0;
let _lastConnectionLatency = 0;
let _dropCount = 0;
let _isConnected = false;

/**
 * Reset performance monitoring state
 */
export function resetPerfState() {
  _perfVisible = false;
  _perfActive = false;
  _perfFrameCount = 0;
  _perfDrawTimes = [];
  _perfAlertCount = 0;
}

/**
 * Toggle performance monitor visibility (pure function returning new state)
 * @param {boolean} [current] - Current visibility state
 * @returns {{ visible: boolean, active: boolean }} New state object
 */
export function togglePerfMonitor(current) {
  const currentVisible = current !== undefined ? current : _perfVisible;
  const newVisible = !currentVisible;
  const newActive = newVisible; // If visible, also start measuring
  
  return { visible: newVisible, active: newActive };
}

/**
 * Update performance display values (pure function returning display config)
 * @param {number} fps - Frames per second
 * @param {number} drawMs - Drawing time in milliseconds
 * @param {number} queueLen - Queue length
 * @param {number} [lastLatency=0] - Last latency in ms
 * @param {number} [lastDspTime=0] - Last DSP time in ms
 * @param {number} [dropCount=0] - Drop count
 * @param {boolean} [isConnected=true] - Connection status
 * @param {number} [lastConnectionLatency=0] - Connection RTT in ms
 * @param {number} [perfAlertCount=0] - Alert count
 * @returns {{ fps: Object, drawMs: Object, queueLen: Object, latency: Object, dspTime: Object, drops: Object, connection: Object, connectionRtt: Object, alerts: Object }} Display config object
 */
export function updatePerfDisplay(
  fps, drawMs, queueLen,
  lastLatency, lastDspTime, dropCount,
  isConnected, lastConnectionLatency, perfAlertCount
) {
  const latency = lastLatency !== undefined ? lastLatency : _lastLatency;
  const dsp = lastDspTime !== undefined ? lastDspTime : _lastDspTime;
  const drops = dropCount !== undefined ? dropCount : _dropCount;
  const connected = isConnected !== undefined ? isConnected : _isConnected;
  const connLatency = lastConnectionLatency !== undefined ? lastConnectionLatency : _lastConnectionLatency;
  const alerts = perfAlertCount !== undefined ? perfAlertCount : _perfAlertCount;
  
  const getFpsClass = (f) => f >= 50 ? 'perf-good' : f >= 25 ? 'perf-warn' : 'perf-bad';
  const getDrawClass = (m) => m < 5 ? 'perf-good' : m < 15 ? 'perf-warn' : 'perf-bad';
  const getQueueClass = (l) => l < 5 ? 'perf-good' : l < 20 ? 'perf-warn' : 'perf-bad';
  const getLatencyClass = (l) => l < 10 ? 'perf-good' : l < 30 ? 'perf-warn' : 'perf-bad';
  const getDspClass = (t) => t < 2 ? 'perf-good' : t < 5 ? 'perf-warn' : 'perf-bad';
  const getDropsClass = (c) => c === 0 ? 'perf-good' : c <= 5 ? 'perf-warn' : 'perf-bad';
  const getConnClass = (c) => c ? 'perf-good' : 'perf-bad';
  const getConnRttClass = (l) => l > 0 ? (l < 15 ? 'perf-good' : l < 50 ? 'perf-warn' : 'perf-bad') : 'label-sm';
  const getAlertsClass = (a) => a === 0 ? 'perf-good' : a <= 2 ? 'perf-warn' : 'perf-bad';
  
  return {
    fps: {
      text: `FPS: ${fps}`,
      className: getFpsClass(fps)
    },
    drawMs: {
      text: `Draw: ${drawMs.toFixed(1)}ms`,
      className: getDrawClass(drawMs)
    },
    queueLen: {
      text: `Queue: ${queueLen}`,
      className: getQueueClass(queueLen)
    },
    latency: {
      text: `Latency: ${latency.toFixed(1)}ms`,
      className: getLatencyClass(latency)
    },
    dspTime: {
      text: `DSP: ${dsp.toFixed(1)}ms`,
      className: getDspClass(dsp)
    },
    drops: {
      text: `Drops: ${drops}`,
      className: getDropsClass(drops)
    },
    connection: {
      text: connected ? 'Conn: OK' : 'Conn: FAIL',
      className: getConnClass(connected)
    },
    connectionRtt: {
      text: connLatency > 0 ? `RTT: ${Math.round(connLatency)}ms` : 'RTT: --',
      className: getConnRttClass(connLatency)
    },
    alerts: {
      text: `Alerts: ${alerts}`,
      className: getAlertsClass(alerts)
    }
  };
}

/**
 * Check for performance alerts (pure function returning alert info)
 * @param {number} fps - Current FPS
 * @param {number} avgDrawMs - Average draw time
 * @param {number} [memMB] - Memory usage in MB (optional, Chrome-only)
 * @param {number} [now] - Current timestamp
 * @param {number} [lastLogged] - Last alert log timestamp
 * @param {number} [rateLimitMs] - Rate limit in ms
 * @returns {{ alert: boolean, type: string|null, message: string|null }} Alert info
 */
export function checkPerfAlerts(fps, avgDrawMs, memMB, now, lastLogged, rateLimitMs) {
  if (!now || !lastLogged || !rateLimitMs) {
    return { alert: false, type: null, message: null };
  }
  
  const timeSinceLast = now - lastLogged;
  if (timeSinceLast < rateLimitMs) {
    return { alert: false, type: null, message: null };
  }
  
  // FPS alert (< 15)
  if (fps < 15) {
    return { alert: true, type: 'fps', message: `FPS dropped to ${fps}` };
  }
  
  // Draw time alert (> 30ms)
  if (avgDrawMs > 30) {
    return { alert: true, type: 'draw', message: `Draw time ${avgDrawMs.toFixed(1)}ms` };
  }
  
  // Memory alert (> 100MB, Chrome-only)
  if (memMB !== undefined && memMB > 100) {
    return { alert: true, type: 'memory', message: `Memory ${memMB.toFixed(0)}MB` };
  }
  
  return { alert: false, type: null, message: null };
}

// ============================================
// Oscilloscope Waveform Processing
// ============================================

/**
 * Update oscilloscope history buffers from waveform data (pure function)
 * @param {Float32Array} waveform - Left channel waveform data
 * @param {Float32Array} [waveformRight] - Right channel waveform data
 * @param {boolean} [hold] - True to skip update (hold frame)
 * @param {boolean} [frozen] - True for freeze mode
 * @param {number} [historySize] - Buffer size (defaults to HISTORY_SIZE)
 * @returns {{ leftBuffer: Float32Array, rightBuffer: Float32Array, shouldDraw: boolean, isHoldFrame: boolean }} Processing result
 */
export function updateOscilloscopeFromWaveform(waveform, waveformRight, hold, frozen, historySize) {
  const size = historySize || HISTORY_SIZE;
  const isHold = hold === true;
  const hasWaveform = waveform && waveform.length > 0;
  
  if (isHold || !hasWaveform) {
    return {
      leftBuffer: null,
      rightBuffer: null,
      shouldDraw: false,
      isHoldFrame: isHold
    };
  }
  
  // Freeze mode: don't update buffers
  if (frozen) {
    return {
      leftBuffer: null,
      rightBuffer: null,
      shouldDraw: false,
      isHoldFrame: false,
      isFrozen: true
    };
  }
  
  // Create buffers
  const leftBuffer = new Float32Array(size);
  const rightBuffer = new Float32Array(size);
  
  if (waveformRight && waveformRight.length > 0) {
    // Stereo: separate L/R waveforms
    leftBuffer.set(waveform);
    rightBuffer.set(waveformRight);
  } else {
    // Mono: same data for both channels
    leftBuffer.set(waveform);
    rightBuffer.set(waveform);
  }
  
  // Zero out any unused samples
  if (waveform.length < size) {
    leftBuffer.fill(0, waveform.length, size);
    const rightLen = waveformRight?.length || waveform.length;
    rightBuffer.fill(0, rightLen, size);
  }
  
  return {
    leftBuffer,
    rightBuffer,
    shouldDraw: true,
    isHoldFrame: false
  };
}

// ============================================
// UI State Functions
// ============================================

/**
 * Update UI state based on connection status (pure function returning UI config)
 * @param {boolean} connected - Connection status
 * @returns {{ sections: Object, buttons: Object, values: Object }} UI configuration object
 */
export function updateUIState(connected) {
  if (connected) {
    return {
      sections: {
        rmsSection: 'block',
        freqBandsSection: 'block',
        oscilloscopeSection: 'block',
        glitchSettings: 'block',
        timelineSection: 'block',
        heatmapSection: 'block',
        entropySection: '',
        entropyHint: '',
        effectsSection: 'block'
      },
      buttons: {
        startBtn: { disabled: true, text: 'Capturing...' },
        stopBtn: { disabled: false }
      },
      values: {
        statusText: 'Connected - Capturing Audio',
        statusClass: 'status connected'
      }
    };
  } else {
    return {
      sections: {
        rmsSection: 'none',
        freqBandsSection: 'none',
        oscilloscopeSection: 'none',
        glitchSettings: 'none',
        timelineSection: 'none',
        heatmapSection: 'none',
        entropySection: 'none',
        entropyHint: 'none',
        effectsSection: 'none'
      },
      buttons: {
        startBtn: { disabled: false, text: 'Start Capture' },
        stopBtn: { disabled: true }
      },
      values: {
        statusText: 'Not Connected',
        statusClass: 'status disconnected',
        rmsValue: '0.0000',
        peakValue: 'Peak: --',
        rmsLevel: 'Level: --',
        glitchStatus: 'STABLE',
        entropyState: 'STABLE'
      }
    };
  }
}

/**
 * Get theme from data attribute value (pure alternative to reading DOM)
 * @param {string|null} dataTheme - Value of data-theme attribute (null for system)
 * @returns {string} Theme name ('dark', 'light', 'neon', or 'system')
 */
export function getResolvedTheme(dataTheme) {
  if (dataTheme === null || dataTheme === 'system') {
    return 'system';
  }
  return dataTheme;
}

/**
 * Cycle to next theme in the theme cycle
 * @param {string} currentTheme - Current theme name
 * @returns {string} Next theme name
 */
export function getNextTheme(currentTheme) {
  const currentIndex = THEME_CYCLE.indexOf(currentTheme);
  if (currentIndex === -1) return THEME_CYCLE[0];
  const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
  return THEME_CYCLE[nextIndex];
}

/**
 * Calculate theme toggle text content
 * @param {string} theme - Theme name
 * @returns {string} Icon character for the theme
 */
export function getThemeIcon(theme) {
  return THEME_ICONS[theme] || THEME_ICONS.system;
}

/**
 * Validate RMS value range
 * @param {number} value - RMS value
 * @returns {boolean} True if value is in valid range (0-1)
 */
export function isValidRMS(value) {
  return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Get RMS classification label
 * @param {number} value - RMS value
 * @returns {string} Classification string
 */
export function classifyRMS(value) {
  return rmsClassifyLevel(value);
}

/**
 * Format time in milliseconds to string
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string
 */
export function formatTimeMs(ms) {
  return Math.round(ms) + 'ms';
}

/**
 * Format a number to fixed decimal places
 * @param {number} value - Number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
export function formatNumber(value, decimals) {
  return value.toFixed(decimals);
}


/**
 * Get theme name from parameter (pure alternative to reading from DOM)
 * @param {string} theme - Theme name ('dark', 'light', or 'neon')
 * @returns {string} The theme name, defaults to 'neon'
 */
export function getTheme(theme) {
  return theme || 'neon';
}

/**
 * Get theme color by key (pure alternative to tc() which reads from DOM)
 * @param {string} key - Color key (e.g., 'bg', 'grid', 'GLITCH', etc.)
 * @param {string} [theme='neon'] - Theme name
 * @returns {string|null} The color value or undefined
 */
export function tc(key, theme) {
  const themeName = theme || 'neon';
  const themeColors = THEME_COLORS[themeName];
  if (!themeColors) {
    return THEME_COLORS.neon[key];
  }
  return themeColors[key];
}

/**
 * Get theme config object (pure alternative to applyTheme() DOM manipulation)
 * @param {string} theme - Theme name
 * @returns {{ theme: string, icon: string, attribute: string|null }} Theme configuration
 */
export function applyTheme(theme) {
  const icon = THEME_ICONS[theme] || THEME_ICONS.system;
  let attribute = null;
  if (theme !== 'system') {
    attribute = theme;
  }
  return { theme, icon, attribute };
}

/**
 * Get color for RMS level classification
 * @param {string} level - RMS level classification (e.g., 'SILENCE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
 * @param {string} [theme='neon'] - Theme name
 * @returns {string} Color hex code for the given level
 */
export function getLevelColor(level, theme) {
  const themeName = theme || 'neon';
  const colors = THEME_COLORS[themeName]?.rms;
  return colors?.[level] || colors?.default || '#ccc';
}

// ============================================
// RMS & Frequency Display Functions
// ============================================

/**
 * RMS classifies the given RMS value into a level category
 * Ported from RMS class in rms.js
 * @param {number} value - RMS value (0-1)
 * @returns {string} Level classification
 */
function rmsClassifyLevel(value) {
  if (value < 0.001) return 'SILENCE';
  if (value < 0.05) return 'LOW';
  if (value < 0.3) return 'MEDIUM';
  if (value < 0.7) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Converts RMS value to percentage (0-100)
 * @param {number} value - RMS value (0-1)
 * @returns {number} Percentage value
 */
function rmsToPercentage(value) {
  return Math.min(100, Math.max(0, value * 100));
}

/**
 * Update RMS display values (pure function returning display state)
 * @param {number} rmsValueNum - RMS value to display
 * @param {number} [peakRms] - Peak RMS value (optional)
 * @returns {{ rmsFormatted: string, level: string, percentage: number, peakFormatted: string|null, levelColor: string }} Display state object
 */
export function updateRMSDisplay(rmsValueNum, peakRms) {
  const rmsFormatted = rmsValueNum.toFixed(4);
  const level = rmsClassifyLevel(rmsValueNum);
  const percentage = rmsToPercentage(rmsValueNum);
  const levelColor = getLevelColor(level);
  const peakFormatted = peakRms !== undefined ? 'Peak: ' + peakRms.toFixed(4) : null;
  
  return {
    rmsFormatted,
    level,
    percentage,
    peakFormatted,
    levelColor
  };
}

// Internal smoothing state (module-level for LERP)
let _smoothedBass = 0;
let _smoothedMid = 0;
let _smoothedTreble = 0;

/**
 * Resets the internal smoothing state for frequency bands
 */
export function resetFrequencySmoothing() {
  _smoothedBass = 0;
  _smoothedMid = 0;
  _smoothedTreble = 0;
}

/**
 * Update frequency bands with smoothing (pure function returning smoothed values)
 * Uses LERP (Linear Interpolation): Current = Current + (Target - Current) * Factor
 * @param {number} bass - Bass band value (0-100)
 * @param {number} mid - Mid band value (0-100)
 * @param {number} treble - Treble band value (0-100)
 * @param {number} [smoothingFactor] - Smoothing factor (defaults to SMOOTHING_FACTOR)
 * @returns {{ smoothedBass: number, smoothedMid: number, smoothedTreble: number, bassPercent: number, midPercent: number, treblePercent: number }} Smoothed values
 */
export function updateFrequencyBands(bass, mid, treble, smoothingFactor) {
  const factor = smoothingFactor !== undefined ? smoothingFactor : SMOOTHING_FACTOR;
  const isValid = (val) => typeof val === 'number' && isFinite(val) && val >= 0;
  
  const rawBass = isValid(bass) ? bass : 0;
  const rawMid = isValid(mid) ? mid : 0;
  const rawTreble = isValid(treble) ? treble : 0;

  // LERP smoothing
  _smoothedBass += (rawBass - _smoothedBass) * factor;
  _smoothedMid += (rawMid - _smoothedMid) * factor;
  _smoothedTreble += (rawTreble - _smoothedTreble) * factor;

  const bassPercent = Math.min(100, Math.max(0, _smoothedBass));
  const midPercent = Math.min(100, Math.max(0, _smoothedMid));
  const treblePercent = Math.min(100, Math.max(0, _smoothedTreble));

  return {
    smoothedBass: _smoothedBass,
    smoothedMid: _smoothedMid,
    smoothedTreble: _smoothedTreble,
    bassPercent,
    midPercent,
    treblePercent
  };
}

// ============================================
// Glitch & Metrics Functions
// ============================================

/**
 * Glitch state color map
 */
const GLITCH_STATE_COLORS = {
  GLITCH: 'GLITCH',
  DRIFT: 'DRIFT',
  STABLE: 'STABLE'
};

/**
 * Internal glitch state tracking
 */
let _lastGlitchState = 'STABLE';

/**
 * Returns the color for a glitch state
 * @param {string} state - Glitch state ('GLITCH', 'DRIFT', 'STABLE')
 * @param {string} [theme='neon'] - Theme name
 * @returns {string} Color hex code
 */
function getGlitchStateColor(state, theme) {
  const themeName = theme || 'neon';
  return THEME_COLORS[themeName]?.glitch?.[state] || THEME_COLORS[themeName]?.glitch?.STABLE;
}

/**
 * Internal state for metrics
 */
let _currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };

/**
 * Reset current metrics state
 */
export function resetMetrics() {
  _currentMetrics = { rms: 0, bass: 0, mid: 0, treble: 0, highFreqAnomaly: 0 };
  _lastGlitchState = 'STABLE';
}

/**
 * Update glitch display state (pure function returning display state object)
 * @param {string} state - Glitch state ('GLITCH', 'DRIFT', 'STABLE')
 * @param {number} count - Glitch count
 * @param {number} [entropy] - Shannon entropy value
 * @param {string} [entropyStateVal] - Entropy classification
 * @param {number} [flatness] - Spectral flatness
 * @param {number} [hnr] - Harmonic-to-Noise Ratio
 * @param {number} [zcr] - Zero Crossing Rate
 * @param {number} [spectralCentroid] - Spectral centroid
 * @param {number} [spectralRolloff] - Spectral rolloff
 * @param {boolean} [onsetDetected] - Onset detection result
 * @param {number} [rtt] - Round trip time
 * @param {number} [dynamicRange] - Dynamic range
 * @param {number} [bassMidRatio] - Bass to mid ratio
 * @param {number} [midTrebleRatio] - Mid to treble ratio
 * @param {number} [glitchRate] - Glitch rate per second
 * @param {string} [theme='neon'] - Theme name
 * @returns {{ state: string, count: number, entropy: string|null, flatness: string|null, entropyState: { text: string, color: string }|null, hnr: string|null, zcr: string|null, centroid: string|null, rolloff: string|null, onset: { text: string, color: string }|null, rtt: string|null, dynamicRange: string|null, bassMidRatio: string|null, midTrebleRatio: string|null, glitchRate: string|null, entropyHint: boolean }} Display state object
 */
export function updateGlitchDisplay(
  state, count, entropy, entropyStateVal, flatness,
  hnr, zcr, spectralCentroid, spectralRolloff, onsetDetected,
  rtt, dynamicRange, bassMidRatio, midTrebleRatio, glitchRate,
  theme
) {
  const themeName = theme || 'neon';
  const glitchColors = THEME_COLORS[themeName]?.glitch || THEME_COLORS.neon.glitch;
  
  // Update last glitch state for log entry detection
  const isNewGlitch = state === 'GLITCH' && _lastGlitchState !== 'GLITCH';
  _lastGlitchState = state;

  // Entropy state display
  let entropyStateDisplay = null;
  if (entropyStateVal) {
    let entColor = glitchColors.STABLE;
    switch (entropyStateVal) {
      case 'GLITCH':
        entColor = glitchColors.GLITCH;
        break;
      case 'DRIFT':
        entColor = glitchColors.DRIFT;
        break;
      case 'STABLE':
      default:
        entColor = glitchColors.STABLE;
        break;
    }
    entropyStateDisplay = { text: entropyStateVal, color: entColor };
  }

  // Onset display
  let onsetDisplay = null;
  if (onsetDetected !== undefined) {
    onsetDisplay = {
      text: onsetDetected ? 'YES' : 'NO',
      color: onsetDetected ? 'var(--text-red)' : 'var(--accent-blue)'
    };
  }

  return {
    state,
    count,
    isNewGlitch,
    entropy: entropy !== undefined ? entropy.toFixed(2) : null,
    flatness: flatness !== undefined ? flatness.toFixed(2) : null,
    entropyState: entropyStateDisplay,
    hnr: hnr !== undefined && hnr !== 0 ? hnr.toFixed(1) + ' dB' : null,
    zcr: zcr !== undefined ? zcr.toFixed(0) : null,
    centroid: spectralCentroid !== undefined ? spectralCentroid.toFixed(0) + ' Hz' : null,
    rolloff: spectralRolloff !== undefined ? spectralRolloff.toFixed(0) + ' Hz' : null,
    onset: onsetDisplay,
    rtt: rtt !== undefined && rtt > 0 ? Math.round(rtt) + 'ms' : null,
    dynamicRange: dynamicRange != null && dynamicRange > 0 ? dynamicRange.toFixed(1) + ' dB' : null,
    bassMidRatio: bassMidRatio != null ? bassMidRatio.toFixed(2) + ' dB' : null,
    midTrebleRatio: midTrebleRatio != null ? midTrebleRatio.toFixed(2) + ' dB' : null,
    glitchRate: glitchRate != null ? glitchRate.toFixed(1) + '/s' : null,
    entropyHint: entropy !== undefined
  };
}

/**
 * Add a glitch log entry to the history
 * @param {Object} params - Parameters for the log entry
 * @param {number} params.glitchCount - Current glitch count
 * @param {Object} params.metrics - Current metrics state
 * @param {number} [params.timestamp] - Timestamp (defaults to Date.now())
 * @returns {Object} The log entry object
 */
export function addGlitchLogEntry({ glitchCount, metrics, timestamp }) {
  const entry = {
    timestamp: timestamp || Date.now(),
    iso: new Date(timestamp || Date.now()).toISOString(),
    glitchCount,
    rms: metrics.rms,
    bass: metrics.bass,
    mid: metrics.mid,
    treble: metrics.treble,
    highFreqAnomaly: metrics.highFreqAnomaly
  };
  return entry;
}

/**
 * Process metrics data and return updated state object (pure function)
 * Ported from applyMetrics() in popup.js
 * @param {Object} data - METRICS payload from AudioWorklet
 * @param {number} data.rms - Root mean square energy (0–1)
 * @param {number} [data.peakRMS] - Peak amplitude (0–1)
 * @param {number} data.bass - Bass band percentage (0–100)
 * @param {number} data.mid - Mid band percentage (0–100)
 * @param {number} data.treble - Treble band percentage (0–100)
 * @param {number} [data.bassRight] - Right channel bass
 * @param {number} [data.midRight] - Right channel mid
 * @param {number} [data.trebleRight] - Right channel treble
 * @param {number} [data.rmsRight] - Right channel RMS
 * @param {number} [data.highFreqAnomaly] - High frequency anomaly value
 * @param {Array} [data.waveform] - Left channel waveform
 * @param {Array} [data.waveformRight] - Right channel waveform
 * @param {boolean} [data.waveformHold] - True when waveform is throttled
 * @param {string} [data.glitchState] - STABLE / DRIFT / GLITCH
 * @param {number} [data.glitchCount] - Cumulative glitch counter
 * @param {number} [data.entropy] - Shannon entropy
 * @param {number} [data.flatness] - Spectral flatness
 * @param {string} [data.entropyState] - Entropy classification
 * @param {number} [data.hnr] - Harmonic-to-Noise Ratio
 * @param {number} [data.zcr] - Zero Crossing Rate
 * @param {number} [data.spectralCentroid] - Spectral centroid
 * @param {number} [data.spectralRolloff] - Spectral rolloff
 * @param {boolean} [data.onsetDetected] - Onset detection result
 * @param {number} [data.dynamicRange] - Dynamic range
 * @param {number} [data.bassMidRatio] - Bass to mid ratio
 * @param {number} [data.midTrebleRatio] - Mid to treble ratio
 * @param {number} [data.glitchRate] - Glitch rate per second
 * @param {boolean} [data.isGlitch] - Whether current state is glitch
 * @param {number} [data.timestamp] - Metrics timestamp
 * @param {number} [data.audioDrops] - Audio drop count
 * @param {string} [theme='neon'] - Theme name
 * @returns {{ currentMetrics: Object, isStereo: boolean, combinedBands: Object, rmsDisplay: Object, glitchDisplay: Object, frequencyBands: Object }} Updated state object
 */
export function applyMetrics(data, theme) {
  const themeName = theme || 'neon';
  
  // Quick bail for invalid data
  if (!data || typeof data.rms === 'undefined') {
    return null;
  }
  
  // Update current metrics state
  _currentMetrics = {
    rms: data.rms,
    bass: data.bass,
    mid: data.mid,
    treble: data.treble,
    highFreqAnomaly: data.highFreqAnomaly || 0,
    rmsRight: data.rmsRight
  };

  // Determine stereo/mono
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

  // RMS display
  const rmsDisplay = updateRMSDisplay(data.rms, data.peakRMS);

  // Frequency bands
  const frequencyBands = updateFrequencyBands(combinedBass, combinedMid, combinedTreble);

  // Channel indicator
  const chColors = THEME_COLORS[themeName]?.channel || THEME_COLORS.neon.channel;
  const channelInfo = {
    text: isStereo ? 'STEREO' : 'MONO',
    color: isStereo ? chColors.stereo : chColors.mono
  };

  // Glitch display
  const glitchDisplay = updateGlitchDisplay(
    data.glitchState || 'STABLE',
    data.glitchCount || 0,
    data.entropy,
    data.entropyState,
    data.flatness,
    data.hnr,
    data.zcr,
    data.spectralCentroid,
    data.spectralRolloff,
    data.onsetDetected,
    0, // lastConnectionLatency (would come from ping/pong)
    data.dynamicRange,
    data.bassMidRatio,
    data.midTrebleRatio,
    data.glitchRate,
    themeName
  );

  return {
    currentMetrics: _currentMetrics,
    isStereo,
    combinedBands: { bass: combinedBass, mid: combinedMid, treble: combinedTreble },
    rmsDisplay,
    frequencyBands,
    channelInfo,
    glitchDisplay
  };
}

// ============================================
// Effects Functions
// ============================================

/**
 * Save effects settings (pure function returning settings object, no Chrome API)
 * @param {Object} effectsSettings - Effects settings object
 * @returns {Object} The effects settings object
 */
export function saveEffectsSettings(effectsSettings) {
  return JSON.parse(JSON.stringify(effectsSettings));
}

/**
 * Send compressor settings message (pure function returning message object, no Chrome API)
 * @param {Object} settings - Effects settings object
 * @returns {Object} Message object to send to background/offscreen
 */
export function sendCompressorSettings(settings) {
  return {
    type: '_SSA_SET_COMPRESSOR',
    active: settings.compressor.active,
    params: {
      threshold: settings.compressor.threshold,
      ratio: settings.compressor.ratio,
      knee: settings.compressor.knee,
      attack: settings.compressor.attack,
      release: settings.compressor.release
    }
  };
}

/**
 * Send EQ settings message (pure function returning message object)
 * @param {Object} settings - Effects settings object
 * @returns {Object} Message object to send to background/offscreen
 */
export function sendEQSettings(settings) {
  return {
    type: '_SSA_SET_EQ',
    active: settings.eq.active,
    params: {
      hpfFreq: settings.eq.hpfFreq,
      lpfFreq: settings.eq.lpfFreq,
      peakFreq: settings.eq.peakFreq,
      peakGain: settings.eq.peakGain,
      peakQ: settings.eq.peakQ
    }
  };
}

/**
 * Send limiter settings message (pure function returning message object)
 * @param {Object} settings - Effects settings object
 * @returns {Object} Message object to send to background/offscreen
 */
export function sendLimiterSettings(settings) {
  return {
    type: '_SSA_SET_LIMITER',
    active: settings.limiter.active,
    params: {
      threshold: settings.limiter.threshold
    }
  };
}

/**
 * Send delay settings message (pure function returning message object)
 * @param {Object} settings - Effects settings object
 * @returns {Object} Message object to send to background/offscreen
 */
export function sendDelaySettings(settings) {
  return {
    type: '_SSA_SET_DELAY',
    active: settings.delay.active,
    params: {
      delayTime: settings.delay.delayTime,
      feedback: settings.delay.feedback,
      mix: settings.delay.mix
    }
  };
}

/**
 * Reset all effects to defaults (pure function returning reset settings object)
 * @param {Object} [defaults=EFFECTS_DEFAULTS] - Default values object
 * @returns {Object} Reset effects settings object (deep copy of defaults)
 */
export function resetEffects(defaults) {
  return JSON.parse(JSON.stringify(defaults || EFFECTS_DEFAULTS));
}

// ============================================
// Oscilloscope & Visualization Functions
// ============================================

/**
 * Oscilloscope options state
 */
let _oscFreeze = false;
let _oscZoom = false;
let _oscLogScale = false;
let _oscSplit = false;

/**
 * Reset oscilloscope options to defaults
 */
export function resetOscOptions() {
  _oscFreeze = false;
  _oscZoom = false;
  _oscLogScale = false;
  _oscSplit = false;
}

/**
 * Save oscilloscope options (pure function returning options object, no Chrome API)
 * @param {Object} options - Oscilloscope options
 * @param {boolean} options.freeze - Freeze state
 * @param {boolean} options.zoom - Zoom state
 * @param {boolean} options.logScale - Log scale state
 * @param {boolean} [options.split] - Split screen state
 * @param {boolean} [options.hasReference] - Whether reference buffer is set
 * @returns {Object} Options object to persist
 */
export function saveOscOptions(options) {
  return {
    freeze: options.freeze || _oscFreeze,
    zoom: options.zoom || _oscZoom,
    logScale: options.logScale || _oscLogScale,
    split: options.split !== undefined ? options.split : _oscSplit,
    hasReference: options.hasReference || false
  };
}

/**
 * Update oscilloscope button states (pure function returning state object)
 * @param {Object} options - Oscilloscope options
 * @param {boolean} options.freeze - Freeze state
 * @param {boolean} options.zoom - Zoom state
 * @param {boolean} options.logScale - Log scale state
 * @param {boolean} options.split - Split state
 * @returns {{ freeze: string|null, zoom: string|null, logScale: string|null, freezeLabel: string|null, split: string|null }} Button state object
 */
export function updateOscButtonStates(options) {
  const freeze = options.freeze !== undefined ? options.freeze : _oscFreeze;
  const zoom = options.zoom !== undefined ? options.zoom : _oscZoom;
  const logScale = options.logScale !== undefined ? options.logScale : _oscLogScale;
  const split = options.split !== undefined ? options.split : _oscSplit;
  
  return {
    freeze: freeze ? 'active' : null,
    zoom: zoom ? 'active' : null,
    logScale: logScale ? 'active' : null,
    freezeLabel: freeze ? 'block' : 'none',
    split: split ? 'active' : null
  };
}

/**
 * Update drop counter status (pure function returning status object)
 * @param {number} count - Drop count
 * @param {boolean} [captureActive] - Whether capture is active
 * @returns {{ count: number, display: string, containerClass: string, containerDisplay: string }} Status object
 */
export function updateDropCounter(count, captureActive) {
  const containerClass = count > 10 ? 'critical' : count > 5 ? 'warning' : '';
  const containerDisplay = captureActive ? 'block' : 'none';
  
  return {
    count,
    display: String(count),
    containerClass,
    containerDisplay
  };
}

/**
 * Clamp value to range [-1, 1]
 * @param {number} v - Value to clamp
 * @returns {number} Clamped value
 */
function clamp(v) {
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

/**
 * Normalize sample for log scale display
 * @param {number} sample - Raw sample value
 * @returns {number} Normalized value in range [-1, 1]
 */
function normalizeLogSample(sample) {
  return Math.max(-1, Math.min(1, Math.log10(Math.abs(sample) + 1e-10) / Math.log10(2) / 30));
}

/**
 * Draw oscilloscope instructions (pure function returning drawing commands, no canvas)
 * @param {Float32Array} leftBuffer - Left channel waveform data
 * @param {Float32Array} rightBuffer - Right channel waveform data
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {boolean} [oscZoom] - Zoom mode (true = visible samples only)
 * @param {boolean} [oscLogScale] - Logarithmic Y-axis
 * @param {Object} [colors] - Canvas color config (uses default if not provided)
 * @returns {Object} Drawing instructions containing canvas state
 */
export function drawOscilloscope(leftBuffer, rightBuffer, canvasWidth, canvasHeight, oscZoom, oscLogScale, colors) {
  const canvasColors = colors || THEME_COLORS.neon.canvas;
  const centerY = canvasHeight / 2;
  
  // Build drawing instructions (what would be drawn to canvas)
  const instructions = {
    backgroundColor: canvasColors.bg,
    canvasSize: { width: canvasWidth, height: canvasHeight },
    gridLine: {
      startX: 0,
      startY: centerY,
      endX: canvasWidth,
      endY: centerY,
      color: canvasColors.grid,
      lineWidth: 1
    },
    waveforms: []
  };
  
  const drawSingleBuffer = (buf, color, label) => {
    if (!buf || buf.length === 0) return null;
    
    const startIdx = 0;
    const endIdx = oscZoom ? Math.min(buf.length, 256) : buf.length;
    const decimate = Math.max(1, Math.floor((endIdx - startIdx) / canvasWidth));
    
    const points = [];
    for (let i = startIdx; i < endIdx; i += decimate) {
      const px = i - startIdx;
      const x = (px / (endIdx - startIdx)) * canvasWidth;
      const normalized = oscLogScale
        ? normalizeLogSample(buf[i])
        : clamp(buf[i]);
      const y = centerY - (normalized * centerY);
      points.push({ x, y });
    }
    
    return { points, color, label };
  };
  
  const leftWaveform = drawSingleBuffer(leftBuffer, canvasColors.oscLeft, 'left');
  const rightWaveform = drawSingleBuffer(rightBuffer, canvasColors.oscRight, 'right');
  
  if (leftWaveform) instructions.waveforms.push(leftWaveform);
  if (rightWaveform) instructions.waveforms.push(rightWaveform);
  
  return instructions;
}

/**
 * Draw split-screen oscilloscope instructions (pure function)
 * @param {Float32Array} leftBuffer - Left channel waveform
 * @param {Float32Array} rightBuffer - Right channel waveform
 * @param {Float32Array|null} referenceLeft - Reference left buffer (null if not set)
 * @param {Float32Array|null} referenceRight - Reference right buffer (null if not set)
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {boolean} [oscZoom] - Zoom mode
 * @param {boolean} [oscLogScale] - Log scale mode
 * @param {Object} [colors] - Canvas colors
 * @returns {Object} Drawing instructions for split screen
 */
export function drawOscilloscopeSplit(leftBuffer, rightBuffer, referenceLeft, referenceRight, canvasWidth, canvasHeight, oscZoom, oscLogScale, colors) {
  const canvasColors = colors || THEME_COLORS.neon.canvas;
  const halfHeight = canvasHeight / 2;
  const centerYTop = halfHeight / 2;
  const centerYBottom = halfHeight + centerYTop;
  
  const instructions = {
    backgroundColor: canvasColors.bg,
    canvasSize: { width: canvasWidth, height: canvasHeight },
    gridLines: [
      { x1: 0, y1: halfHeight, x2: canvasWidth, y2: halfHeight },
      { x1: 0, y1: centerYTop, x2: canvasWidth, y2: centerYTop },
      { x1: 0, y1: centerYBottom, x2: canvasWidth, y2: centerYBottom }
    ],
    topHalf: { centerY: centerYTop },
    bottomHalf: { centerY: centerYBottom },
    waveforms: []
  };
  
  const drawDecimated = (buf, color, centerY, label) => {
    if (!buf || buf.length === 0) return null;
    
    const endIdx = oscZoom ? Math.min(buf.length, 256) : buf.length;
    const decimate = Math.max(1, Math.floor(endIdx / canvasWidth));
    
    const points = [];
    for (let i = 0; i < endIdx; i += decimate) {
      const x = (i / endIdx) * canvasWidth;
      const raw = buf[i];
      const normalized = oscLogScale
        ? normalizeLogSample(raw)
        : clamp(raw);
      const y = centerY - (normalized * centerYTop);
      points.push({ x, y });
    }
    
    return { points, color, label };
  };
  
  // Live waveforms (top half)
  const leftLive = drawDecimated(leftBuffer, canvasColors.oscLeft, centerYTop, 'left-live');
  const rightLive = drawDecimated(rightBuffer, canvasColors.oscRight, centerYTop, 'right-live');
  if (leftLive) instructions.waveforms.push({ ...leftLive, section: 'top' });
  if (rightLive) instructions.waveforms.push({ ...rightLive, section: 'top' });
  
  // Reference waveforms (bottom half)
  if (referenceLeft) {
    instructions.waveforms.push({
      ...drawDecimated(referenceLeft, canvasColors.oscLeft + '66', centerYBottom, 'left-ref'),
      section: 'bottom'
    });
  }
  if (referenceRight) {
    instructions.waveforms.push({
      ...drawDecimated(referenceRight, canvasColors.oscRight + '66', centerYBottom, 'right-ref'),
      section: 'bottom'
    });
  } else if (referenceLeft) {
    instructions.waveforms.push({
      ...drawDecimated(referenceLeft, canvasColors.oscRight + '66', centerYBottom, 'left-ref-dup'),
      section: 'bottom'
    });
  }
  
  return instructions;
}

/**
 * Draw timeline data (pure function returning timeline data, no canvas)
 * @param {Array} glitchHistory - Array of { time, rms, state } objects
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Object} [colors] - Canvas color config
 * @returns {Object} Timeline data with segments and reference line
 */
export function drawTimeline(glitchHistory, canvasWidth, canvasHeight, colors) {
  const canvasColors = colors || THEME_COLORS.neon.canvas;
  const padding = 5;
  
  if (!glitchHistory || glitchHistory.length < 2) {
    return {
      backgroundColor: canvasColors.bg,
      canvasSize: { width: canvasWidth, height: canvasHeight },
      segments: [],
      referenceLine: { y: canvasHeight - padding - (0.1 * (canvasHeight - padding * 2)), color: canvasColors.timelineRef }
    };
  }
  
  // Normalize timestamps relative to window
  const windowStart = glitchHistory[0].time;
  const windowEnd = glitchHistory[glitchHistory.length - 1].time;
  const windowDuration = windowEnd - windowStart || 1;
  
  // Group consecutive points by state for batched color drawing
  const segments = [];
  let currentSegment = [];
  let currentState = null;
  
  for (let i = 0; i < glitchHistory.length; i++) {
    const point = glitchHistory[i];
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
  
  // Calculate normalized points for each segment
  const normalizedSegments = segments.map(seg => ({
    state: seg.state,
    points: seg.points.map(p => ({
      x: ((p.time - windowStart) / windowDuration) * (canvasWidth - padding * 2) + padding,
      y: canvasHeight - padding - (p.rms * (canvasHeight - padding * 2))
    }))
  }));
  
  return {
    backgroundColor: canvasColors.bg,
    canvasSize: { width: canvasWidth, height: canvasHeight },
    segments: normalizedSegments,
    referenceLine: {
      y: canvasHeight - padding - (0.1 * (canvasHeight - padding * 2)),
      color: canvasColors.timelineRef,
      dashPattern: [3, 3]
    }
  };
}
