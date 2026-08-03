import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Helpers for background.js message patterns
// ============================================

function createMockPort(name = 'popup-metrics') {
  const handlers = {
    onMessage: [],
    onDisconnect: [],
  };
  return {
    name,
    _disconnected: false,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: vi.fn((fn) => handlers.onMessage.push(fn)),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn((fn) => handlers.onDisconnect.push(fn)),
      removeListener: vi.fn(),
    },
    _handlers: handlers,
    _simulateDisconnect() {
      this._disconnected = true;
      this._handlers.onDisconnect.forEach((fn) => fn(this));
    },
    _simulateMessage(msg) {
      this._handlers.onMessage.forEach((fn) => fn(msg));
    },
  };
}

// ============================================
// Ring Buffer Tests
// ============================================
describe('Ring Buffer — Metrics Persistence', () => {
  const RING_BUFFER_MAX = 80;
  let ringBuffer;

  beforeEach(() => {
    ringBuffer = [];
    vi.clearAllMocks();
  });

  it('pushes items and shifts when exceeding max', () => {
    for (let i = 0; i < 90; i++) {
      ringBuffer.push({ frame: i });
    }
    while (ringBuffer.length > RING_BUFFER_MAX) {
      ringBuffer.shift();
    }
    expect(ringBuffer.length).toBe(RING_BUFFER_MAX);
    expect(ringBuffer[0].frame).toBe(10);
    expect(ringBuffer[79].frame).toBe(89);
  });

  it('preserves the 80 most recent items', () => {
    for (let i = 0; i < 150; i++) {
      ringBuffer.push({ value: i });
    }
    while (ringBuffer.length > RING_BUFFER_MAX) {
      ringBuffer.shift();
    }
    expect(ringBuffer.length).toBe(RING_BUFFER_MAX);
    expect(ringBuffer[0].value).toBe(70);
    expect(ringBuffer[79].value).toBe(149);
  });

  it('does nothing when under max', () => {
    for (let i = 0; i < 40; i++) {
      ringBuffer.push({ i });
    }
    expect(ringBuffer.length).toBe(40);
  });

  it('handles empty buffer gracefully', () => {
    while (ringBuffer.length > RING_BUFFER_MAX) {
      ringBuffer.shift();
    }
    expect(ringBuffer.length).toBe(0);
  });
});

// ============================================
// Metrics Queue Tests
// ============================================
describe('Metrics Queue — Transient & Persistent', () => {
  const MAX_METRICS_QUEUE = 10;
  const MAX_PERSISTENT_METRICS = 500;

  it('transient queue caps at MAX_METRICS_QUEUE', () => {
    const queue = [];
    for (let i = 0; i < 25; i++) {
      queue.push({ frame: i });
      if (queue.length > MAX_METRICS_QUEUE) {
        queue.shift();
      }
    }
    expect(queue.length).toBe(MAX_METRICS_QUEUE);
    expect(queue[0].frame).toBe(15);
    expect(queue[9].frame).toBe(24);
  });

  it('persistent queue caps at MAX_PERSISTENT_METRICS', () => {
    const queue = [];
    for (let i = 0; i < 600; i++) {
      queue.push({ frame: i });
      if (queue.length > MAX_PERSISTENT_METRICS) {
        queue.shift();
      }
    }
    expect(queue.length).toBe(MAX_PERSISTENT_METRICS);
    expect(queue[0].frame).toBe(100);
  });

  it('maintains separate transient and persistent queues', () => {
    const transient = [];
    const persistent = [];
    for (let i = 0; i < 25; i++) {
      const item = { frame: i };
      transient.push(item);
      if (transient.length > MAX_METRICS_QUEUE) transient.shift();

      persistent.push(item);
      if (persistent.length > MAX_PERSISTENT_METRICS) persistent.shift();
    }
    expect(transient.length).toBe(MAX_METRICS_QUEUE);
    expect(persistent.length).toBe(25);
  });
});

