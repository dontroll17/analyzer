/**
 * Vitest setup — polyfills and mocks for browser APIs
 * Adapted from jest.setup.js to use Vitest globals
 */
import { vi, afterEach } from 'vitest';

// Clear mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});

// Polyfill window for Node.js
if (typeof global.window === 'undefined') {
  global.window = {
    dispatchEvent: () => {},
    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
  };
}

// Polyfill document
if (typeof global.document === 'undefined') {
  global.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({
      addEventListener: () => {},
      removeEventListener: () => {},
      setAttribute: () => {},
      getAttribute: () => null,
      appendChild: () => {},
      removeChild: () => {},
      textContent: '',
      style: {},
    }),
    body: { appendChild: () => {}, removeChild: () => {} },
    head: { appendChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

// Polyfill localStorage
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    _data: {},
    getItem: (key) => global.localStorage._data[key] || null,
    setItem: (key, value) => { global.localStorage._data[key] = String(value); },
    removeItem: (key) => { delete global.localStorage._data[key]; },
    clear: () => { global.localStorage._data = {}; },
  };
}

// Polyfill MediaStream
if (typeof global.MediaStream === 'undefined') {
  global.MediaStream = class MediaStream {
    constructor(tracks = []) {
      this._tracks = tracks;
      this.active = true;
      this.id = 'mock-' + Math.random().toString(36).substr(2, 9);
    }
    getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return this._tracks.filter(t => t.kind === 'video'); }
    getTracks() { return this._tracks; }
    addTrack(track) { this._tracks.push(track); }
    removeTrack(track) {
      const idx = this._tracks.indexOf(track);
      if (idx >= 0) this._tracks.splice(idx, 1);
    }
  };
}

