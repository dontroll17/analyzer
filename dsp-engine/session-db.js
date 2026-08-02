/**
 * Session DB — IndexedDB session storage configuration
 * 
 * Pure configuration and schema validation functions for IndexedDB session storage.
 * No DOM or chrome API dependencies — can be tested in Node.js / Vitest.
 * 
 * Extracted from background.js to enable unit testing and coverage tracking.
 * Imported by background.js.
 * 
 * IndexedDB operations (open, append, close) are handled in background.js
 * after importing this configuration module.
 */

// === IndexedDB configuration ===
export const SESSION_DB_NAME = 'ssa-session-db';
export const SESSION_DB_VERSION = 1;
export const SESSION_STORE_NAME = 'sessions';

// === Data types stored in the session DB ===
export const DATA_TYPES = Object.freeze({
  METRICS: 'metrics',
  LOGS: 'logs',
  SETTINGS: 'settings',
});

// === Schema definition ===
/**
 * Returns the IndexedDB schema configuration for session storage.
 * Used by openSessionDB() to create object stores and indexes.
 * 
 * @returns {object} Schema configuration
 */
export function getSessionSchema() {
  return {
    name: SESSION_DB_NAME,
    version: SESSION_DB_VERSION,
    storeName: SESSION_STORE_NAME,
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
      { name: 'type', keyPath: 'type', unique: false },
    ],
  };
}

// === Validation helpers ===
/**
 * Validate a data entry before storing in IndexedDB.
 * 
 * @param {*} data - Data to validate
 * @param {string} type - Data type (must be in DATA_TYPES)
 * @returns {object} { isValid, errors, cleaned }
 */
export function validateSessionEntry(data, type = DATA_TYPES.METRICS) {
  const errors = [];

  // Check data type
  const validTypes = Object.values(DATA_TYPES);
  if (!validTypes.includes(type)) {
    errors.push(`Invalid data type: ${type}. Must be one of: ${validTypes.join(', ')}`);
  }

  // Check data structure
  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { isValid: false, errors, cleaned: null };
  }

  // Validate required fields for metrics
  if (type === DATA_TYPES.METRICS) {
    if (data.rms === undefined && data.glitch === undefined) {
      errors.push('Metrics must have at least one of: rms, glitch');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    cleaned: data,
  };
}

/**
 * Create a valid session entry with timestamp and type.
 * 
 * @param {object} data - Raw data object
 * @param {string} type - Data type (default: 'metrics')
 * @returns {object|null} Validated entry with timestamp, or null if invalid
 */
export function createSessionEntry(data, type = DATA_TYPES.METRICS) {
  const validation = validateSessionEntry(data, type);
  if (!validation.isValid) {
    return null;
  }
  return {
    ...validation.cleaned,
    timestamp: Date.now(),
    type,
  };
}

/**
 * Check if IndexedDB is available in the current environment.
 * 
 * @param {object} context - Global context (global, window, self)
 * @returns {boolean} true if IndexedDB is supported
 */
export function isIndexedDBAvailable(context = self) {
  return 'indexedDB' in context;
}

/**
 * Get human-readable description of IndexedDB schema.
 * 
 * @returns {string} Schema description
 */
export function describeSessionSchema() {
  const schema = getSessionSchema();
  return (
    `Session DB: ${schema.name} v${schema.version}\n` +
    `  Store: ${schema.storeName} (keyPath: ${schema.keyPath}, autoIncrement)\n` +
    `  Indexes: ${schema.indexes.map(i => `${i.name} (${i.keyPath}, unique: ${i.unique})`).join(', ')}`
  );
}

// Export for unit tests (Vitest coverage tracking)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SESSION_DB_NAME,
    SESSION_DB_VERSION,
    SESSION_STORE_NAME,
    DATA_TYPES,
    getSessionSchema,
    validateSessionEntry,
    createSessionEntry,
    isIndexedDBAvailable,
    describeSessionSchema,
  };
}