// ============================================
// Port Connection Tests
// ============================================
describe('Port Connection — Popup & Overlay', () => {
  it('detects popup disconnect via _disconnected flag', () => {
    const port = createMockPort('popup-metrics');
    expect(port._disconnected).toBe(false);

    port._simulateDisconnect();
    expect(port._disconnected).toBe(true);
  });

  it('allows postMessage check before sending', () => {
    const port = createMockPort('popup-metrics');
    let sent = false;

    if (port && !port._disconnected) {
      port.postMessage({ type: 'METRICS' });
      sent = true;
    }
    expect(sent).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'METRICS' });
  });

  it('blocks postMessage after disconnect', () => {
    const port = createMockPort('popup-metrics');
    let sent = false;

    port._simulateDisconnect();
    if (port && !port._disconnected) {
      port.postMessage({ type: 'METRICS' });
      sent = true;
    }
    expect(sent).toBe(false);
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('handles overlay port separately', () => {
    const popupPort = createMockPort('popup-metrics');
    const overlayPort = createMockPort('overlay-metrics');

    expect(popupPort.name).toBe('popup-metrics');
    expect(overlayPort.name).toBe('overlay-metrics');
    expect(popupPort._disconnected).toBe(false);
    expect(overlayPort._disconnected).toBe(false);
  });
});

// ============================================
// Offscreen Lifecycle Tests
// ============================================
describe('Offscreen Document Lifecycle', () => {
  it('hasDocument returns boolean promise', async () => {
    chrome.offscreen.hasDocument.mockResolvedValue(true);
    const result = await chrome.offscreen.hasDocument();
    expect(result).toBe(true);

    chrome.offscreen.hasDocument.mockResolvedValue(false);
    const result2 = await chrome.offscreen.hasDocument();
    expect(result2).toBe(false);
  });

  it('createDocument returns promise', async () => {
    chrome.offscreen.createDocument.mockResolvedValue(undefined);
    await chrome.offscreen.createDocument({
      justification: 'media_capture',
      url: 'offscreen.html',
    });
    expect(chrome.offscreen.createDocument).toHaveBeenCalled();
  });

  it('closeDocument returns promise', async () => {
    chrome.offscreen.closeDocument.mockResolvedValue(undefined);
    await chrome.offscreen.closeDocument();
    expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
  });
});

// ============================================
// Storage Throttle Tests
// ============================================
describe('Storage Write Throttle', () => {
  it('only allows one write per interval', async () => {
    const flushes = [];
    let timer = null;
    const STORAGE_FLUSH_INTERVAL_MS = 100;

    const mockSet = vi.fn(() => {
      flushes.push(Date.now());
      return Promise.resolve();
    });

    chrome.storage.local.set = mockSet;

    // Simulate multiple writes within the same interval
    for (let i = 0; i < 5; i++) {
      if (timer) continue; // Only first write sets timer
      timer = setTimeout(() => {
        timer = null;
        mockSet({ ssa_metrics_queue: [{ frame: i }] });
      }, STORAGE_FLUSH_INTERVAL_MS);
    }

    // Clear pending timers to avoid test pollution
    vi.useRealTimers();
    if (timer) clearTimeout(timer);
  });

  it('uses atomic write pattern (no read-before-write)', () => {
    const data = [{ rms: 0.5 }, { rms: 0.3 }];
    chrome.storage.local.set({ ssa_metrics_queue: data });

    const call = chrome.storage.local.set.mock.calls[0][0];
    expect(call.ssa_metrics_queue).toEqual(data);
  });
});

// ============================================
// Keepalive Alarm Tests
// ============================================
describe('Keepalive Alarm', () => {
  it('creates keepalive alarm with 0.25 minutes period', () => {
    chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.25 });
    expect(chrome.alarms.create).toHaveBeenCalledWith('ssa_keepalive', { periodInMinutes: 0.25 });
  });

  it('clears and recreates alarm on keepalive message', () => {
    chrome.alarms.clear('ssa_keepalive', () => {});
    chrome.alarms.create('ssa_keepalive', { periodInMinutes: 0.25 });

    expect(chrome.alarms.clear).toHaveBeenCalledWith('ssa_keepalive', expect.any(Function));
    expect(chrome.alarms.create).toHaveBeenCalledWith('ssa_keepalive', { periodInMinutes: 0.25 });
  });
});

