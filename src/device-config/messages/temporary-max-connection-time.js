import chalk from "chalk";
import { numberToLittleEndianHex } from "../utils/hex-converter.js";
import { parseInteger } from "../utils/input-parser.js";
import { formatMinutes } from "../utils/time-parser.js";

/**
 * Helper functions for temporary maximum connection time configuration
 * 
 * COMPLETE HEX MESSAGE STRUCTURE:
 * ================================
 * 
 * This function returns only the VALUE portion of the hex message. The complete
 * message frame is built by buildConfigFrame() in device-config.js with the
 * following structure:
 * 
 * Complete Frame Structure (example for 20 minutes = 0x14):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Byte │ Hex  │ Description                                      │
 * ├──────┼──────┼──────────────────────────────────────────────────┤
 * │  0   │ 11   │ Frame Type: CODE_S_CONF (Configuration frame)    │
 * │  1   │ 0e   │ Config Code: CODE_C_TTMAX (Temporary Max Time)  │
 * │  2   │ 00   │ Frame ID (not used for config frames)            │
 * │  3   │ 00   │ Session ID High Byte (not used for config)       │
 * │  4   │ 00   │ Session ID Low Byte (not used for config)        │
 * │  5-6 │ 0100 │ Size: 1 byte (little-endian: 0x0001 = "0100")   │
 * │  7   │ 14   │ Value: Minutes (0x14 = 20 minutes)               │
 * │ 8-9  │ xxxx │ CRC: 2-byte checksum (calculated)                │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Total: 10 bytes (20 hex characters) + CRC = 12 bytes (24 hex chars)
 * 
 * DETAILED BREAKDOWN:
 * -------------------
 * 
 * 1. Frame Type (Byte 0): "11"
 *    - CODE_S_CONF = 0x11 = Configuration frame type
 *    - Indicates this is a configuration command
 * 
 * 2. Config Code (Byte 1): "0e"
 *    - CODE_C_TTMAX = 0x0E = Temporary Maximum Connection Time
 *    - Identifies which configuration parameter is being set
 * 
 * 3. Frame ID (Byte 2): "00"
 *    - Not used for configuration frames (always 0x00)
 *    - Used for tracking in other frame types
 * 
 * 4. Session ID High (Byte 3): "00"
 *    - Not used for configuration frames (always 0x00)
 *    - High byte of session identifier
 * 
 * 5. Session ID Low (Byte 4): "00"
 *    - Not used for configuration frames (always 0x00)
 *    - Low byte of session identifier
 * 
 * 6. Size Field (Bytes 5-6): "0100"
 *    - Little-endian format: LSB first, MSB second
 *    - Value: 1 byte (0x0001)
 *    - Format: "0100" = byte 5: 0x01, byte 6: 0x00
 *    - Indicates the value field is 1 byte long
 * 
 * 7. Value Field (Byte 7): "14" (example for 20 minutes)
 *    - This is what configureTemporaryMaxConnectionTime() returns
 *    - Single byte representing minutes (0-255)
 *    - Example: 20 minutes = 0x14 = "14"
 *    - Example: 60 minutes = 0x3C = "3c"
 *    - Example: 255 minutes = 0xFF = "ff"
 * 
 * 8. CRC (Bytes 8-9): Calculated checksum
 *    - 2-byte CRC calculated over bytes 0-7
 *    - Ensures message integrity
 * 
 * EXAMPLE COMPLETE MESSAGE (20 minutes):
 * --------------------------------------
 * Input: 20 minutes
 * Function returns: "14" (just the value)
 * Complete message: "110e000000010014" + CRC
 * 
 * Breakdown:
 * - "11" = Frame type (CONFIG)
 * - "0e" = Config code (TTMAX)
 * - "0000" = Frame ID + Session (unused)
 * - "0100" = Size: 1 byte (little-endian)
 * - "14" = Value: 20 minutes
 * - "xxxx" = CRC (calculated)
 * 
 * POTENTIAL ISSUES TO CHECK:
 * --------------------------
 * 1. Size field: Should be "0100" (little-endian for 1 byte)
 * 2. Value format: Should be single byte (00-ff), not padded
 * 3. Endianness: Size is little-endian, value is big-endian (single byte)
 * 4. CRC calculation: Must be calculated over all bytes before CRC
 */

/**
 * Configure temporary maximum connection time
 * @param {Function} ask - Function to prompt user for input
 * @param {number|null} existingValue - Optional existing value in minutes to pre-fill
 * @returns {Promise<string>} Hex value for the configuration frame (single byte hex, in minutes)
 *                            This returns ONLY the value portion (e.g., "14" for 20 minutes).
 *                            The complete frame is built by buildConfigFrame() which adds:
 *                            - Frame header (type, code, frame ID, session)
 *                            - Size field (little-endian, 2 bytes)
 *                            - This value (1 byte)
 *                            - CRC (2 bytes)
 */
export async function configureTemporaryMaxConnectionTime(ask, existingValue = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         TEMPORARY MAX CONNECTION TIME"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("Configure the temporary maximum connection time."));
  console.log(chalk.white("This value specifies the maximum time (in minutes) that"));
  console.log(chalk.white("the device can maintain a connection temporarily."));
  console.log(chalk.gray("Value is stored as a single byte in hex format (0-255 minutes)."));
  console.log("");
  
  // existingValue is already in minutes (from parsing)
  let existingMinutes = existingValue;
  if (existingMinutes !== null && existingMinutes !== undefined) {
    console.log(chalk.yellow.bold("Current Configuration:"));
    console.log(chalk.white(`   Temporary Max Connection Time: ${existingMinutes} minute(s)`));
    console.log(chalk.gray(`   (${formatMinutes(existingMinutes)})`));
    console.log("");
  }
  
  let minutes;
  while (true) {
    const prompt = existingMinutes !== null && existingMinutes !== undefined
      ? chalk.yellow(`Temporary maximum connection time in minutes (current: ${existingMinutes}, press Enter to keep): `)
      : chalk.yellow("Temporary maximum connection time (minutes): ");
    
    const minutesInput = await ask(prompt);
    
    // If updating and user pressed Enter, keep existing value
    if (existingMinutes !== null && existingMinutes !== undefined && !minutesInput.trim()) {
      minutes = existingMinutes;
      console.log(chalk.green(`✓ Keeping current value: ${minutes} minute(s)`));
      break;
    }
    
    minutes = parseInteger(minutesInput, 0);
    if (minutes !== null) {
      // Validate range for single byte (0-255)
      if (minutes > 255) {
        console.log(chalk.red("❌ Value too large. Maximum is 255 minutes for single byte format."));
        continue;
      }
      break;
    }
    console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
  }
  
  console.log("");
  console.log(chalk.green("✓ Configuration:"));
  console.log(chalk.white(`   Temporary Max Connection Time: ${minutes} minute(s)`));
  console.log(chalk.gray(`   (${formatMinutes(minutes)})`));
  console.log("");
  
  // Store minutes directly as single byte hex (e.g., 0x14 = 20 minutes)
  const hexValue = minutes.toString(16).padStart(2, "0").toLowerCase();
  
  console.log(chalk.cyan("Hex value (single byte, in minutes):"));
  console.log(chalk.white(`   ${hexValue} (0x${hexValue} = ${minutes} minutes)`));
  console.log("");
  
  await ask(chalk.gray("Press Enter to continue..."));
  
  return hexValue;
}

