/**
 * Utility functions for hex conversion
 */

/**
 * Convert number to little-endian hex string
 * @param {number} value - Number to convert
 * @param {number} bytes - Number of bytes
 * @returns {string} Hex string in little-endian format
 */
export function numberToLittleEndianHex(value, bytes) {
  let hex = "";
  for (let i = 0; i < bytes; i++) {
    const byte = (value >> (i * 8)) & 0xff;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

