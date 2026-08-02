/**
 * Jest setup file — polyfills for browser APIs not available in Node.js
 */

// Polyfill window object for Node.js test environment
if (typeof global.window === 'undefined') {
  global.window = {
    dispatchEvent: jest.fn(),
    matchMedia: jest.fn(() => ({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    })),
  };

  // Polyfill CustomEvent for Node.js
  if (typeof global.CustomEvent === 'undefined') {
    global.CustomEvent = class CustomEvent {
      constructor(event, options = {}) {
        this.type = event;
        this.detail = options.detail || null;
      }
    };
  }
}

// Polyfill document for Node.js test environment
if (typeof global.document === 'undefined') {
  global.document = {
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    getElementById: jest.fn(() => null),
    createElement: jest.fn(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      setAttribute: jest.fn(),
      getAttribute: jest.fn(() => null),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      setTextContent: jest.fn(),
      textContent: '',
      innerHTML: '',
      style: {},
    })),
    createTextNode: jest.fn(() => ({ nodeValue: '' })),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    head: {
      appendChild: jest.fn(),
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: jest.fn(() => null),
  };
}

// Polyfill localStorage
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    _data: {},
    getItem: jest.fn((key) => global.localStorage._data[key] || null),
    setItem: jest.fn((key, value) => { global.localStorage._data[key] = String(value); }),
    removeItem: jest.fn((key) => { delete global.localStorage._data[key]; }),
    clear: jest.fn(() => { global.localStorage._data = {}; }),
  };
}

// Polyfill console.info/debug for Jest environment
if (typeof console.info === 'undefined') {
  console.info = console.log;
}
if (typeof console.debug === 'undefined') {
  console.debug = console.log;
}

// ============================================
// navigator.mediaDevices mocks (getDisplayMedia, getUserMedia)
// ============================================
// Critical: without these, real audio capture APIs may be called
// during tests, triggering Windows Defender false positives (!#SLF:CMD_HSTR)

if (typeof global.navigator === 'undefined') {
  global.navigator = {};
}

// MediaStream mock factory
function createMockMediaStream(audioTracks = 2, audioReadyState = 'live') {
  const tracks = [];
  for (let i = 0; i < audioTracks; i++) {
    tracks.push({
      stop: jest.fn(),
      readyState: audioReadyState,
      kind: 'audio',
      enabled: true,
      muted: false,
    });
  }
  return {
    getAudioTracks: jest.fn().mockReturnValue(tracks),
    getVideoTracks: jest.fn().mockReturnValue([]),
    getTracks: jest.fn().mockReturnValue(tracks),
    addTrack: jest.fn((track) => tracks.push(track)),
    removeTrack: jest.fn((track) => {
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
const mockGetDisplayMedia = jest.fn().mockImplementation((constraints) => {
  // Return stream with audio tracks by default
  return Promise.resolve(createMockMediaStream(2, 'live'));
});

// Mock getUserMedia (microphone)
const mockGetUserMedia = jest.fn().mockImplementation((constraints) => {
  return Promise.resolve(createMockMediaStream(1, 'live'));
});

// Set up navigator.mediaDevices
global.navigator.mediaDevices = {
  getUserMedia: mockGetUserMedia,
  getDisplayMedia: mockGetDisplayMedia,
  enumerateDevices: jest.fn().mockResolvedValue([]),
  ondevicechange: null,
};

// Mock MediaStream class (if not already mocked by test)
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

// Mock AudioBuffer
if (typeof global.AudioBuffer === 'undefined') {
  global.AudioBuffer = class AudioBuffer {
    constructor(opts = {}) {
      this.length = opts.length || 44100;
      this.sampleRate = opts.sampleRate || 44100;
    }
  };
}

// AudioContext (AudioWorklet unavailable in Jest)
if (typeof global.AudioContext === 'undefined') {
  global.AudioContext = jest.fn().mockReturnValue({
    audioWorklet: { addModule: jest.fn() },
    createGain: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn(), gain: { value: 1 } }),
    createBiquadFilter: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    createScriptProcessor: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    createMediaStreamSource: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    createMediaStreamDestination: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    createAnalyser: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    createOscillator: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }),
    createCompressor: jest.fn().mockReturnValue({ connect: jest.fn(), disconnect: jest.fn() }),
    close: jest.fn(() => Promise.resolve()),
  });
}

