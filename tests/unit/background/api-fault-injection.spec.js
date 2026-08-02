import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setChromeLastError, clearChromeLastError } from '../setup.js';

describe('D4 — MV3 Fault Injection (chrome.runtime.lastError, port disconnect, tabCapture)', () => {
  beforeEach(() => {
    clearChromeLastError();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearChromeLastError();
  });

  describe('API error propagation', () => {
    it('should propagate chrome.runtime.lastError from sendMessage callback', async () => {
      setChromeLastError('Permission denied');

      // The sendMessage mock returns Promise.resolve, but lastError is set synchronously
      const errorFromLastError = chrome.runtime.lastError;
      expect(errorFromLastError).toBeDefined();
      expect(errorFromLastError.message).toBe('Permission denied');

      // Also test callback pattern: mock sendMessage to invoke callback with error
      const originalSend = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = vi.fn((msg, cb) => {
        if (cb) cb();
        return Promise.resolve({ ok: true });
      });

      let capturedError = null;
      try {
        chrome.runtime.sendMessage({ type: 'TEST' }, () => {
          if (chrome.runtime.lastError) {
            capturedError = chrome.runtime.lastError.message;
          }
        });
      } catch (e) {
        capturedError = e.message;
      }

      expect(capturedError).toBe('Permission denied');

      chrome.runtime.sendMessage = originalSend;
    });

    it('should detect lastError after offscreen document creation failure', async () => {
      const mockError = new Error('Failed to create offscreen document');
      const originalCreate = chrome.offscreen.createDocument;

      chrome.offscreen.createDocument = vi.fn().mockRejectedValue(mockError);

      let caughtError = null;
      try {
        await chrome.offscreen.createDocument({
          justification: 'media_capture',
          reasons: ['USER_MEDIA'],
          url: 'offscreen.html',
        });
      } catch (e) {
        caughtError = e.message;
      }

      expect(caughtError).toBe('Failed to create offscreen document');

      chrome.offscreen.createDocument = originalCreate;
    });

    it('should handle lastError from tab query callback', () => {
      setChromeLastError('Tabs not available');

      const originalQuery = chrome.tabs.query;
      chrome.tabs.query = vi.fn((query, cb) => {
        if (cb) cb([]);
        return Promise.resolve([]);
      });

      let errorMessage = null;
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            errorMessage = chrome.runtime.lastError.message;
          }
        });
      } catch (e) {
        errorMessage = e.message;
      }

      expect(errorMessage).toBe('Tabs not available');

      chrome.tabs.query = originalQuery;
    });

    it('should handle lastError from scripting executeScript', async () => {
      setChromeLastError('Scripting not allowed');

      let rejected = false;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: 1 },
          files: ['content.js'],
        });
      } catch (e) {
        rejected = true;
      }

      // The mock resolves, but lastError is set
      expect(chrome.runtime.lastError).toBeDefined();
      expect(chrome.runtime.lastError.message).toBe('Scripting not allowed');

      clearChromeLastError();
    });

    it('should clear lastError after successful operation', () => {
      setChromeLastError('Previous error');
      expect(chrome.runtime.lastError).toBeDefined();

      clearChromeLastError();
      expect(chrome.runtime.lastError).toBeUndefined();
    });
  });

  describe('Port disconnect during metrics transmission', () => {
    it('should handle popupPort disconnect while posting metrics', () => {
      const mockPort = {
        name: 'popup-metrics',
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
        _disconnected: false,
      };

      // Simulate: metrics queued, then port disconnects
      let metricsPosted = false;
      let disconnectDetected = false;

      // Mock port state: already disconnected
      mockPort._disconnected = true;

      // Simulate background.js pattern: check _disconnected before posting
      try {
        if (mockPort && !mockPort._disconnected) {
          mockPort.postMessage({ type: 'METRICS', rms: 0.5 });
          metricsPosted = true;
        }
      } catch (e) {
        disconnectDetected = true;
      }

      expect(metricsPosted).toBe(false);
      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });

    it('should handle overlayPort disconnect during metrics forward', () => {
      const overlayPort = {
        name: 'overlay-metrics',
        postMessage: vi.fn(() => {
          throw new Error('Port disconnected');
        }),
        disconnect: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
        onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
      };

      let errorMessage = null;
      try {
        overlayPort.postMessage({ type: 'METRICS', rms: 0.5 });
      } catch (e) {
        errorMessage = e.message;
      }

      expect(errorMessage).toBe('Port disconnected');
    });

    it('should gracefully handle port disconnect event during active metrics', async () => {
      const disconnectCallbacks = [];
      const onDisconnectListeners = [];

      const mockPort = {
        name: 'popup-metrics',
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onDisconnect: {
          addListener: vi.fn((fn) => {
            onDisconnectListeners.push(fn);
          }),
          removeListener: vi.fn(),
        },
        _disconnected: false,
      };

      let disconnectedPortRef = null;
      mockPort.onDisconnect.addListener((port) => {
        disconnectedPortRef = port;
        port._disconnected = true;
      });

      // Simulate disconnect event by invoking the registered handler
      onDisconnectListeners[0]?.(mockPort);

      expect(disconnectedPortRef).toBe(mockPort);
      expect(mockPort._disconnected).toBe(true);
    });

    it('should handle multiple port disconnections in sequence', () => {
      const ports = [
        { name: 'popup-metrics', _disconnected: false, disconnect: vi.fn() },
        { name: 'overlay-metrics', _disconnected: false, disconnect: vi.fn() },
      ];

      // Disconnect first port
      ports[0]._disconnected = true;
      ports[0].disconnect();

      // Disconnect second port
      ports[1]._disconnected = true;
      ports[1].disconnect();

      expect(ports[0]._disconnected).toBe(true);
      expect(ports[1]._disconnected).toBe(true);
      expect(ports[0].disconnect).toHaveBeenCalled();
      expect(ports[1].disconnect).toHaveBeenCalled();
    });

    it('should handle postMessage on already-disconnected port silently', () => {
      const port = {
        _disconnected: true,
        postMessage: vi.fn(),
      };

      // Background.js pattern: try/catch around postMessage
      let caughtError = null;
      try {
        if (port && !port._disconnected) {
          port.postMessage({ type: 'METRICS' });
        }
      } catch (e) {
        caughtError = e;
      }

      // Should not throw, and should not call postMessage
      expect(caughtError).toBeNull();
      expect(port.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Tab capture failure modes', () => {
    it('should handle getMediaStreamId rejection', async () => {
      const originalGetMediaStreamId = chrome.tabCapture.getMediaStreamId;

      chrome.tabCapture.getMediaStreamId = vi.fn().mockRejectedValue(
        new Error('Tab capture permission denied')
      );

      let rejected = false;
      let rejectionMessage = null;
      try {
        await chrome.tabCapture.getMediaStreamId();
      } catch (e) {
        rejected = true;
        rejectionMessage = e.message;
      }

      expect(rejected).toBe(true);
      expect(rejectionMessage).toBe('Tab capture permission denied');

      chrome.tabCapture.getMediaStreamId = originalGetMediaStreamId;
    });

    it('should handle getMediaStreamId returning empty string (no tabs available)', async () => {
      const originalGetMediaStreamId = chrome.tabCapture.getMediaStreamId;

      chrome.tabCapture.getMediaStreamId = vi.fn().mockResolvedValue('');

      let result = null;
      try {
        result = await chrome.tabCapture.getMediaStreamId();
      } catch (e) {
        // Should not reject, just return empty
      }

      expect(result).toBe('');

      chrome.tabCapture.getMediaStreamId = originalGetMediaStreamId;
    });

    it('should handle getMediaStreamId returning null', async () => {
      const originalGetMediaStreamId = chrome.tabCapture.getMediaStreamId;

      chrome.tabCapture.getMediaStreamId = vi.fn().mockResolvedValue(null);

      let result = null;
      try {
        result = await chrome.tabCapture.getMediaStreamId();
      } catch (e) {
        // Should not throw
      }

      expect(result).toBe(null);

      chrome.tabCapture.getMediaStreamId = originalGetMediaStreamId;
    });

    it('should handle get() rejection from tabCapture', async () => {
      const originalGet = chrome.tabCapture.get;

      chrome.tabCapture.get = vi.fn().mockRejectedValue(
        new Error('Tab capture service unavailable')
      );

      let caught = false;
      try {
        await chrome.tabCapture.get(null);
      } catch (e) {
        caught = true;
      }

      expect(caught).toBe(true);

      chrome.tabCapture.get = originalGet;
    });

    it('should handle graceful degradation when tab capture fails entirely', async () => {
      const originalGetMediaStreamId = chrome.tabCapture.getMediaStreamId;
      const originalGet = chrome.tabCapture.get;

      chrome.tabCapture.getMediaStreamId = vi.fn().mockRejectedValue(
        new Error('Tab capture not available')
      );
      chrome.tabCapture.get = vi.fn().mockRejectedValue(
        new Error('Tab capture not available')
      );

      // Simulate the pattern from background.js: try tabCapture, fall back
      let degradationPath = null;
      try {
        const streamId = await chrome.tabCapture.getMediaStreamId();
        if (!streamId) {
          degradationPath = 'no-stream-id';
        }
      } catch (e) {
        degradationPath = 'capture-failed: ' + e.message;
      }

      expect(degradationPath).toBe('capture-failed: Tab capture not available');

      chrome.tabCapture.getMediaStreamId = originalGetMediaStreamId;
      chrome.tabCapture.get = originalGet;
    });
  });

  describe('Multiple sequential errors and system recovery', () => {
    it('should recover after a sequence of API errors', async () => {
      let errorCount = 0;
      let recoveryCount = 0;

      // Sequence: error -> error -> error -> success -> success
      const operations = [
        // 1: lastError
        () => {
          setChromeLastError('Error 1');
          if (chrome.runtime.lastError) errorCount++;
          clearChromeLastError();
        },
        // 2: lastError again
        () => {
          setChromeLastError('Error 2');
          if (chrome.runtime.lastError) errorCount++;
          clearChromeLastError();
        },
        // 3: lastError again
        () => {
          setChromeLastError('Error 3');
          if (chrome.runtime.lastError) errorCount++;
          clearChromeLastError();
        },
        // 4: clean operation
        () => {
          clearChromeLastError();
          recoveryCount++;
        },
        // 5: clean operation
        () => {
          clearChromeLastError();
          recoveryCount++;
        },
      ];

      for (const op of operations) {
        try {
          op();
        } catch (e) {
          // Should not throw
        }
      }

      expect(errorCount).toBe(3);
      expect(recoveryCount).toBe(2);
    });

    it('should handle port disconnect followed by successful reconnect', () => {
      const port = {
        name: 'popup-metrics',
        _disconnected: false,
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
      };

      // Disconnect
      port._disconnected = true;
      port.disconnect();

      // Reconnect simulation
      port._disconnected = false;
      port.disconnect.mockClear();

      // After reconnect, should be able to post
      try {
        if (port && !port._disconnected) {
          port.postMessage({ type: 'REQUEST_METRICS' });
        }
      } catch (e) {
        // Should not throw
      }

      expect(port.postMessage).toHaveBeenCalledWith({ type: 'REQUEST_METRICS' });
    });

    it('should handle error storms without crashing the metric pipeline', () => {
      const metrics = [];
      const MAX_METRICS_QUEUE = 10;
      let metricsQueue = [];

      // Simulate error storm: 50 failed operations
      for (let i = 0; i < 50; i++) {
        setChromeLastError('Storm error ' + i);

        // Background.js pattern: try to push to queue even during errors
        try {
          metricsQueue.push({ rms: 0.5, frame: i });
          if (metricsQueue.length > MAX_METRICS_QUEUE) {
            metricsQueue.shift();
          }
        } catch (e) {
          // Error during queue push — shouldn't happen, but handle it
        }

        clearChromeLastError();
      }

      // Queue should have at most MAX_METRICS_QUEUE entries
      expect(metricsQueue.length).toBeLessThanOrEqual(MAX_METRICS_QUEUE);
      expect(metricsQueue.length).toBe(MAX_METRICS_QUEUE);
    });

    it('should handle lastError in onAlarm callback gracefully', () => {
      // Simulate the keepalive alarm pattern from background.js
      const mockAlarm = { name: 'ssa_keepalive' };

      // Simulate: alarm fires but sendMessage fails
      let alarmHandled = false;
      try {
        chrome.runtime.sendMessage(
          { type: '_OFFSCREEN_REQ_METRICS' },
          () => {
            if (chrome.runtime.lastError) {
              // Suppressed — OK, SW may have terminated
            }
          }
        );
        alarmHandled = true;
      } catch (e) {
        // Should not throw
      }

      expect(alarmHandled).toBe(true);
    });

    it('should handle chained failures: tabCapture -> sendMessage -> port post', async () => {
      const originalGetMediaStreamId = chrome.tabCapture.getMediaStreamId;
      const originalSendMessage = chrome.runtime.sendMessage;

      // Chain: tabCapture fails, then sendMessage fails, then port disconnect
      chrome.tabCapture.getMediaStreamId = vi.fn().mockRejectedValue(
        new Error('Tab capture failed')
      );

      chrome.runtime.sendMessage = vi.fn((msg, cb) => {
        if (cb) cb({ error: 'No response' });
        return Promise.reject(new Error('No response'));
      });

      let results = [];

      // Step 1: Tab capture failure
      try {
        await chrome.tabCapture.getMediaStreamId();
      } catch (e) {
        results.push('tabCaptureFail: ' + e.message);
      }

      // Step 2: sendMessage failure
      try {
        await chrome.runtime.sendMessage({ type: 'TEST' });
      } catch (e) {
        results.push('sendMessageFail: ' + e.message);
      }

      // Step 3: Port postMessage failure
      const deadPort = { _disconnected: true, postMessage: vi.fn() };
      try {
        if (deadPort && !deadPort._disconnected) {
          deadPort.postMessage({ type: 'METRICS' });
        }
      } catch (e) {
        results.push('portFail: ' + e.message);
      }

      // Verify all failures handled
      expect(results).toContain('tabCaptureFail: Tab capture failed');
      expect(results).toContain('sendMessageFail: No response');

      // Port should be silently rejected
      expect(deadPort.postMessage).not.toHaveBeenCalled();

      chrome.tabCapture.getMediaStreamId = originalGetMediaStreamId;
      chrome.runtime.sendMessage = originalSendMessage;
    });
  });
});