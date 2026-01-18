import fs from "fs";
import { getName } from "./tst.js";
import { getSession } from "./sessionManager.js";
import * as tConst from "./const.js";

/**
 * Gets the message log file path for the current day
 * Format: log_message_YYYY_MM_DD.log
 * @returns {string} Message log file path
 */
function getMessageLogPath() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0"); // 01-12
  const day = String(currentDate.getDate()).padStart(2, "0"); // 01-31
  return `./logs/log_message_${year}_${month}_${day}.log`;
}

/**
 * Extracts device name from a message or session
 * @param {Buffer|string} message - Message buffer or hex string
 * @param {string|null} sessionH - Session high byte (optional)
 * @param {string|null} sessionL - Session low byte (optional)
 * @returns {string} Device name or "unknown" if not found
 */
function extractDeviceName(message, sessionH = null, sessionL = null) {
  // Try to get from session first if session IDs are provided
  if (sessionH && sessionL) {
    const session = getSession(sessionH, sessionL);
    if (session && session.topic) {
      return session.topic;
    }
  }

  // Try to extract from message if it's an authentication frame
  try {
    const msgHex = Buffer.isBuffer(message) ? message.toString("hex") : message;
    if (msgHex.length >= 2) {
      const frameType = msgHex.slice(0, 2).toLowerCase();
      if (frameType === tConst.CODE_R_AUTH.toLowerCase()) {
        const name = getName(msgHex);
        if (name && name.trim()) {
          return name.trim();
        }
      }
    }
  } catch (error) {
    // Ignore errors, fall back to unknown
  }

  return "unknown";
}

/**
 * Logs a message (received or sent) to the message log file
 * Format: timestamp | deviceName | direction | hexMessage
 * @param {Buffer|string} message - Message buffer or hex string
 * @param {string} direction - "received" or "sent"
 * @param {string|null} sessionH - Session high byte (optional)
 * @param {string|null} sessionL - Session low byte (optional)
 */
function logMessage(message, direction, sessionH = null, sessionL = null) {
  try {
    // Convert message to hex string
    const hexMessage = Buffer.isBuffer(message) ? message.toString("hex") : message;
    
    // Extract device name
    const deviceName = extractDeviceName(message, sessionH, sessionL);
    
    // Get timestamp
    const timestamp = new Date().toISOString();
    
    // Format log entry: timestamp | deviceName | direction | hexMessage
    const logEntry = `${timestamp} | ${deviceName} | ${direction} | ${hexMessage}\n`;
    
    // Get current log path
    const logPath = getMessageLogPath();
    
    // Ensure logs directory exists
    const logsDir = "./logs";
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Append to log file
    fs.appendFile(logPath, logEntry, (err) => {
      if (err) {
        console.error(`❌ Failed to write to message log file: ${err.message}`);
      }
    });
  } catch (error) {
    console.error(`❌ Error logging message: ${error.message}`);
  }
}

export { logMessage };


