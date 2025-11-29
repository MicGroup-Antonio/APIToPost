import fs from "fs";
import path from "path";

/**
 * Console Logger Utility
 * Redirects all console output to both console and log file
 * Designed for PM2 process management
 * 
 * This module is idempotent - it can be imported multiple times safely
 */

// Check if logger is already initialized
if (!global.__consoleLoggerInitialized) {
  // Mark as initialized
  global.__consoleLoggerInitialized = true;

  // Create logs directory if it doesn't exist
  const logsDir = "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Generate log file path with current date
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const consoleLogPath = path.join(logsDir, `console_${year}_${month}_${day}.log`);

  // Create write stream for console logs
  let logStream = null;

  try {
    logStream = fs.createWriteStream(consoleLogPath, { flags: "a" });
  } catch (err) {
    process.stderr.write(`Failed to create log file: ${err.message}\n`);
  }

  /**
   * Formats a log message with timestamp
   * @param {string} level - Log level (LOG, ERROR, WARN, INFO)
   * @param {any[]} args - Arguments to log
   * @returns {string} Formatted log message
   */
  function formatLogMessage(level, args) {
    const timestamp = new Date().toISOString();
    const message = args
      .map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");
    return `[${timestamp}] [${level}] ${message}\n`;
  }

  /**
   * Writes to both console and log file
   * @param {string} level - Log level
   * @param {Function} originalMethod - Original console method
   * @param {any[]} args - Arguments to log
   */
  function writeLog(level, originalMethod, args) {
    // Write to console (PM2 will capture this)
    originalMethod.apply(console, args);

    // Write to log file
    if (logStream && logStream.writable) {
      const logMessage = formatLogMessage(level, args);
      logStream.write(logMessage, (err) => {
        if (err) {
          // Fallback to stderr if file write fails
          process.stderr.write(`Failed to write to log file: ${err.message}\n`);
        }
      });
    }
  }

  // Store original console methods
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  // Override console methods
  console.log = function (...args) {
    writeLog("LOG", originalConsole.log, args);
  };
  console.log.__isOverridden = true;

  console.error = function (...args) {
    writeLog("ERROR", originalConsole.error, args);
  };
  console.error.__isOverridden = true;

  console.warn = function (...args) {
    writeLog("WARN", originalConsole.warn, args);
  };
  console.warn.__isOverridden = true;

  console.info = function (...args) {
    writeLog("INFO", originalConsole.info, args);
  };
  console.info.__isOverridden = true;

  console.debug = function (...args) {
    writeLog("DEBUG", originalConsole.debug, args);
  };
  console.debug.__isOverridden = true;

  // Handle process exit to close log stream
  process.on("exit", () => {
    if (logStream) {
      logStream.end();
    }
  });

  process.on("SIGINT", () => {
    if (logStream) {
      logStream.end();
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    if (logStream) {
      logStream.end();
    }
    process.exit(0);
  });

  // Log initialization (use original console to avoid recursion)
  originalConsole.log(`📝 Console logging initialized. Log file: ${consoleLogPath}`);
}

// Export log path for reference (will be undefined if not initialized, but that's okay)
let consoleLogPath = undefined;
if (global.__consoleLoggerInitialized) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  consoleLogPath = path.join("./logs", `console_${year}_${month}_${day}.log`);
}

export { consoleLogPath };
