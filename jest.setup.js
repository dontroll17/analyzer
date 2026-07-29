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
