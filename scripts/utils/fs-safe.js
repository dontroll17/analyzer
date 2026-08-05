'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Safe File System Utilities
 * 
 * Предотвращает ошибки writeFileSync с undefined/null параметрами
 * Добавляет логирование всех файловых операций
 */

// Timestamp helper
function ts() {
  return new Date().toISOString().slice(11, 19);
}

// Log level constants
const LOG = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  TRACE: 'TRACE',
};

/**
 * Validate file write parameters
 * @param {string} filePath - Path to the file
 * @param {string|Buffer|Array} content - Content to write
 * @param {string} encoding - File encoding (default: 'utf8')
 * @returns {{ valid: boolean, error?: string }}
 */
function validateWriteParams(filePath, content, encoding = 'utf8') {
  const errors = [];
  
  if (filePath === undefined || filePath === null) {
    errors.push('filePath is undefined/null');
  } else if (typeof filePath !== 'string') {
    errors.push(`filePath must be string, got ${typeof filePath}`);
  } else if (filePath.trim() === '') {
    errors.push('filePath is empty string');
  }
  
  if (content === undefined || content === null) {
    errors.push('content is undefined/null');
  } else if (typeof content !== 'string' && !Buffer.isBuffer(content) && !Array.isArray(content)) {
    errors.push(`content must be string/Buffer/Array, got ${typeof content}`);
  } else if (typeof content === 'string' && content === '') {
    errors.push('content is empty string');
  }
  
  if (encoding !== undefined && encoding !== null && typeof encoding !== 'string') {
    errors.push(`encoding must be string, got ${typeof encoding}`);
  }
  
  return errors.length > 0 
    ? { valid: false, error: errors.join('; ') }
    : { valid: true };
}

/**
 * Safe writeFileSync with validation and logging
 * @param {string} filePath - Path to write
 * @param {string|Buffer|Array} content - Content to write
 * @param {string} [encoding='utf8'] - File encoding
 * @returns {boolean} - Success status
 */
function writeFileSync(filePath, content, encoding = 'utf8') {
  const validation = validateWriteParams(filePath, content, encoding);
  
  if (!validation.valid) {
    console.error(`[${ts()}] ${LOG.ERROR} writeFileSync failed:`);
    console.error(`  ${validation.error}`);
    console.error(`  filePath: ${JSON.stringify(filePath)}`);
    console.error(`  content: ${typeof content} (${JSON.stringify(String(content).slice(0, 100))})`);
    
    // Stack trace for debugging
    if (process.env.DEBUG) {
      console.error(new Error('Stack trace for debugging').stack.split('\n').slice(2).join('\n'));
    }
    
    return false;
  }
  
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      console.log(`[${ts()}] ${LOG.INFO} Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const startTime = Date.now();
    fs.writeFileSync(filePath, content, encoding);
    const duration = Date.now() - startTime;
    
    console.log(`[${ts()}] ${LOG.INFO} ✅ writeFileSync: ${filePath} (${content.length} bytes, ${duration}ms)`);
    
    // Warn for very large writes
    if (typeof content === 'string' && content.length > 100000) {
      console.warn(`[${ts()}] ${LOG.WARN} Large file write (>100KB): ${filePath}`);
    }
    
    return true;
  } catch (error) {
    console.error(`[${ts()}] ${LOG.ERROR} writeFileSync exception:`);
    console.error(`  File: ${filePath}`);
    console.error(`  Error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * Safe appendFileSync with validation
 * @param {string} filePath - Path to append
 * @param {string|Buffer} content - Content to append
 * @param {string} [encoding='utf8'] - File encoding
 * @returns {boolean} - Success status
 */
function appendFileSync(filePath, content, encoding = 'utf8') {
  const validation = validateWriteParams(filePath, content, encoding);
  
  if (!validation.valid) {
    console.error(`[${ts()}] ${LOG.ERROR} appendFileSync failed:`);
    console.error(`  ${validation.error}`);
    console.error(`  filePath: ${JSON.stringify(filePath)}`);
    return false;
  }
  
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.appendFileSync(filePath, content, encoding);
    console.log(`[${ts()}] ${LOG.INFO} ✅ appendFileSync: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`[${ts()}] ${LOG.ERROR} appendFileSync exception: ${error.message}`);
    return false;
  }
}

/**
 * Write JSON file safely
 * @param {string} filePath - Path to write
 * @param {object} data - JSON data
 * @param {number} [indent=2] - JSON indent
 * @returns {boolean} - Success status
 */
function writeJSONSync(filePath, data, indent = 2) {
  const content = JSON.stringify(data, null, indent);
  return writeFileSync(filePath, content, 'utf8');
}

module.exports = {
  writeFileSync,
  appendFileSync,
  writeJSONSync,
  validateWriteParams,
  LOG,
};
