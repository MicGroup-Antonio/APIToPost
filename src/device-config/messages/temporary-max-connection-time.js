import chalk from "chalk";
import { numberToLittleEndianHex } from "../utils/hex-converter.js";
import { parseInteger } from "../utils/input-parser.js";

/**
 * Helper functions for temporary maximum connection time configuration
 */

/**
 * Format minutes to human-readable time
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string
 */
function formatMinutes(minutes) {
  if (minutes < 60) {
    return `${minutes} minute(s)`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    let result = `${hours} hour(s)`;
    if (mins > 0) {
      result += ` ${mins} minute(s)`;
    }
    return result;
  }
}

/**
 * Configure temporary maximum connection time
 * @param {Function} ask - Function to prompt user for input
 * @param {number|null} existingValue - Optional existing value in seconds to pre-fill (will be converted to minutes for display)
 * @returns {Promise<string>} Hex value for the configuration frame (4 bytes little-endian, in seconds)
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
  console.log("");
  
  // Convert existing value from seconds to minutes for display
  let existingMinutes = null;
  if (existingValue !== null && existingValue !== undefined) {
    existingMinutes = Math.floor(existingValue / 60);
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
      break;
    }
    console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
  }
  
  console.log("");
  console.log(chalk.green("✓ Configuration:"));
  console.log(chalk.white(`   Temporary Max Connection Time: ${minutes} minute(s)`));
  console.log(chalk.gray(`   (${formatMinutes(minutes)})`));
  console.log("");
  
  // Convert minutes to seconds for the protocol (4-byte little-endian hex)
  const seconds = minutes * 60;
  const hexValue = numberToLittleEndianHex(seconds, 4);
  
  console.log(chalk.cyan("Hex value (4 bytes, little-endian, in seconds):"));
  console.log(chalk.white(`   ${hexValue} (${seconds} seconds)`));
  console.log("");
  
  await ask(chalk.gray("Press Enter to continue..."));
  
  return hexValue;
}

