/**
 * Tests for session DB configuration module
 * Covers: constants, schema validation, entry creation, IndexedDB availability
 */
import { describe, it, expect } from 'vitest';
import {
  SESSION_DB_NAME,
  SESSION_DB_VERSION,
  SESSION_STORE_NAME,
  DATA_TYPES,
  getSessionSchema,
  validateSessionEntry,
  createSessionEntry,
  isIndexedDBAvailable,
  describeSessionSchema,
} from '../../../dsp-engine/session-db.js';

// ============================================
// Constants validation
// ============================================
describe('Session DB constants', () => {
  it('SESSION_DB_NAME is correct', () => {
    expect(SESSION_DB_NAME).toBe('ssa-session-db');
  });

  it('SESSION_DB_VERSION is 1', () => {
    expect(SESSION_DB_VERSION).toBe(1);
  });

  it('SESSION_STORE_NAME is correct', () => {
    expect(SESSION_STORE_NAME).toBe('sessions');
  });

  it('DATA_TYPES has all three types', () => {
    expect(DATA_TYPES).toHaveProperty('METRICS', 'metrics');
    expect(DATA_TYPES).toHaveProperty('LOGS', 'logs');
    expect(DATA_TYPES).toHaveProperty('SETTINGS', 'settings');
  });

  it('DATA_TYPES has exactly 3 types', () => {
    expect(Object.keys(DATA_TYPES)).toHaveLength(3);
  });
});

// ============================================
// Schema configuration
// ============================================
describe('Schema configuration', () => {
  it('getSessionSchema returns correct structure', () => {
    const schema = getSessionSchema();
    expect(schema.name).toBe(SESSION_DB_NAME);
    expect(schema.version).toBe(SESSION_DB_VERSION);
    expect(schema.storeName).toBe(SESSION_STORE_NAME);
    expect(schema.keyPath).toBe('id');
    expect(schema.autoIncrement).toBe(true);
  });

  it('schema has two indexes: timestamp and type', () => {
    const schema = getSessionSchema();
    expect(schema.indexes).toHaveLength(2);
    expect(schema.indexes[0]).toEqual({ name: 'timestamp', keyPath: 'timestamp', unique: false });
    expect(schema.indexes[1]).toEqual({ name: 'type', keyPath: 'type', unique: false });
  });

  it('schema indexes have correct structure', () => {
    const schema = getSessionSchema();
    expect(schema.indexes).toHaveLength(2);
    expect(schema.indexes[0]).toHaveProperty('name', 'timestamp');
    expect(schema.indexes[1]).toHaveProperty('name', 'type');
  });

  it('describeSessionSchema returns readable description', () => {
    const desc = describeSessionSchema();
    expect(desc).toContain(SESSION_DB_NAME);
    expect(desc).toContain('v1');
    expect(desc).toContain('sessions');
    expect(desc).toContain('timestamp');
    expect(desc).toContain('type');
  });
});

// ============================================
// Validation helpers
// ============================================
describe('validateSessionEntry', () => {
  it('validates correct metrics entry', () => {
    const entry = { rms: 0.5, glitch: 'GLITCH', peak: 0.8 };
    const result = validateSessionEntry(entry, DATA_TYPES.METRICS);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates metrics with at least one field', () => {
    const result1 = validateSessionEntry({ rms: 0.5 }, DATA_TYPES.METRICS);
    expect(result1.isValid).toBe(true);

    const result2 = validateSessionEntry({ glitch: 'DRIFT' }, DATA_TYPES.METRICS);
    expect(result2.isValid).toBe(true);
  });

  it('rejects metrics without required fields', () => {
    const result = validateSessionEntry({ foo: 'bar' }, DATA_TYPES.METRICS);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Metrics must have at least one of: rms, glitch');
  });

  it('accepts logs data without metrics fields', () => {
    const result = validateSessionEntry({ message: 'test log' }, DATA_TYPES.LOGS);
    expect(result.isValid).toBe(true);
  });

  it('accepts settings data without metrics fields', () => {
    const result = validateSessionEntry({ theme: 'dark' }, DATA_TYPES.SETTINGS);
    expect(result.isValid).toBe(true);
  });

  it('rejects null data', () => {
    const result = validateSessionEntry(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Data must be an object');
    expect(result.cleaned).toBeNull();
  });

  it('rejects non-object data', () => {
    expect(validateSessionEntry('string').isValid).toBe(false);
    expect(validateSessionEntry(123).isValid).toBe(false);
    expect(validateSessionEntry([]).isValid).toBe(false);
  });

  it('rejects invalid data type', () => {
    const result = validateSessionEntry({ foo: 'bar' }, 'invalid');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Invalid data type');
  });

  it('validates with default type (METRICS)', () => {
    const result = validateSessionEntry({ rms: 0.5 });
    expect(result.isValid).toBe(true);
  });
});

// ============================================
// Entry creation
// ============================================
describe('createSessionEntry', () => {
  it('creates valid entry with timestamp and type', () => {
    const entry = createSessionEntry({ rms: 0.5 }, DATA_TYPES.METRICS);
    expect(entry).toBeDefined();
    expect(entry.rms).toBe(0.5);
    expect(entry.type).toBe(DATA_TYPES.METRICS);
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('rejects invalid data', () => {
    const entry = createSessionEntry('invalid', DATA_TYPES.METRICS);
    expect(entry).toBeNull();
  });

  it('rejects null data', () => {
    const entry = createSessionEntry(null, DATA_TYPES.METRICS);
    expect(entry).toBeNull();
  });

  it('defaults to METRICS type', () => {
    const entry = createSessionEntry({ rms: 0.5 });
    expect(entry.type).toBe(DATA_TYPES.METRICS);
  });

  it('preserves all data fields', () => {
    const data = { rms: 0.5, peak: 0.8, glitch: 'GLITCH', entropy: 3.2 };
    const entry = createSessionEntry(data, DATA_TYPES.METRICS);
    expect(entry.rms).toBe(0.5);
    expect(entry.peak).toBe(0.8);
    expect(entry.glitch).toBe('GLITCH');
    expect(entry.entropy).toBe(3.2);
  });

  it('creates entries with different data fields', () => {
    const entry1 = createSessionEntry({ rms: 0.5, val: 1 }, DATA_TYPES.METRICS);
    const entry2 = createSessionEntry({ rms: 0.8, val: 2 }, DATA_TYPES.METRICS);
    expect(entry1.val).toBe(1);
    expect(entry2.val).toBe(2);
    expect(entry1.rms).toBe(0.5);
    expect(entry2.rms).toBe(0.8);
    expect(entry1.type).toBe(DATA_TYPES.METRICS);
    expect(entry2.type).toBe(DATA_TYPES.METRICS);
  });
});

// ============================================
// IndexedDB availability check
// ============================================
describe('isIndexedDBAvailable', () => {
  it('returns false when indexedDB is missing', () => {
    const fakeContext = {};
    expect(isIndexedDBAvailable(fakeContext)).toBe(false);
  });

  it('returns true when indexedDB exists', () => {
    const fakeContext = { indexedDB: {} };
    expect(isIndexedDBAvailable(fakeContext)).toBe(true);
  });

  it('returns true when indexedDB is a function', () => {
    const fakeContext = { indexedDB: () => {} };
    expect(isIndexedDBAvailable(fakeContext)).toBe(true);
  });

  it('defaults to global self context', () => {
    // In Node.js, 'indexedDB' is not in global, so should be false
    expect(isIndexedDBAvailable()).toBe(false);
  });
});
