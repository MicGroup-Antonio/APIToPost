import chalk from "chalk";
import { parseInteger } from "../utils/input-parser.js";
import { formatMinutes } from "../utils/time-parser.js";

/**
 * Helper functions for WMBUS reading time configuration
 */

/**
 * Configure WMBUS reading time
 * @param {Function} ask - Function to prompt user for input
 * @param {number|null} existingValue - Optional existing value in minutes to pre-fill
 * @returns {Promise<string>} Hex value for the configuration frame (2 bytes big-endian, in minutes)
 */
export async function configureWmbusReadingTime(ask, existingValue = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         WMBUS READING TIME"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("Configure the maximum WMBUS reading time."));
  console.log(chalk.white("This value specifies the maximum time (in minutes) that"));
  console.log(chalk.white("the device will listen for WMBUS readings."));
  console.log(chalk.gray("Using 2-byte format for larger range (big-endian, per documentation)."));
  console.log("");
  
  // existingValue is already in minutes (from parsing)
  let existingMinutes = existingValue;
  if (existingMinutes !== null && existingMinutes !== undefined) {
    console.log(chalk.yellow.bold("Current Configuration:"));
    console.log(chalk.white(`   WMBUS Reading Time: ${existingMinutes} minute(s)`));
    console.log(chalk.gray(`   (${formatMinutes(existingMinutes)})`));
    console.log("");
  }
  
  let minutes;
  while (true) {
    const prompt = existingMinutes !== null && existingMinutes !== undefined
      ? chalk.yellow(`WMBUS reading time in minutes (current: ${existingMinutes}, press Enter to keep): `)
      : chalk.yellow("WMBUS reading time (minutes): ");
    
    const minutesInput = await ask(prompt);
    
    // If updating and user pressed Enter, keep existing value
    if (existingMinutes !== null && existingMinutes !== undefined && !minutesInput.trim()) {
      minutes = existingMinutes;
      console.log(chalk.green(`✓ Keeping current value: ${minutes} minute(s)`));
      break;
    }
    
    minutes = parseInteger(minutesInput, 0);
    if (minutes !== null) {
      // Validate range for 2-byte unsigned integer (0-65535)
      if (minutes > 65535) {
        console.log(chalk.red("❌ Value too large. Maximum is 65535 minutes."));
        continue;
      }
      break;
    }
    console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
  }
  
  console.log("");
  console.log(chalk.green("✓ Configuration:"));
  console.log(chalk.white(`   WMBUS Reading Time: ${minutes} minute(s)`));
  console.log(chalk.gray(`   (${formatMinutes(minutes)})`));
  console.log("");
  
  // Format: 2 bytes big-endian (minutes) - per documentation
  // Documentation shows: 0x0190 = 400 minutes (big-endian format)
  // Example: 60 minutes = 0x003C = "003c" (big-endian, 2 bytes)
  // Example: 400 minutes = 0x0190 = "0190" (big-endian, 2 bytes)
  const minutesHex = minutes.toString(16).padStart(4, "0").toLowerCase();
  const hexValue = minutesHex;
  
  console.log(chalk.cyan("Hex value (2 bytes big-endian, in minutes):"));
  console.log(chalk.white(`   ${hexValue} (${minutes} minutes = 0x${hexValue.toUpperCase()})`));
  console.log(chalk.gray(`   Format: Big-endian (MSB first), per documentation`));
  console.log("");
  
  await ask(chalk.gray("Press Enter to continue..."));
  
  return hexValue;
}

