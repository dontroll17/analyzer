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
 * Valid overlay modes for content script
 */
export const VALID_OVERLAY_MODES = Object.freeze(['expanded', 'compact', 'sidebar', 'mini']);

/**
 * Valid capture source types for audio capture
 */
export const VALID_CAPTURE_SOURCES = Object.freeze(['tab', 'mic', 'combined']);

/**
 * Storage keys used by popup and background
 */
export const STORAGE_KEYS = Object.freeze({
  DROP_COUNT: 'ssa_audio_drop_count',
  OVERLAY_POSITION: 'overlayPosition',
  OVERLAY_MODE: 'overlayMode',
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
 * Validate overlay mode parameter.
 * @param {*} value - Value to validate
 * @returns {boolean} true if valid overlay mode
 */
export function isValidOverlayMode(value) {
  return VALID_OVERLAY_MODES.includes(value);
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
 * Build overlay toggle message payload.
 * @param {'SHOW' | 'HIDE'} action - Action to perform
 * @returns {object} Message payload
 */
export function buildOverlayMessage(action) {
  const type = action === 'SHOW' ? '_SSA_SHOW_OVERLAY' : '_SSA_HIDE_OVERLAY';
  return { type };
}
