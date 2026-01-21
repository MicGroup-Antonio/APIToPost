/**
 * Utility functions for parsing and validating user input
 */

/**
 * Parse integer with validation
 * @param {string} input - Input string
 * @param {number} min - Minimum value (optional)
 * @param {number} max - Maximum value (optional)
 * @param {number} defaultValue - Default value if input is empty (optional)
 * @returns {number|null} Parsed integer or null if invalid
 */
export function parseInteger(input, min = null, max = null, defaultValue = null) {
  if (!input) {
    return defaultValue !== null ? defaultValue : null;
  }
  const trimmed = input.trim();
  if (!trimmed && defaultValue !== null) {
    return defaultValue;
  }
  if (!trimmed) {
    return null;
  }
  
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) {
    return null;
  }
  
  if (min !== null && parsed < min) {
    return null;
  }
  if (max !== null && parsed > max) {
    return null;
  }
  
  return parsed;
}

/**
 * Parse boolean from user input
 * @param {string} input - Input string
 * @param {boolean} defaultValue - Default value if input is empty
 * @returns {boolean|null} Parsed boolean or null if invalid
 */
export function parseBoolean(input, defaultValue = null) {
  if (!input || !input.trim()) {
    return defaultValue;
  }
  const lower = input.trim().toLowerCase();
  if (lower === "y" || lower === "yes" || lower === "true" || lower === "1" || lower === "on") {
    return true;
  }
  if (lower === "n" || lower === "no" || lower === "false" || lower === "0" || lower === "off") {
    return false;
  }
  return null;
}

/**
 * Parse text input with validation
 * @param {string} input - Input string
 * @param {boolean} required - Whether input is required
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string|null} Parsed text or null if invalid
 */
export function parseText(input, required = false, maxLength = null) {
  if (!input) {
    return required ? null : "";
  }
  const trimmed = input.trim();
  
  if (required && !trimmed) {
    return null;
  }
  
  if (maxLength !== null && trimmed.length > maxLength) {
    return null;
  }
  
  return trimmed || null;
}

/**
 * Validates port number (1-65535)
 * @param {string} input - Port input string
 * @param {number} defaultValue - Default port if input is empty
 * @returns {number|null} Parsed port or null if invalid
 */
export function parsePort(input, defaultValue = null) {
  return parseInteger(input, 1, 65535, defaultValue);
}

/**
 * Validates hex string format
 * @param {string} hex - Hex string
 * @returns {boolean} True if valid hex format
 */
export function isValidHex(hex) {
  if (!hex || !hex.trim()) {
    return false;
  }
  const trimmed = hex.trim().toLowerCase();
  return /^[0-9a-f]+$/.test(trimmed);
}

/**
 * Converts a string to hex and pads to specified byte length
 * @param {string} str - String to convert
 * @param {number} lengthBytes - Target length in bytes
 * @returns {string} Hex string
 */
export function stringToHexPadded(str, lengthBytes) {
  const buf = Buffer.from(str, "ascii");
  const padding = Buffer.alloc(Math.max(lengthBytes - buf.length, 0), 0x00);
  return Buffer.concat([buf, padding]).toString("hex");
}