if (typeof global.OfflineAudioContext === 'undefined') {
  global.OfflineAudioContext = jest.fn().mockReturnValue({
    startRendering: jest.fn(() => Promise.resolve(new global.AudioBuffer())),
    length: 44100,
    sampleRate: 44100,
  });
}

// ============================================
// Chrome Extension API Mocks
// ============================================
// These mocks allow testing Chrome Extension API calls without a real browser.
// Every method is a jest.fn() so we can verify how, when, and with what params
// they were called — catching bugs like the 2026-07-31 "targetTab" regression.

global.chrome = {
  // ===================== runtime API =====================
  runtime: {
    id: 'test-extension-id',
    getURL: (path) => `chrome-extension://test-id/${path}`,
    sendMessage: jest.fn((msg, cb) => {
      if (cb) cb({ ok: true });
      return Promise.resolve({ ok: true });
    }),
    postMessage: jest.fn(),
    connect: jest.fn((obj) => ({
      name: obj?.name || 'default',
      postMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    })),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onConnect: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
    },
    lastError: undefined,
  },

  // ===================== storage API =====================
  storage: {
    local: {
      // In-memory key-value store for tests
      _data: {},
      get: jest.fn((keys, cb) => {
        const result = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArr) {
          if (k in chrome.storage.local._data) {
            result[k] = chrome.storage.local._data[k];
          }
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((obj, cb) => {
        if (obj && typeof obj === 'object') {
          Object.assign(chrome.storage.local._data, obj);
        }
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: jest.fn((keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        for (const k of keyArr) {
          delete chrome.storage.local._data[k];
        }
        if (cb) cb();
        return Promise.resolve();
      }),
      clear: jest.fn((cb) => {
        chrome.storage.local._data = {};
        if (cb) cb();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  // ===================== tabs API =====================
  tabs: {
    query: jest.fn((query, cb) => {
      if (cb) cb([]);
      return Promise.resolve([]);
    }),
    sendMessage: jest.fn((tabId, msg, cb) => {
      if (cb) cb();
      return Promise.resolve();
    }),
    create: jest.fn((obj, cb) => {
      if (cb) cb({ id: 1 });
      return Promise.resolve({ id: 1 });
    }),
    update: jest.fn((tabId, obj, cb) => {
      if (cb) cb();
      return Promise.resolve();
    }),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  // ===================== tabCapture API =====================
  tabCapture: {
    getMediaStreamId: jest.fn((opts, cb) => {
      if (cb) cb(null);
      return Promise.resolve(null);
    }),
    get: jest.fn((opts, cb) => {
      if (cb) cb(null);
      return Promise.resolve(null);
    }),
    onCaptured: {
      addListener: jest.fn(),
    },
  },

  // ===================== alarms API =====================
  alarms: {
    create: jest.fn((name, obj) => {
      // no-op
    }),
    clear: jest.fn((name, cb) => {
      if (cb) cb(true);
      return Promise.resolve(true);
    }),
    clearAll: jest.fn((cb) => {
      if (cb) cb(true);
      return Promise.resolve(true);
    }),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },

  // ===================== offscreen API =====================
  offscreen: {
    createDocument: jest.fn((obj) => Promise.resolve()),
    closeDocument: jest.fn(() => Promise.resolve()),
    hasDocument: jest.fn(() => Promise.resolve(false)),
  },

  // ===================== extension API =====================
  extension: {
    inIncognitoContext: false,
    getURL: (path) => `chrome-extension://test-id/${path}`,
  },

  // ===================== contextMenus API (minimal) =====================
  contextMenus: {
    create: jest.fn((id, obj) => {}),
    update: jest.fn(),
    remove: jest.fn(),
    removeAll: jest.fn(),
  },
};

// ===================== Helper: simulate chrome.runtime.lastError =====================

/**
 * Set chrome.runtime.lastError for a test (simulates API error response).
 * Use in beforeEach or directly before the call you want to error.
 */
global.setChromeLastError = function (message) {
  chrome.runtime.lastError = { message };
};

/**
 * Clear chrome.runtime.lastError (reset to undefined).
 */
global.clearChromeLastError = function () {
  chrome.runtime.lastError = undefined;
};
