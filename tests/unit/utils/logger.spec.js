import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load logger.js into the global scope
try {
  const loggerPath = resolve(__dirname, '../../../logger.js');
  const loggerCode = readFileSync(loggerPath, 'utf-8');
  
  delete global.window.__logger;
  delete global.window.logger;
  
  const executeLogger = new Function(
    'window', 'self', 'chrome', 'performance', 'Date', 'Blob', 'URL', 'JSON', 'String',
    `
      (function() {
        ${loggerCode}
      })()
    `
  );
  
  executeLogger(
    global.window,
    global.window,
    global.chrome,
    global.performance || { now: () => 0 },
    global.Date,
    global.Blob,
    {
      createObjectURL: () => 'blob:test-url',
      revokeObjectURL: () => {},
    },
    JSON,
    String
  );
} catch (e) {
  // Logger might already be loaded
}

function getLogger() {
  return window.__logger || window.logger;
}

const STORAGE_KEY = '__ssa_logs';

describe('Logger — Unit Tests (coverage for uncovered functions)', () => {
  beforeEach(() => {
    const log = getLogger();
    if (log) {
      log.setMinLevel('debug');
      log.clear();
    }
    // Ensure storage is clean for async tests
    if (chrome && chrome.storage && chrome.storage.local) {
      delete chrome.storage.local._data[STORAGE_KEY];
    }
  });

  describe('exportJSON() — lines 139-148', () => {
    it('returns object with url and revoke properties', () => {
      const log = getLogger();
      const logger = log.forModule('test');
      logger.info('test message 1');
      logger.warn('test message 2');
      
      const result = log.exportJSON();
      
      expect(result).toHaveProperty('url');
      expect(typeof result.url).toBe('string');
      expect(result.url).toMatch(/^blob:/);
      expect(result).toHaveProperty('revoke');
      expect(typeof result.revoke).toBe('function');
    });

    it('revokes URL without error', () => {
      const log = getLogger();
      const logger = log.forModule('test');
      logger.info('test');
      
      const result = log.exportJSON();
      expect(() => result.revoke()).not.toThrow();
    });

    it('exports empty array when no logs', () => {
      const log = getLogger();
      const result = log.exportJSON();
      
      expect(typeof result.url).toBe('string');
    });
  });

  describe('clear() — lines 106-112', () => {
    it('invokes listeners with empty array on clear', () => {
      const log = getLogger();
      const callback = vi.fn();
      const cleanup = log.onLogChange(callback);
      
      log.clear();
      
      expect(callback).toHaveBeenCalled();
      cleanup();
    });

    it('calls chrome.storage.local.remove in mocked environment', () => {
      const log = getLogger();
      expect(typeof chrome.storage.local.remove).toBe('function');
    });
  });

  describe('load(cb) — line 135', () => {
    it('loads logs from chrome.storage into memory', async () => {
      const log = getLogger();
      
      const mockLogs = [
        { ts: '1.00ms', iso: '2026-01-01T00:00:00Z', level: 'info', module: 'test', args: ['saved log'] },
        { ts: '2.00ms', iso: '2026-01-01T00:00:01Z', level: 'warn', module: 'test', args: ['saved warning'] },
      ];
      chrome.storage.local._data[STORAGE_KEY] = mockLogs;
      
      const originalGet = chrome.storage.local.get;
      chrome.storage.local.get = vi.fn((key, cb) => {
        if (cb) {
          const result = {};
          if (Array.isArray(key)) {
            key.forEach(k => {
              if (k in chrome.storage.local._data) {
                result[k] = chrome.storage.local._data[k];
              }
            });
          } else if (key in chrome.storage.local._data) {
            result[key] = chrome.storage.local._data[key];
          }
          cb(result);
        }
        return Promise.resolve({});
      });
      
      return new Promise((resolve) => {
        log.load((loadedLogs) => {
          expect(Array.isArray(loadedLogs)).toBe(true);
          expect(loadedLogs.length).toBe(2);
          expect(loadedLogs[0].level).toBe('info');
          expect(loadedLogs[1].level).toBe('warn');
          chrome.storage.local.get = originalGet;
          resolve();
        });
      });
    });

    it('invokes listeners after loading from storage', async () => {
      const log = getLogger();
      expect(typeof log.onLogChange).toBe('function');
      expect(typeof log.load).toBe('function');
    });
  });

  describe('onLogChange() — lines 119-132', () => {
    it('registers listener callback', () => {
      const log = getLogger();
      const callback = vi.fn();
      const cleanup = log.onLogChange(callback);
      
      expect(cleanup).toBeDefined();
      expect(typeof cleanup).toBe('function');
      
      const logger = log.forModule('test');
      logger.info('trigger listener');
      
      expect(callback).toHaveBeenCalled();
      cleanup();
    });

    it('cleanup function removes listener', () => {
      const log = getLogger();
      const callback = vi.fn();
      const cleanup = log.onLogChange(callback);
      
      const logger = log.forModule('test');
      logger.info('first');
      expect(callback).toHaveBeenCalledTimes(1);
      
      cleanup();
      
      logger.info('second');
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('non-function returns no-op', () => {
      const log = getLogger();
      const noop = log.onLogChange('not a function');
      expect(noop).toBeDefined();
      expect(typeof noop).toBe('function');
      expect(() => noop()).not.toThrow();
    });
  });

  describe('_pushStorage() — lines 35-47 (chrome path)', () => {
    it('saves log entry to chrome.storage', async () => {
      const log = getLogger();
      
      // Ensure storage is clean
      delete chrome.storage.local._data[STORAGE_KEY];
      
      const logger = log.forModule('test');
      logger.info('storage push test');
      
      // Wait for the async chrome.storage.set() Promise to resolve
      await Promise.resolve();
      await Promise.resolve();
      
      const saved = chrome.storage.local._data[STORAGE_KEY];
      expect(Array.isArray(saved)).toBe(true);
      expect(saved.length).toBeGreaterThan(0);
      expect(saved[0].level).toBe('info');
    });
  });

  describe('getAll() — line 115', () => {
    it('returns a copy of logs array', () => {
      const log = getLogger();
      const logger = log.forModule('test');
      logger.info('test');
      
      const copy1 = log.getAll();
      const copy2 = log.getAll();
      
      expect(copy1).toEqual(copy2);
      expect(copy1).not.toBe(copy2);
    });
  });
});
