// popup/config-mock.js — Mock for popup/config.js ES modules
// Uses vi.fn() spies so tests can assert on calls

const DEFAULTS = Object.freeze({
  theme: 'neon',
  glitchSensitivity: 85,
  oscFreeze: false,
  oscZoom: false,
  oscLogScale: false,
  oscSplit: false,
  perfMonitorVisible: false,
  captureSource: 'tab',
  heatmapEnabled: true,
});

const KEYS = Object.freeze({
  theme: 'ssa_theme',
  glitchSensitivity: 'ssa_glitchSensitivity',
  oscFreeze: 'ssa_oscFreeze',
  oscZoom: 'ssa_oscZoom',
  oscLogScale: 'ssa_oscLogScale',
  oscOptions: 'ssa_oscOptions',
  oscSplit: 'ssa_oscSplit',
  oscRefSet: 'ssa_oscRefSet',
  perfMonitorVisible: 'ssa_perfMonitorVisible',
  captureSource: 'ssa_captureSource',
  heatmapEnabled: 'ssa_heatmapEnabled',
});

// Import setup.js chrome mocks and extend them
import '../setup.js';

// Override chrome.storage.local with our implementation
const _get = vi.fn((keys, cb) => {
  const result = {};
  const keyArr = Array.isArray(keys) ? keys : [keys];
  for (const k of keyArr) {
    // Read from chrome.storage.local._data (shared with setup.js)
    if (k in global.chrome.storage.local._data) result[k] = global.chrome.storage.local._data[k];
  }
  if (typeof cb === 'function') cb(result);
  return Promise.resolve(result);
});

const _set = vi.fn((obj, cb) => {
  if (obj && typeof obj === 'object') {
    Object.assign(global.chrome.storage.local._data, obj);
  }
  if (typeof cb === 'function') cb();
  return Promise.resolve();
});

const _clear = vi.fn(() => {
  Object.keys(global.chrome.storage.local._data).forEach(k => delete global.chrome.storage.local._data[k]);
});

const _remove = vi.fn((key) => {
  delete global.chrome.storage.local._data[key];
});

// Extend global chrome with our storage mock
global.chrome.storage.local.get = _get;
global.chrome.storage.local.set = _set;
global.chrome.storage.local.clear = _clear;
global.chrome.storage.local.remove = _remove;

async function loadSettings() {
  const result = await _get(Object.values(KEYS));
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

async function saveSetting(key, value) {
  const storageKey = KEYS[key];
  if (!storageKey) {
    console.warn('[Config] Unknown setting key:', key);
    return;
  }
  let payload;
  if (key === 'oscFreeze' || key === 'oscZoom' || key === 'oscLogScale') {
    const oscResult = await _get(KEYS.oscOptions);
    const existing = oscResult[KEYS.oscOptions] || {
      freeze: DEFAULTS.oscFreeze,
      zoom: DEFAULTS.oscZoom,
      logScale: DEFAULTS.oscLogScale,
    };
    if (key === 'oscFreeze') existing.freeze = value;
    if (key === 'oscZoom') existing.zoom = value;
    if (key === 'oscLogScale') existing.logScale = value;
    payload = { [storageKey]: value };
    payload[KEYS.oscOptions] = existing;
    const refResult = await _get(KEYS.oscRefSet);
    payload[KEYS.oscRefSet] = !!refResult[KEYS.oscRefSet];
  } else if (key === 'oscSplit') {
    const refResult = await _get(KEYS.oscRefSet);
    payload = { [storageKey]: value, [KEYS.oscRefSet]: !!refResult[KEYS.oscRefSet] };
  } else {
    payload = { [storageKey]: value };
  }
  await _set(payload);
}

async function getSettings() {
  return loadSettings();
}

async function resetSettings() {
  await _clear();
}

export { loadSettings, saveSetting, getSettings, resetSettings, KEYS, DEFAULTS, mockData, _get, _set, _clear };