// Mock chrome.storage
if (typeof global.chrome === 'undefined') {
  global.chrome = {
    runtime: {
      id: 'test-extension-id',
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: vi.fn((msg) => Promise.resolve({ ok: true })),
      connect: vi.fn((portInfo) => {
        const port = {
          name: portInfo?.name || 'default',
          postMessage: vi.fn(),
          disconnect: vi.fn(),
          onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
          onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
          _disconnected: false,
        };
        // Simulate disconnect event
        setTimeout(() => {
          if (!port._disconnected) {
            port._disconnected = true;
            port.onDisconnect.addListener.listeners?.forEach(fn => fn());
          }
        }, 0);
        return port;
      }),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      lastError: undefined,
    },
    storage: {
      local: {
        _data: {},
        get: vi.fn((keys) => {
          const result = {};
          const keyArr = Array.isArray(keys) ? keys : [keys];
          for (const k of keyArr) {
            if (k in chrome.storage.local._data) {
              result[k] = chrome.storage.local._data[k];
            }
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((obj) => {
          if (obj && typeof obj === 'object') {
            Object.assign(chrome.storage.local._data, obj);
          }
          return Promise.resolve();
        }),
        remove: vi.fn((keys) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          for (const k of keyArr) {
            delete chrome.storage.local._data[k];
          }
          return Promise.resolve();
        }),
        clear: vi.fn(() => {
          chrome.storage.local._data = {};
          return Promise.resolve();
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    tabCapture: {
      getMediaStreamId: vi.fn(() => Promise.resolve('mock-stream-123')),
      get: vi.fn(() => Promise.resolve(null)),
      onCaptured: { addListener: vi.fn() },
    },
    offscreen: {
      hasDocument: vi.fn(() => Promise.resolve(false)),
      createDocument: vi.fn(() => Promise.resolve()),
      closeDocument: vi.fn(() => Promise.resolve()),
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(() => Promise.resolve(true)),
      clearAll: vi.fn(() => Promise.resolve(true)),
      onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(() => Promise.resolve([])),
    },
    tabs: {
      query: vi.fn(() => Promise.resolve([])),
      sendMessage: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve({ id: 1 })),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    extension: {
      inIncognitoContext: false,
      getURL: (path) => `chrome-extension://test-id/${path}`,
    },
    contextMenus: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      removeAll: vi.fn(),
    },
  };
}

// Mock navigator.mediaDevices
if (typeof global.navigator === 'undefined') {
  global.navigator = {};
}

// MediaStream mock factory
export function createMockMediaStream(audioTracks = 2, audioReadyState = 'live') {
  const tracks = [];
  for (let i = 0; i < audioTracks; i++) {
    const track = {
      stop: vi.fn(),
      readyState: audioReadyState,
      kind: 'audio',
      enabled: true,
      muted: false,
      _listeners: {},
      addEventListener: function(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
      },
      removeEventListener: function(event, fn) {
        if (this._listeners[event]) {
          const idx = this._listeners[event].indexOf(fn);
          if (idx >= 0) this._listeners[event].splice(idx, 1);
        }
      },
      dispatchEvent: function(event) {
        if (this._listeners[event]) {
          this._listeners[event].forEach(fn => fn({ type: event }));
        }
        return true;
      },
    };
    tracks.push(track);
  }
  return {
    getAudioTracks: vi.fn().mockReturnValue(tracks),
    getVideoTracks: vi.fn().mockReturnValue([]),
    getTracks: vi.fn().mockReturnValue(tracks),
    addTrack: vi.fn((track) => tracks.push(track)),
    removeTrack: vi.fn((track) => {
      const idx = tracks.indexOf(track);
      if (idx >= 0) tracks.splice(idx, 1);
    }),
    active: true,
    id: 'mock-stream-' + Math.random().toString(36).substr(2, 9),
    onaddtrack: null,
    onremovetrack: null,
  };
}

// Mock getDisplayMedia (tab capture)
const mockGetDisplayMedia = vi.fn().mockImplementation((constraints) => {
  return Promise.resolve(createMockMediaStream(2, 'live'));
});

// Mock getUserMedia (microphone)
const mockGetUserMedia = vi.fn().mockImplementation((constraints) => {
  return Promise.resolve(createMockMediaStream(1, 'live'));
});

global.navigator.mediaDevices = {
  getUserMedia: mockGetUserMedia,
  getDisplayMedia: mockGetDisplayMedia,
  enumerateDevices: vi.fn().mockResolvedValue([]),
  ondevicechange: null,
};

// Mock MediaStream class (if not already mocked)
if (typeof global.MediaStream === 'undefined') {
  global.MediaStream = class MediaStream {
    constructor(tracks = []) {
      this._tracks = tracks;
      this.active = true;
      this.id = 'mock-' + Math.random().toString(36).substr(2, 9);
    }
    getAudioTracks() { return this._tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return this._tracks.filter(t => t.kind === 'video'); }
    getTracks() { return this._tracks; }
    addTrack(track) { this._tracks.push(track); }
    removeTrack(track) {
      const idx = this._tracks.indexOf(track);
      if (idx >= 0) this._tracks.splice(idx, 1);
    }
    onaddtrack = null;
    onremovetrack = null;
  };
}

// Mock AudioContext
if (typeof global.AudioContext === 'undefined') {
  global.AudioContext = vi.fn().mockReturnValue({
    audioWorklet: { addModule: vi.fn() },
    createGain: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
      gain: { value: 1, set: vi.fn() },
    }),
    createBiquadFilter: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
      type: 'highpass', frequency: { value: 5, set: vi.fn() },
    }),
    createDynamicsCompressor: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
      threshold: { value: -24, set: vi.fn() },
      knee: { value: 30, set: vi.fn() },
      ratio: { value: 12, set: vi.fn() },
      attack: { value: 0.003, set: vi.fn() },
      release: { value: 0.250, set: vi.fn() },
    }),
    createScriptProcessor: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createMediaStreamSource: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createMediaStreamDestination: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createAnalyser: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(),
    }),
    createOscillator: vi.fn().mockReturnValue({
      connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    }),
    close: vi.fn(() => Promise.resolve()),
    state: 'running',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

if (typeof global.OfflineAudioContext === 'undefined') {
  global.OfflineAudioContext = vi.fn().mockReturnValue({
    startRendering: vi.fn(() => Promise.resolve(new global.AudioBuffer())),
    length: 44100,
    sampleRate: 44100,
  });
}

// AudioBuffer mock
if (typeof global.AudioBuffer === 'undefined') {
  global.AudioBuffer = class AudioBuffer {
    constructor(opts = {}) {
      this.length = opts.length || 44100;
      this.sampleRate = opts.sampleRate || 44100;
    }
  };
}

// === Test Helper Utilities ===

/**
 * Create a mock metrics object for testing
 */
export function createMockMetrics(overrides = {}) {
  return {
    rms: 0.5,
    peakRMS: 0.8,
    bass: 40,
    mid: 35,
    treble: 25,
    glitchState: 'STABLE',
    glitchCount: 0,
    entropy: 0.3,
    flatness: 0.1,
    entropyState: 'STABLE',
    rtt: 0,
    audioDrops: 0,
    waveform: new Float32Array(1024).fill(0.1),
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Simulate chrome.runtime.lastError
 */
export function setChromeLastError(message) {
  chrome.runtime.lastError = { message };
}

/**
 * Clear chrome.runtime.lastError
 */
export function clearChromeLastError() {
  chrome.runtime.lastError = undefined;
}
