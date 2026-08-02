// ===================== Logger Tests =====================
// Tests for logger.js - universal logging system

function createLogger() {
  jest.resetModules();
  // Save chrome.storage and remove it to force logger to use in-memory path
  const savedChrome = global.chrome;
  if (global.chrome && global.chrome.storage) {
    delete global.chrome.storage;
  }
  // Polyfill window before each require to get fresh IIFE
  global.window = {
    dispatchEvent: jest.fn(),
    matchMedia: jest.fn(function() { return { matches: false, addListener: jest.fn(), removeListener: jest.fn() }; }),
  };
  require("../logger.js");
  // Restore chrome for other tests
  if (savedChrome) {
    global.chrome = savedChrome;
  }
  return global.window.__logger;
}

describe("Logger", function() {
  var logger;

  beforeEach(function() {
    logger = createLogger();
    logger.clear();
    logger.setMinLevel("warn");
  });

  describe("forModule()", function() {
    test("returns logger object with debug/info/warn/error methods", function() {
      var modLogger = logger.forModule("test-module");
      expect(typeof modLogger.debug).toBe("function");
      expect(typeof modLogger.info).toBe("function");
      expect(typeof modLogger.warn).toBe("function");
      expect(typeof modLogger.error).toBe("function");
    });

    test("creates separate logger instances per module", function() {
      var logger1 = logger.forModule("module1");
      var logger2 = logger.forModule("module2");
      expect(logger1).not.toBe(logger2);
    });
  });

  describe("setMinLevel() / getMinLevel()", function() {
    test("defaults to warn level", function() {
      expect(logger.getMinLevel()).toBe("warn");
    });

    test("sets and gets debug level", function() {
      logger.setMinLevel("debug");
      expect(logger.getMinLevel()).toBe("debug");
    });

    test("sets and gets info level", function() {
      logger.setMinLevel("info");
      expect(logger.getMinLevel()).toBe("info");
    });

    test("sets and gets error level", function() {
      logger.setMinLevel("error");
      expect(logger.getMinLevel()).toBe("error");
    });

    test("ignores invalid level", function() {
      logger.setMinLevel("invalid");
      expect(logger.getMinLevel()).toBe("warn");
    });
  });

  describe("logging with level filtering", function() {
    test("debug and info filtered when minLevel is warn", function() {
      logger.setMinLevel("warn");
      var modLogger = logger.forModule("test");
      modLogger.debug("debug message");
      modLogger.info("info message");
      expect(logger.getAll().length).toBe(0);
    });

    test("warn messages pass when minLevel is warn", function() {
      logger.setMinLevel("warn");
      var modLogger = logger.forModule("test");
      modLogger.warn("warning message");
      var logs = logger.getAll();
      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("warn");
      expect(logs[0].args).toEqual(["warning message"]);
    });

    test("error messages pass when minLevel is warn", function() {
      logger.setMinLevel("warn");
      var modLogger = logger.forModule("test");
      modLogger.error("error message");
      expect(logger.getAll().length).toBe(1);
    });

    test("all messages pass when minLevel is debug", function() {
      logger.setMinLevel("debug");
      var modLogger = logger.forModule("test");
      modLogger.debug("debug");
      modLogger.info("info");
      modLogger.warn("warn");
      modLogger.error("error");
      var logs = logger.getAll();
      expect(logs.length).toBe(4);
      expect(logs.map(function(l) { return l.level; })).toEqual(["debug", "info", "warn", "error"]);
    });
  });

  describe("toggleModule()", function() {
    test("disables a module when toggleModule(mod, false)", function() {
      logger.setMinLevel("debug");
      logger.toggleModule("disabled", false);
      var modLogger = logger.forModule("disabled");
      modLogger.info("should be filtered");
      expect(logger.getAll().length).toBe(0);
    });

    test("re-enables a module when toggleModule(mod, true)", function() {
      logger.setMinLevel("debug");
      logger.toggleModule("enabled", false);
      logger.toggleModule("enabled", true);
      var modLogger = logger.forModule("enabled");
      modLogger.info("enabled again");
      expect(logger.getAll().length).toBe(1);
    });
  });

  describe("clear()", function() {
    test("removes all logs", function() {
      var modLogger = logger.forModule("test");
      modLogger.warn("message 1");
      modLogger.warn("message 2");
      var beforeClear = logger.getAll().length;
      expect(beforeClear).toBe(2);
      logger.clear();
      expect(logger.getAll().length).toBe(0);
    });
  });

  describe("getAll()", function() {
    test("returns copy of logs array", function() {
      var modLogger = logger.forModule("test");
      modLogger.info("test message");
      var logs1 = logger.getAll();
      var logs2 = logger.getAll();
      expect(logs1).not.toBe(logs2);
    });

    test("each log entry has required fields", function() {
      var modLogger = logger.forModule("test-module");
      modLogger.warn("test");
      var logs = logger.getAll();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toHaveProperty("ts");
      expect(logs[0]).toHaveProperty("iso");
      expect(logs[0]).toHaveProperty("level");
      expect(logs[0]).toHaveProperty("module");
      expect(logs[0]).toHaveProperty("args");
      expect(logs[0].module).toBe("test-module");
    });
  });

  describe("onLogChange()", function() {
    test("registers callback that fires on log", function() {
      var callback = jest.fn();
      var cleanup = logger.onLogChange(callback);
      var modLogger = logger.forModule("test");
      modLogger.warn("trigger");
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test("cleanup function removes listener", function() {
      var callback = jest.fn();
      var cleanup = logger.onLogChange(callback);
      var modLogger = logger.forModule("test");
      modLogger.warn("first");
      expect(callback).toHaveBeenCalledTimes(1);
      cleanup();
      modLogger.warn("second");
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test("multiple listeners all fire", function() {
      var cb1 = jest.fn();
      var cb2 = jest.fn();
      var cb3 = jest.fn();
      logger.onLogChange(cb1);
      logger.onLogChange(cb2);
      logger.onLogChange(cb3);
      var modLogger = logger.forModule("test");
      modLogger.warn("multi");
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
    });
  });

  describe("exportJSON()", function() {
    test("returns object with url and revoke", function() {
      var modLogger = logger.forModule("test");
      modLogger.info("export test");
      var result = logger.exportJSON();
      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("revoke");
      expect(typeof result.revoke).toBe("function");
    });

    test("revoke function exists and is callable", function() {
      var modLogger = logger.forModule("test");
      modLogger.info("test");
      var result = logger.exportJSON();
      expect(function() { result.revoke(); }).not.toThrow();
    });
  });
});