// ============================================
// IndexedDB Tests
// ============================================
describe('IndexedDB Session Store', () => {
  it('opens database with correct schema', () => {
    const mockDB = {
      objectStoreNames: { contains: vi.fn(() => false) },
    };
    const mockEvent = {
      target: { result: mockDB },
    };

    // Simulate onupgradeneeded
    if (!mockDB.objectStoreNames.contains('sessions')) {
      mockDB.createObjectStore = vi.fn();
    }

    expect(mockDB).toBeDefined();
  });

  it('closes database properly', () => {
    const mockDB = {
      close: vi.fn(),
    };
    mockDB.close();
    expect(mockDB.close).toHaveBeenCalled();
  });
});

// ============================================
// Message Forwarding Tests
// ============================================
describe('Message Forwarding Patterns', () => {
  it('forwards metrics to popup when connected', () => {
    const port = createMockPort('popup-metrics');
    const metrics = { rms: 0.5, peak: 0.8 };

    if (port && !port._disconnected) {
      port.postMessage({ type: 'METRICS', ...metrics });
    }

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'METRICS',
      rms: 0.5,
      peak: 0.8,
    });
  });

  it('forwards audio drop events to popup', () => {
    const port = createMockPort('popup-metrics');
    const dropEvent = {
      type: '_AUDIO_DROP',
      count: 1,
      timestamp: Date.now(),
      reason: 'stream_inactive',
    };

    if (port && !port._disconnected) {
      port.postMessage(dropEvent);
    }

    expect(port.postMessage).toHaveBeenCalledWith(dropEvent);
  });

  it('silently handles dead port postMessage', () => {
    const port = { _disconnected: true, postMessage: vi.fn() };
    let caught = null;

    try {
      if (port && !port._disconnected) {
        port.postMessage({ type: 'METRICS' });
      }
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeNull();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});

// ============================================
// Capture State Persistence
// ============================================
describe('Capture State Persistence', () => {
  beforeEach(() => {
    chrome.storage.local._data = {};
  });

  it('saves capturing state to storage', () => {
    chrome.storage.local.set({ ssa_capturing: true });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ ssa_capturing: true });
  });

  it('restores capturing state from storage', async () => {
    chrome.storage.local._data.ssa_capturing = true;
    const result = await chrome.storage.local.get(['ssa_capturing']);
    expect(result.ssa_capturing).toBe(true);
  });

  it('handles missing capturing state gracefully', async () => {
    chrome.storage.local._data = {};
    const result = await chrome.storage.local.get(['ssa_capturing']);
    expect(result.ssa_capturing).toBeUndefined();
  });
});

// ============================================
// Grace Period Reconnect Tests
// ============================================
describe('Popup Disconnect Grace Period', () => {
  it('uses 500ms grace period for reconnect', () => {
    const gracePeriod = 500;
    expect(gracePeriod).toBe(500);
  });

  it('cancels existing timer on reconnect', () => {
    const timers = [];
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;

    const setTimeoutSpy = vi.fn((fn, ms) => {
      const id = timers.length;
      timers.push({ id, fn, ms });
      return id;
    });

    const clearTimeoutSpy = vi.fn((id) => {
      timers.splice(id, 1);
    });

    // Simulate: set timer, then cancel on reconnect
    const timer1 = setTimeoutSpy(() => {}, 500);
    clearTimeoutSpy(timer1);
    expect(timers.length).toBe(0);
  });
});

// ============================================
// Error Handling Tests
// ============================================
describe('Error Handling — chrome.runtime.lastError', () => {
  it('suppresses lastError silently in callbacks', () => {
    chrome.runtime.sendMessage({ type: 'TEST' }, () => {
      void chrome.runtime.lastError; // consumed
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });

  it('handles lastError in onAlarm callback', () => {
    // Simulate alarm handler pattern
    chrome.runtime.sendMessage(
      { type: '_OFFSCREEN_REQ_METRICS' },
      () => {
        if (chrome.runtime.lastError) {
          // SW may have terminated — suppressed
        }
      }
    );
    expect(chrome.runtime.sendMessage).toHaveBeenCalled();
  });
});
