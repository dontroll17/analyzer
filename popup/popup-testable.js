// popup/popup-testable.js — Pure functions extracted from popup.js
// Can be imported and tested in Node.js / Vitest without DOM or chrome APIs

/**
 * Theme color palette for Stream Sensation Analyzer
 * Maps theme name → color values for glitch detection, RMS levels, canvas rendering
 */
export const THEME_COLORS = Object.freeze({
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
});

/**
 * Valid capture source types for audio capture
 */
export const VALID_CAPTURE_SOURCES = Object.freeze(['tab', 'mic', 'combined']);

/**
 * Storage keys used by popup and background
 */
export const STORAGE_KEYS = Object.freeze({
  DROP_COUNT: 'ssa_audio_drop_count',
});

// ============================================
// Theme helpers (pure functions)
// ============================================

/**
 * Get theme colors for a given theme name.
 * Falls back to 'neon' if theme is unknown.
 * @param {string} themeName - Theme name (dark, light, neon)
 * @returns {object} Theme color object
 */
export function getThemeColors(themeName) {
  const theme = themeName || 'neon';
  if (!THEME_COLORS[theme]) {
    return THEME_COLORS.neon;
  }
  return THEME_COLORS[theme];
}

/**
 * Get a specific color by category from a theme.
 * @param {string} themeName - Theme name
 * @param {string} category - Color category (glitch, rms, canvas, channel)
 * @param {string} key - Color key within category
 * @returns {string} Hex color value
 */
export function getThemeColor(themeName, category, key) {
  const colors = getThemeColors(themeName);
  if (!colors[category]) {
    return colors.default || '#000000';
  }
  return colors[category][key] || colors.default || '#000000';
}

// ============================================
// Validation helpers (pure functions)
// ============================================

/**
 * Validate capture source parameter.
 * @param {*} value - Value to validate
 * @returns {boolean} true if valid capture source
 */
export function isValidCaptureSource(value) {
  return VALID_CAPTURE_SOURCES.includes(value);
}

/**
 * Get default capture source.
 * @returns {string} Default capture source ('tab')
 */
export function getDefaultCaptureSource() {
  return 'tab';
}

// ============================================
// Message builder helpers (pure functions)
// ============================================

/**
 * Build START_CAPTURE message payload.
 * @param {string} captureSource - Capture source ('tab', 'mic', 'combined')
 * @returns {object} Message payload
 */
export function buildStartCaptureMessage(captureSource) {
  return {
    type: 'START_CAPTURE',
    captureSource: captureSource || getDefaultCaptureSource()
  };
}

/**
 * Build STOP_CAPTURE message payload.
 * @returns {object} Message payload
 */
export function buildStopCaptureMessage() {
  return {
    type: 'STOP_CAPTURE'
  };
}

/**
 * Build REQUEST_STATUS message payload.
 * @returns {object} Message payload
 */
export function buildRequestStatusMessage() {
  return {
    type: 'REQUEST_STATUS'
  };
}

/**
 * Build REQUEST_METRICS message payload.
 * @returns {object} Message payload
 */
export function buildRequestMetricsMessage() {
  return {
    type: 'REQUEST_METRICS'
  };
}

/**
 * Build effects control message payload.
 * @param {'COMPRESSOR' | 'LIMITER' | 'EQ' | 'DELAY'} effectName - Effect name
 * @param {object} params - Effect parameters
 * @returns {object} Message payload
 */
export function buildEffectsMessage(effectName, params) {
  const typeMap = {
    COMPRESSOR: '_SSA_SET_COMPRESSOR',
    LIMITER: '_SSA_SET_LIMITER',
    EQ: '_SSA_SET_EQ',
    DELAY: '_SSA_SET_DELAY',
  };
  const type = typeMap[effectName] || '_SSA_SET_EQ';
  return {
    type,
    active: params?.enabled ?? false,
    ...(params || {}),
  };
}

// ============================================
// RMS analysis helpers (pure functions)
// ============================================

/**
 * RMS levels classification (matches audio-worklet.js logic)
 */
export const RMS_LEVELS = Object.freeze({
  SILENCE: 0.01,
  LOW: 0.1,
  MEDIUM: 0.3,
  HIGH: 0.7,
});

/**
 * Classify RMS value into level category.
 * @param {number} rms - RMS value (0 to 1)
 * @returns {string} Level category
 */
