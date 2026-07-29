// ===================== Logger =====================
// Universal logging system with levels, modules, storage, and export.
// Usage: const log = logger.forModule('popup'); log.info('hello');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const STORAGE_KEY = '__ssa_logs';
const MAX_LOGS = 500; // keep last N messages in storage

// ---------- helpers ----------
function _now() {
  if (typeof performance !== 'undefined' && performance.now)
    return performance.now().toFixed(2) + 'ms';
  if (typeof Date !== 'undefined') return Date.now().toString();
  return '0';
}

function _pad(n, len = 2) { return String(n).padStart(len, '0'); }
function _iso() {
  if (typeof Date === 'undefined') return '0000-00-00T00:00:00Z';
  const d = new Date();
  return d.getUTCFullYear() + '-' + _pad(d.getUTCMonth()+1) + '-' + _pad(d.getUTCDate()) +
    'T' + _pad(d.getUTCHours()) + ':' + _pad(d.getUTCMinutes()) + ':' + _pad(d.getUTCSeconds()) + 'Z';
}

// ---------- singleton ----------
const Logger = (() => {
  let _logs = [];
  let _minLevel = 'debug';
  let _filters = {};   // { module: true/false }
  let _listeners = []; // callbacks on push

  // ---- Storage ----
  function _pushStorage(entry) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      _logs.push(entry);
      while (_logs.length > MAX_LOGS) _logs.shift();
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const arr = res[STORAGE_KEY] || [];
      arr.push(entry);
      while (arr.length > MAX_LOGS) arr.shift();
      chrome.storage.local.set({ [STORAGE_KEY]: arr });
    });
  }

  function _loadStorage(cb) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      if (cb) cb(_logs);
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      _logs = res[STORAGE_KEY] || [];
      if (cb) cb(_logs);
      _listeners.forEach(l => l(_logs));
    });
  }

  // ---- Factory ----
  function _create(moduleName) {
    return {
      debug:  (...args) => _emit('debug', moduleName, args),
      info:   (...args) => _emit('info',  moduleName, args),
      warn:   (...args) => _emit('warn',  moduleName, args),
      error:  (...args) => _emit('error', moduleName, args),
    };
  }

  function _emit(level, module, args) {
    if (LEVELS[level] < LEVELS[_minLevel]) return;
    if (_filters[module] === false) return;

    const entry = {
      ts: _now(),
      iso: _iso(),
      level,
      module,
      args: args.map(_fmtArg),
    };
    _pushStorage(entry);
    _listeners.forEach(l => l());
  }

  function _fmtArg(a) {
    if (a instanceof Error) return a.message;
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
    return String(a);
  }

  // ---- Public API ----
  return {
    forModule: _create,

    // Level control
    setMinLevel(lv) { if (LEVELS[lv] !== undefined) _minLevel = lv; },
    getMinLevel() { return _minLevel; },

    // Filter a module on/off
    toggleModule(mod, on) { _filters[mod] = on; },

    // Clear logs
    clear() {
      _logs = [];
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.remove(STORAGE_KEY);
      }
      _listeners.forEach(l => l([]));
    },

    // Get logs array
    getAll() { return [..._logs]; },

    // Subscribe to log changes
    onLogChange(fn) { _listeners.push(fn); },

    // Load from storage (call once on startup)
    load(cb) { _loadStorage(cb); },

    // Export to JSON blob URL
    exportJSON() {
      const data = this.getAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      return URL.createObjectURL(blob);
    },
  };
})();

// Attach to global scope for non-module scripts (background, offscreen, content)
if (typeof window !== 'undefined') {
  window.__logger = Logger;
  window.logger = { forModule: Logger.forModule.bind(Logger) };
}
if (typeof self !== 'undefined' && self !== window) {
  self.__logger = Logger;
  self.logger = { forModule: Logger.forModule.bind(Logger) };
}

// Available as window.__logger from any script
