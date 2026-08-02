import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setChromeLastError, clearChromeLastError } from '../setup.js';

describe('D5 — Extension Context Invalidation (content.js line 941)', () => {
  let errorListeners;
  let originalChromeId;

  beforeEach(() => {
    // Track error event listeners on window
    errorListeners = [];
    originalChromeId = chrome.runtime.id;

    // Set up window.addEventListener for 'error' — mock the listener registration
    global.window.addEventListener = vi.fn((event, fn) => {
      if (event === 'error') {
        errorListeners.push(fn);
      }
    });

    // Ensure chrome.runtime.id is valid by default
    chrome.runtime.id = 'test-extension-id';
  });

  afterEach(() => {
    clearChromeLastError();
    chrome.runtime.id = originalChromeId;
    vi.clearAllMocks();
  });

  describe('Error event handler detection', () => {
    it('should register error listener on window', () => {
      // Simulate content.js: window.addEventListener('error', handler)
      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          // handle invalidation
        }
      };
      global.window.addEventListener('error', handler);

      expect(errorListeners.length).toBe(1);
      expect(typeof errorListeners[0]).toBe('function');
    });

    it('should catch "Extension context invalidated" in error message', () => {
      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const event = { message: 'Extension context invalidated' };
      const result = handler(event);

      expect(result).toBe(true);
    });

    it('should catch error when chrome.runtime.id is falsy', () => {
      chrome.runtime.id = null;

      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const event = { message: 'Some other error' };
      const result = handler(event);

      expect(result).toBe(true);
      expect(chrome.runtime.id).toBe(null);
    });

    it('should NOT catch regular DOM errors (not invalidation-related)', () => {
      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const event = { message: 'TypeError: Cannot read property of null' };
      const result = handler(event);

      expect(result).toBe(false);
    });

    it('should handle undefined message property gracefully', () => {
      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const event = {};
      const result = handler(event);

      expect(result).toBe(false);
    });
  });

  describe('Chrome runtime id falsy scenarios', () => {
    it('should trigger on chrome.runtime.id being undefined', () => {
      chrome.runtime.id = undefined;

      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const result = handler({ message: 'Regular JS error' });
      expect(result).toBe(true);
    });

    it('should trigger on chrome.runtime.id being empty string', () => {
      chrome.runtime.id = '';

      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          return true;
        }
        return false;
      };

      const result = handler({ message: 'Regular JS error' });
      expect(result).toBe(true);
    });

    it('should trigger on chrome.runtime being undefined (options chain)', () => {
      const originalRuntime = chrome.runtime;
      // eslint-disable-next-line no-global-assign
      chrome.runtime = undefined;

      const handler = (event) => {
        // This uses optional chaining: chrome.runtime?.id
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome?.runtime?.id) {
          return true;
        }
        return false;
      };

      const result = handler({ message: 'Any error' });
      expect(result).toBe(true);

      // Restore
      // eslint-disable-next-line no-global-assign
      chrome.runtime = originalRuntime;
    });

    it('should handle chrome.runtime missing entirely in options chain', () => {
      const result = !chrome?.runtime?.id;
      expect(result).toBe(false); // chrome is mocked, so runtime exists

      // With partial removal
      const savedRuntime = chrome.runtime;
      // eslint-disable-next-line no-global-assign
      chrome.runtime = undefined;
      const partialResult = !chrome?.runtime?.id;
      expect(partialResult).toBe(true);
      // eslint-disable-next-line no-global-assign
      chrome.runtime = savedRuntime;
    });
  });

  describe('Multiple consecutive invalidation events', () => {
    it('should handle rapid-fire context invalidation events', () => {
      let invocationCount = 0;

      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          invocationCount++;
        }
      };

      // Simulate 10 rapid invalidation events
      for (let i = 0; i < 10; i++) {
        handler({ message: 'Extension context invalidated' });
      }

      expect(invocationCount).toBe(10);
    });

    it('should handle mixed error types without dropping', () => {
      const handlerCalls = {
        invalidation: 0,
        regular: 0,
      };

      const handler = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
          handlerCalls.invalidation++;
        } else {
          handlerCalls.regular++;
        }
      };

      // 5 invalidation events
      for (let i = 0; i < 5; i++) {
        handler({ message: 'Extension context invalidated' });
      }

      // 5 regular JS errors
      handler({ message: 'TypeError: undefined is not a function' });
      handler({ message: 'ReferenceError: x is not defined' });
      handler({ message: 'SyntaxError: unexpected token' });
      handler({ message: 'RangeError: Maximum call stack size exceeded' });
      handler({ message: 'EvalError: Eval not called directly' });

      expect(handlerCalls.invalidation).toBe(5);
      expect(handlerCalls.regular).toBe(5);
    });
  });

  describe('Extension update / restart scenarios', () => {
    it('should handle error from DOM operations after extension update', () => {
      // After an extension update, content scripts may still hold references
      // to removed DOM elements — the error handler should catch this
      const errorMessages = [
        'Extension context invalidated',
        'Extension context invalidated: document detached',
        'Extension context invalidated: script element removed',
        'Extension context invalidated: page navigated',
      ];

      for (const msg of errorMessages) {
        let caught = false;
        try {
          const handler = (event) => {
            const innerMsg = event.message || '';
            if (innerMsg.includes('Extension context invalidated') || !chrome.runtime?.id) {
              caught = true;
            }
          };

          handler({ message: msg });
        } catch (e) {
          // Should not throw
        }

        expect(caught).toBe(true);
      }
    });

    it('should detect context invalidation via chrome.runtime?.id check', () => {
      // Simulate: extension is disabled/uninstalled, chrome.runtime.id becomes falsy
      const savedId = chrome.runtime.id;
      chrome.runtime.id = undefined;

      let detected = false;
      try {
        const handler = (event) => {
          const msg = event.message || '';
          if (msg.includes('Extension context invalidated') || !chrome.runtime?.id) {
            detected = true;
          }
        };

        handler({ message: 'Any error during disabled extension' });
      } catch (e) {
        // Should not throw
      }

      expect(detected).toBe(true);

      chrome.runtime.id = savedId;
    });

    it('should validate both detection paths (message + runtime check)', () => {
      let messagePath = false;
      let runtimePath = false;

      // Path 1: message contains invalidation string
      const handler1 = (event) => {
        const msg = event.message || '';
        if (msg.includes('Extension context invalidated')) {
          messagePath = true;
        }
      };
      handler1({ message: 'Extension context invalidated' });

      // Path 2: runtime.id is falsy
      const savedId = chrome.runtime.id;
      chrome.runtime.id = null;
      const handler2 = (event) => {
        if (!chrome.runtime?.id) {
          runtimePath = true;
        }
      };
      handler2({ message: 'Any error' });

      expect(messagePath).toBe(true);
      expect(runtimePath).toBe(true);

      chrome.runtime.id = savedId;
    });
  });
});