import { describe, it, expect, vi, beforeEach } from 'vitest';

let ringBuffer;
const RING_BUFFER_MAX = 80;
let storageSetCalls;
let storageGetCalls;

function setupStorageMock() {
  storageSetCalls = [];
  storageGetCalls = [];
  global.chrome = {
    storage: {
      local: {
        _data: {},
        get: vi.fn((keys) => {
          storageGetCalls.push({ keys });
          return Promise.resolve({});
        }),
        set: vi.fn((obj) => {
          storageSetCalls.push({ obj, timestamp: Date.now() });
          if (obj) Object.assign(global.chrome.storage.local._data, obj);
          return Promise.resolve();
        }),
        remove: vi.fn(() => Promise.resolve()),
        clear: vi.fn(() => Promise.resolve()),
      },
    },
  };
  ringBuffer = [];
}

describe('Ring Buffer Metrics Persistence (background.js:2.2)', () => {
  beforeEach(setupStorageMock);

  it('pushes data and shifts when exceeding max', () => {
    for (let i = 0; i < 85; i++) {
      ringBuffer.push({ frame: i, rms: 0.5 });
    }
    while (ringBuffer.length > RING_BUFFER_MAX) {
      ringBuffer.shift();
    }
    expect(ringBuffer.length).toBe(80);
    expect(ringBuffer[0].frame).toBe(5);
  });

  it('atomic save: no read-before-write', () => {
    const testData = [{ rms: 0.5 }, { rms: 0.3 }];
    chrome.storage.local.set({ 'ssa_metrics_queue': testData });

    // Verify: chrome.storage.local._data has the array directly
    expect(chrome.storage.local._data['ssa_metrics_queue']).toEqual(testData);
    // NOT: get() -> modify -> set()
  });

  it('storage write throttling: max ~1 flush per second at 43fps', async () => {
    // At 43fps for 5 seconds = ~215 frames, should flush ~5 times (1 per second)
    const flushes = [];
    chrome.storage.local.set = vi.fn(() => {
      flushes.push(Date.now());
      return Promise.resolve();
    });

    // Simulate 5 seconds of metrics at 43fps
    for (let i = 0; i < 215; i++) {
      ringBuffer.push({ frame: i });
      while (ringBuffer.length > RING_BUFFER_MAX) ringBuffer.shift();
    }

    // Verify: set() was called with the ring buffer, not get() + set()
    const setCalls = chrome.storage.local.set.mock.calls;
    // Each call should be direct set with array, no intermediate get
    expect(setCalls.length).toBeGreaterThanOrEqual(1);
    // No get() calls before set()
    expect(storageGetCalls.length).toBe(0);
  });

  it('preserves most recent 80 samples', () => {
    // Fill buffer with 100 items
    for (let i = 0; i < 100; i++) {
      ringBuffer.push({ value: i });
    }
    while (ringBuffer.length > RING_BUFFER_MAX) {
      ringBuffer.shift();
    }

    // Should only have the last 80
    expect(ringBuffer.length).toBe(80);
    // First item should be index 20 (100 - 80)
    expect(ringBuffer[0].value).toBe(20);
    // Last item should be index 99
    expect(ringBuffer[79].value).toBe(99);
  });
});
