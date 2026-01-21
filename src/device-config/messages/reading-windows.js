import chalk from "chalk";
import { parseTimeToMinutes, minutesToTime, formatMinutesForDisplay } from "../utils/time-parser.js";
import { numberToLittleEndianHex } from "../utils/hex-converter.js";
import { parseInteger, parseBoolean } from "../utils/input-parser.js";

/**
 * Helper functions for reading windows configuration
 */

/**
 * Configure reading windows (up to 8 windows)
 * @param {Function} ask - Function to prompt user for input
 * @param {Array} existingWindows - Optional array of existing windows to pre-fill
 * @returns {Promise<string>} Hex value for the configuration frame
 */
export async function configureReadingWindows(ask, existingWindows = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         READING WINDOWS CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("You can configure up to 8 reading windows."));
  console.log(chalk.yellow("Each window requires:"));
  console.log(chalk.white("  - Start time (minutes UTC, 0-1440, e.g., 720 = 12:00)"));
  console.log(chalk.white("  - End time (minutes UTC, 0-1440, e.g., 780 = 13:00)"));
  console.log(chalk.white("  - Sampling interval (minutes, e.g., 5)"));
  console.log("");
  
  const windows = [];
  let windowCount = 0;
  
  // If updating, show existing windows and allow editing
  if (existingWindows && existingWindows.length > 0) {
    console.log(chalk.yellow.bold("Existing Windows (you can modify or add more):"));
    existingWindows.forEach((window) => {
      const startHours = Math.floor(window.start_time_minutes / 60);
      const startMins = window.start_time_minutes % 60;
      const endHours = Math.floor(window.end_time_minutes / 60);
      const endMins = window.end_time_minutes % 60;
      const status = window.enabled === 1 ? chalk.green("enabled") : chalk.red("disabled");
      console.log(chalk.white(`   Window ${window.window_number}: `) + 
                 chalk.blue(`${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')} - ${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')} UTC`) +
                 chalk.gray(` | Sampling: ${window.sampling_interval_minutes} min | `) + status);
    });
    console.log("");
    
    // Ask if user wants to keep existing windows or reconfigure
    const keepExisting = await ask(chalk.yellow("Keep existing windows and add more? (y/n, default: n to reconfigure all): "));
    const keepExistingBool = parseBoolean(keepExisting, false);
    
    if (keepExistingBool === true) {
      // Keep existing windows, add more - validate that end time > start time for each
      let hasInvalidWindow = false;
      existingWindows.forEach((window) => {
        if (window.end_time_minutes <= window.start_time_minutes) {
          const startTimeStr = minutesToTime(window.start_time_minutes);
          const endTimeStr = minutesToTime(window.end_time_minutes);
          console.log(chalk.red(`❌ Window ${window.window_number} is invalid: End time (${endTimeStr}) must be greater than start time (${startTimeStr}).`));
          hasInvalidWindow = true;
        } else {
          windows.push({
            windowNumber: window.window_number,
            startTimeMinutes: window.start_time_minutes,
            endTimeMinutes: window.end_time_minutes,
            samplingIntervalMinutes: window.sampling_interval_minutes,
            enabled: window.enabled === 1
          });
          windowCount++;
        }
      });
      
      if (hasInvalidWindow) {
        console.log(chalk.yellow("⚠️  Invalid windows were skipped. You can reconfigure them."));
        console.log("");
      } else {
        console.log(chalk.green(`✅ Keeping ${existingWindows.length} existing window(s). You can add more.`));
        console.log("");
      }
    }
  }
  
  while (windowCount < 8) {
    console.log(chalk.cyan(`\n--- Window ${windowCount + 1} ---`));
    
    // Check if this window already exists (when updating)
    let existingWindow = null;
    if (existingWindows && existingWindows.length > 0) {
      existingWindow = existingWindows.find(w => w.window_number === windowCount + 1);
    }
    
    // Ask if user wants to add/update another window
    if (windowCount > 0 || (existingWindow && windows.length > 0)) {
      const addMore = await ask(chalk.yellow(`Configure window ${windowCount + 1}? (y/n): `));
      const addMoreBool = parseBoolean(addMore, false);
      if (addMoreBool === false) {
        break;
      }
    }
    
    // Get start time (pre-fill if updating existing)
    let startTimeMinutes;
    while (true) {
      const defaultTime = existingWindow ? minutesToTime(existingWindow.start_time_minutes) : "";
      const prompt = defaultTime ? `Start time (HH:MM format, current: ${defaultTime}): ` : "Start time (HH:MM format, e.g., 12:30): ";
      const startInput = await ask(chalk.yellow(prompt));
      if (!startInput.trim() && defaultTime) {
        startTimeMinutes = existingWindow.start_time_minutes;
        break;
      }
      startTimeMinutes = parseTimeToMinutes(startInput);
      if (startTimeMinutes !== null) {
        break;
      }
      console.log(chalk.red("❌ Invalid time format. Please enter time in HH:MM format (e.g., 12:30, 09:05). Hours: 0-23, Minutes: 0-59."));
    }
    
    // Get end time (pre-fill if updating existing)
    let endTimeMinutes;
    while (true) {
      const defaultTime = existingWindow ? minutesToTime(existingWindow.end_time_minutes) : "";
      const prompt = defaultTime ? `End time (HH:MM format, current: ${defaultTime}): ` : "End time (HH:MM format, e.g., 13:00): ";
      const endInput = await ask(chalk.yellow(prompt));
      if (!endInput.trim() && defaultTime) {
        // User kept existing end time - validate it's greater than start time
        endTimeMinutes = existingWindow.end_time_minutes;
        if (endTimeMinutes > startTimeMinutes) {
          break;
        } else {
          const endTimeStr = minutesToTime(endTimeMinutes);
          const startTimeStr = minutesToTime(startTimeMinutes);
          console.log(chalk.red(`❌ End time (${endTimeStr}) must be greater than start time (${startTimeStr}). Please enter a new end time.`));
          continue;
        }
      }
      endTimeMinutes = parseTimeToMinutes(endInput);
      if (endTimeMinutes !== null && endTimeMinutes > startTimeMinutes) {
        break;
      }
      if (endTimeMinutes !== null && endTimeMinutes <= startTimeMinutes) {
        const endTimeStr = minutesToTime(endTimeMinutes);
        const startTimeStr = minutesToTime(startTimeMinutes);
        console.log(chalk.red(`❌ End time (${endTimeStr}) must be greater than start time (${startTimeStr}).`));
      } else {
        console.log(chalk.red("❌ Invalid time format. Please enter time in HH:MM format (e.g., 12:30, 09:05). Hours: 0-23, Minutes: 0-59."));
      }
    }
    
    // Get sampling interval (pre-fill if updating existing)
    let samplingInterval;
    while (true) {
      const defaultSampling = existingWindow ? existingWindow.sampling_interval_minutes.toString() : "";
      const prompt = defaultSampling ? `Sampling interval (minutes, >= 0, current: ${defaultSampling}): ` : "Sampling interval (minutes, >= 0): ";
      const samplingInput = await ask(chalk.yellow(prompt));
      if (!samplingInput.trim() && defaultSampling) {
        samplingInterval = existingWindow.sampling_interval_minutes;
        break;
      }
      samplingInterval = parseInteger(samplingInput, 0);
      if (samplingInterval !== null) {
        break;
      }
      console.log(chalk.red("❌ Invalid sampling interval. Please enter a number >= 0."));
    }
    
    // Get enabled status (pre-fill if updating existing)
    let enabled = existingWindow ? (existingWindow.enabled === 1) : true;
    const defaultEnabled = existingWindow ? (existingWindow.enabled === 1 ? "y" : "n") : "y";
    const enabledInput = await ask(chalk.yellow(`Enable this window? (y/n, current: ${defaultEnabled}): `));
    if (enabledInput.trim()) {
      const enabledBool = parseBoolean(enabledInput);
      if (enabledBool !== null) {
        enabled = enabledBool;
      }
    }
    
    windows.push({
      windowNumber: windowCount + 1,
      startTimeMinutes,
      endTimeMinutes,
      samplingIntervalMinutes: samplingInterval,
      enabled
    });
    
    windowCount++;
    
    // Show summary
    const startTime = formatMinutesForDisplay(startTimeMinutes);
    const endTime = formatMinutesForDisplay(endTimeMinutes);
    console.log(chalk.green(`✅ Window ${windowCount} configured: ${startTime} - ${endTime} UTC, sampling: ${samplingInterval} min, enabled: ${enabled ? 'yes' : 'no'}`));
  }
  
  if (windows.length === 0) {
    console.log(chalk.yellow("⚠️  No windows configured. Returning empty value."));
    return "";
  }
  
  // Build hex value from windows (each window is 6 bytes)
  // Format: start_time (2 bytes LE) + end_time (2 bytes LE) + sampling (2 bytes LE)
  let hexValue = "";
  for (let i = 0; i < 8; i++) {
    if (i < windows.length && windows[i].enabled) {
      const window = windows[i];
      // Convert to little-endian hex (2 bytes each)
      const startHex = numberToLittleEndianHex(window.startTimeMinutes, 2);
      const endHex = numberToLittleEndianHex(window.endTimeMinutes, 2);
      const samplingHex = numberToLittleEndianHex(window.samplingIntervalMinutes, 2);
      hexValue += startHex + endHex + samplingHex;
    } else {
      // Empty window (all zeros)
      hexValue += "000000000000";
    }
  }
  
  // Store windows data for later insertion (we'll need device_config_id)
  // Store in a module-level variable
  if (!global.readingWindowsData) {
    global.readingWindowsData = {};
  }
  global.readingWindowsData.pending = windows;
  
  console.log(chalk.blue(`\n📦 Generated hex value: ${hexValue}`));
  console.log(chalk.blue(`📏 Total length: ${hexValue.length / 2} bytes (${windows.length} window(s))`));
  
  return hexValue;
}

