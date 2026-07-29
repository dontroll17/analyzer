// popup/config.js — Centralized settings manager for Stream Sensation Analyzer
// All UI state persisted in chrome.storage.local with default values and getters.

const DEFAULTS = Object.freeze({
  // Theme
  theme: 'dark',
  
  // Glitch sensitivity (60-90%)
  glitchSensitivity: 85,
  
  // Oscilloscope options
  oscFreeze: false,
  oscZoom: false,
  oscLogScale: false,
  oscSplit: false,
  
  // Performance monitor
  perfMonitorVisible: false,
  
  // Capture source: 'tab' | 'mic' | 'combined'
  captureSource: 'tab',
  
  // Heatmap
  heatmapEnabled: true,
});

const KEYS = Object.freeze({
  theme: 'ssa_theme',
  glitchSensitivity: 'ssa_glitchSensitivity',
  oscOptions: 'ssa_oscOptions',
  oscSplit: 'ssa_oscSplit',
  oscRefSet: 'ssa_oscRefSet',
  perfMonitorVisible: 'ssa_perfMonitorVisible',
  captureSource: 'ssa_captureSource',
  heatmapEnabled: 'ssa_heatmapEnabled',
});

/**
 * Load all settings from chrome.storage.local
 * Returns an object with all current settings (defaults if not stored)
 */
export async function loadSettings() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(Object.values(KEYS), resolve);
  });

  return {
    theme: result[KEYS.theme] || DEFAULTS.theme,
    glitchSensitivity: result[KEYS.glitchSensitivity] ?? DEFAULTS.glitchSensitivity,
    oscFreeze: result[KEYS.oscOptions]?.freeze || DEFAULTS.oscFreeze,
    oscZoom: result[KEYS.oscOptions]?.zoom || DEFAULTS.oscZoom,
    oscLogScale: result[KEYS.oscOptions]?.logScale || DEFAULTS.oscLogScale,
    oscSplit: result[KEYS.oscSplit] || DEFAULTS.oscSplit,
    oscRefSet: !!result[KEYS.oscRefSet],
    perfVisible: result[KEYS.perfMonitorVisible] || DEFAULTS.perfMonitorVisible,
    captureSource: result[KEYS.captureSource] || DEFAULTS.captureSource,
    heatmapEnabled: result[KEYS.heatmapEnabled] ?? DEFAULTS.heatmapEnabled,
  };
}

/**
 * Save a single setting to chrome.storage.local
 * @param {string} key - Setting key (one of KEYS)
 * @param {*} value - Value to save
 */
export async function saveSetting(key, value) {
  const storageKey = KEYS[key];
  if (!storageKey) {
    console.warn('[Config] Unknown setting key:', key);
    return;
  }

  let payload;
  
  // Special handling for grouped settings (oscOptions)
  if (key === 'oscFreeze' || key === 'oscZoom' || key === 'oscLogScale') {
    const existing = await loadOscOptions();
    if (key === 'oscFreeze') existing.freeze = value;
    if (key === 'oscZoom') existing.zoom = value;
    if (key === 'oscLogScale') existing.logScale = value;
    payload = { [storageKey]: value };
    payload[KEYS.oscOptions] = existing;
    payload[KEYS.oscRefSet] = await loadOscRefState();
  } else if (key === 'oscSplit') {
    payload = { [storageKey]: value, [KEYS.oscRefSet]: await loadOscRefState() };
  } else {
    payload = { [storageKey]: value };
  }

  chrome.storage.local.set(payload);
}

/**
 * Load oscilloscope options (freeze, zoom, logScale) as a single object
 */
async function loadOscOptions() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(KEYS.oscOptions, resolve);
  });
  return result[KEYS.oscOptions] || {
    freeze: DEFAULTS.oscFreeze,
    zoom: DEFAULTS.oscZoom,
    logScale: DEFAULTS.oscLogScale,
  };
}

/**
 * Load oscilloscope reference state
 */
async function loadOscRefState() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(KEYS.oscRefSet, resolve);
  });
  return !!result[KEYS.oscRefSet];
}

/**
 * Get all current settings as a single object
 * (Alias for loadSettings, included for API clarity)
 */
export async function getSettings() {
  return loadSettings();
}

/**
 * Reset all settings to defaults
 */
export async function resetSettings() {
  chrome.storage.local.clear();
}