export function classifyRmsLevel(rms) {
  if (rms < RMS_LEVELS.SILENCE) return 'SILENCE';
  if (rms < RMS_LEVELS.LOW) return 'LOW';
  if (rms < RMS_LEVELS.MEDIUM) return 'MEDIUM';
  if (rms < RMS_LEVELS.HIGH) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Convert RMS to percentage (0-100).
 * @param {number} rms - RMS value (0 to 1)
 * @returns {number} Percentage (0 to 100)
 */
export function rmsToPercentage(rms) {
  return Math.min(100, Math.max(0, Math.round(rms * 100)));
}

/**
 * Get color for RMS level.
 * @param {string} level - RMS level category
 * @param {string} theme - Theme name (default: 'neon')
 * @returns {string} Hex color
 */
export function getRmsColor(level, theme = 'neon') {
  return getThemeColor(theme, 'rms', level);
}

/**
 * Calculate energy percentage for a frequency band.
 * @param {number} bandEnergy - Band energy value
 * @param {number} maxEnergy - Maximum possible energy
 * @returns {number} Percentage (0 to 100)
 */
export function calculateBandPercentage(bandEnergy, maxEnergy = 1.0) {
  if (maxEnergy <= 0) return 0;
  return Math.min(100, Math.round((bandEnergy / maxEnergy) * 100));
}

// ============================================
// Sensitivity validation helpers
// ============================================

/**
 * Valid sensitivity range (matches popup.js sliders)
 */
export const SENSITIVITY_RANGE = Object.freeze({
  MIN: 60,
  MAX: 90,
  DEFAULT: 85,
});

/**
 * Validate sensitivity slider value.
 * @param {number} value - Sensitivity percentage
 * @returns {boolean} true if valid
 */
export function isValidSensitivity(value) {
  return (
    typeof value === 'number' &&
    !isNaN(value) &&
    value >= SENSITIVITY_RANGE.MIN &&
    value <= SENSITIVITY_RANGE.MAX
  );
}

/**
 * Get default sensitivity.
 * @returns {number} Default sensitivity
 */
export function getDefaultSensitivity() {
  return SENSITIVITY_RANGE.DEFAULT;
}

/**
 * Clamp sensitivity to valid range.
 * @param {number} value - Value to clamp
 * @returns {number} Clamped value
 */
export function clampSensitivity(value) {
  if (!isValidSensitivity(value)) return getDefaultSensitivity();
  return Math.max(SENSITIVITY_RANGE.MIN, Math.min(SENSITIVITY_RANGE.MAX, value));
}

// ============================================
// Oscilloscope options helpers
// ============================================

/**
 * Default oscilloscope options
 */
export const DEFAULT_OSC_OPTIONS = Object.freeze({
  freeze: false,
  zoom: false,
  logScale: false,
});

/**
 * Valid oscilloscope option keys.
 */
export const VALID_OSC_OPTION_KEYS = Object.freeze(['freeze', 'zoom', 'logScale']);

/**
 * Validate oscilloscope option value.
 * @param {string} key - Option key
 * @param {*} value - Value to validate
 * @returns {boolean} true if valid
 */
export function isValidOscOption(key, value) {
  if (!VALID_OSC_OPTION_KEYS.includes(key)) return false;
  return typeof value === 'boolean';
}

/**
 * Merge oscilloscope options (user overrides defaults).
 * @param {object} userOptions - User-provided options
 * @returns {object} Merged options object
 */
export function mergeOscOptions(userOptions = {}) {
  const merged = { ...DEFAULT_OSC_OPTIONS };
  for (const key of VALID_OSC_OPTION_KEYS) {
    if (typeof userOptions[key] === 'boolean') {
      merged[key] = userOptions[key];
    }
  }
  return merged;
}

// ============================================
// Audio effects settings helpers
// ============================================

/**
 * Default compressor settings
 */
export const DEFAULT_COMPRESSOR_SETTINGS = Object.freeze({
  threshold: -24,
  knee: 30,
  ratio: 12,
  attack: 3, // ms
  release: 250, // ms
});

/**
 * Valid compressor parameter ranges
 */
export const COMPRESSOR_RANGES = Object.freeze({
  threshold: { min: -100, max: 0 },
  knee: { min: 0, max: 40 },
  ratio: { min: 1, max: 20 },
  attack: { min: 0, max: 100 }, // ms
  release: { min: 0, max: 1000 }, // ms
});

/**
 * Validate compressor parameter value.
 * @param {string} param - Parameter name
 * @param {number} value - Value to validate
 * @returns {boolean} true if valid
 */
export function isValidCompressorParam(param, value) {
  const range = COMPRESSOR_RANGES[param];
  if (!range) return false;
  return typeof value === 'number' && !isNaN(value) && value >= range.min && value <= range.max;
}

/**
 * Get compressor param label for display.
 * @param {string} param - Parameter name
 * @returns {string} Display label
 */
export function getCompressorParamLabel(param) {
  const labels = {
    threshold: 'Threshold (dB)',
    knee: 'Knee (dB)',
    ratio: 'Ratio',
    attack: 'Attack (ms)',
    release: 'Release (ms)',
  };
  return labels[param] || param;
}

/**
 * Build compressor settings validation result.
 * @param {object} settings - Settings object
 * @returns {object} Validation result with isValid, errors, cleaned
 */
export function validateCompressorSettings(settings) {
  const errors = [];
  const cleaned = {};

  if (!settings || typeof settings !== 'object') {
    return { isValid: false, errors: ['Settings must be an object'], cleaned: {} };
  }

  for (const param of Object.keys(COMPRESSOR_RANGES)) {
    const value = settings[param];
    if (value === undefined || value === null) {
      cleaned[param] = DEFAULT_COMPRESSOR_SETTINGS[param];
    } else if (isValidCompressorParam(param, value)) {
      cleaned[param] = value;
    } else {
      errors.push(`${param}: ${value} out of range [${COMPRESSOR_RANGES[param].min}, ${COMPRESSOR_RANGES[param].max}]`);
      cleaned[param] = DEFAULT_COMPRESSOR_SETTINGS[param];
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    cleaned,
  };
}

/**
 * Default EQ settings
 */
export const DEFAULT_EQ_SETTINGS = Object.freeze({
  hpfFreq: 20,
  lpfFreq: 22050,
  peakFreq: 1000,
  peakGain: 0,
  peakQ: 1,
});

/**
 * EQ filter type enum
 */
export const EQ_FILTER_TYPES = Object.freeze({
  HPF: 'highpass',
  LPF: 'lowpass',
  PEAKING: 'peaking',
});

/**
 * Build EQ settings message payload.
 * @param {object} params - EQ parameters
 * @returns {object} Message payload
 */
export function buildEqMessage(params = {}) {
  return buildEffectsMessage('EQ', params);
}

/**
 * Default delay settings
 */
export const DEFAULT_DELAY_SETTINGS = Object.freeze({
  delayTime: 0, // ms
  feedback: 0, // %
  mix: 0, // %
});

/**
 * Default limiter settings
 */
export const DEFAULT_LIMITER_SETTINGS = Object.freeze({
  threshold: -1, // dB
  attack: 1, // ms
  release: 100, // ms
});

// ============================================
// Utility helpers (pure functions)
// ============================================

/**
 * Clamp a value between min and max.
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum
 * @param {number} max - Maximum
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Remap value from one range to another.
 * @param {number} value - Value to remap
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Remapped value
 */
export function remap(value, inMin, inMax, outMin, outMax) {
  const ratio = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, ratio);
}

/**
 * Generate unique message ID.
 * @returns {string} Unique ID
 */
export function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Calculate average of an array.
 * @param {number[]} arr - Array of numbers
 * @returns {number} Average value
 */
export function calculateAverage(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate standard deviation of an array.
 * @param {number[]} arr - Array of numbers
 * @returns {number} Standard deviation
 */
export function calculateStdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const avg = calculateAverage(arr);
  const squareDiffs = arr.map(val => (val - avg) ** 2);
  return Math.sqrt(calculateAverage(squareDiffs));
}

/**
 * Format RMS value for display.
 * @param {number} rms - RMS value
 * @param {number} decimals - Decimal places (default: 3)
 * @returns {string} Formatted string
 */
export function formatRms(rms, decimals = 3) {
  return Number(rms).toFixed(decimals);
}

/**
 * Format percentage value for display.
 * @param {number} value - Value to format
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted string with %
 */
export function formatPercentage(value, decimals = 1) {
  return `${Number(value).toFixed(decimals)}%`;
}

/**
 * Determine if a metric value is anomalous based on thresholds.
 * @param {number} value - Metric value
 * @param {number} threshold - Threshold for anomaly detection
 * @param {'above' | 'below'} direction - Anomaly direction
 * @returns {boolean} true if anomalous
 */
export function isAnomalous(value, threshold, direction = 'above') {
  if (direction === 'above') {
    return value > threshold;
  }
  return value < threshold;
}

/**
 * Calculate band ratio (e.g., bass/mid, mid/treble).
 * @param {number} numerator - Band energy (numerator)
 * @param {number} denominator - Band energy (denominator)
 * @returns {number} Ratio in dB (returns -Infinity if denominator is 0)
 */
export function calculateBandRatioDb(numerator, denominator) {
  if (denominator <= 0) return -Infinity;
  return 10 * Math.log10(numerator / denominator);
}
