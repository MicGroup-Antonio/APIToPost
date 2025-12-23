import { calcularCRC, buildTrama } from "../tst.js";
import * as tConst from "../const.js";
import readline from "readline";
import { initDatabase, closeDatabase, getDatabase, deviceDB, deviceConfigsDB, transmissionWindowsDB } from "./db.js";
import chalk from "chalk";

// Force color output for Git Bash and Windows terminals
// Set FORCE_COLOR environment variable if not already set
if (process.platform === 'win32' && !process.env.FORCE_COLOR) {
  process.env.FORCE_COLOR = '1';
}

// Initialize database on startup
try {
  initDatabase();
} catch (error) {
  console.error(chalk.red("❌ Failed to initialize database:"), error.message);
  process.exit(1);
}

// Default values
let HOST = "localhost";
let PORT = 3005;
let currentDeviceId = null;

// Device state
let deviceState = {
  sessionH: "00",
  sessionL: "00",
  frameId: "00",
  authenticated: false,
};

const charPerByte = 2;

// Configuration menu options
const configOptions = [
  { code: tConst.CODE_C_PSM, name: "PSM Configuration", description: "Power Saving Mode configuration" },
  { code: tConst.CODE_C_WEV, name: "Network Configuration", description: "Network settings (WEV)" },
  { code: tConst.CODE_C_SERV, name: "Server Parameters", description: "Server connection parameters" },
  { code: tConst.CODE_C_SEND, name: "Transmission Windows", description: "Transmission window settings" },
  { code: tConst.CODE_C_RECV, name: "Reading Windows", description: "Reading window settings" },
  { code: tConst.CODE_C_DNS, name: "DNS Configuration", description: "DNS server settings" },
  { code: tConst.CODE_C_AUTH, name: "Authorization Parameters", description: "Authentication parameters" },
  { code: tConst.CODE_C_MAGN, name: "Magnet Activation", description: "Enable/disable magnet" },
  { code: tConst.CODE_C_RTC, name: "RTC Adjustment", description: "Adjust RTC to network time" },
  { code: tConst.CODE_C_NTP, name: "NTP Configuration", description: "NTP server settings" },
  { code: tConst.CODE_C_RSER, name: "Remote Server Parameters", description: "Remote server configuration" },
  { code: tConst.CODE_C_TRSER, name: "Temporary Remote Server", description: "Temporary remote server parameters" },
  { code: tConst.CODE_C_TMAX, name: "Max Connection Time", description: "Maximum connection time" },
  { code: tConst.CODE_C_TTMAX, name: "Temporary Max Connection Time", description: "Temporary maximum connection time" },
  { code: tConst.CODE_C_WMBUS, name: "WMBUS Reading Time", description: "WMBUS reading time configuration" },
];

// Create a single readline interface for the entire script
let rl = null;

function createReadline() {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

function closeReadline() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

function ask(question) {
  const rl = createReadline();

  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      resolve(answer);
    })
  );
}

/**
 * Validation and parsing helper functions
 */

/**
 * Validates and parses an integer
 * @param {string} input - Input string
 * @param {number} min - Minimum value (optional)
 * @param {number} max - Maximum value (optional)
 * @param {number} defaultValue - Default value if input is empty
 * @returns {number|null} Parsed integer or null if invalid
 */
function parseInteger(input, min = null, max = null, defaultValue = null) {
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
 * Validates IP address format (IPv4)
 * @param {string} ip - IP address string
 * @returns {boolean} True if valid IP format
 */
function isValidIP(ip) {
  if (!ip || !ip.trim()) {
    return false;
  }
  
  const parts = ip.trim().split('.');
  if (parts.length !== 4) {
    return false;
  }
  
  return parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

/**
 * Validates hex string format
 * @param {string} hex - Hex string
 * @returns {boolean} True if valid hex format
 */
function isValidHex(hex) {
  if (!hex || !hex.trim()) {
    return false;
  }
  
  const trimmed = hex.trim().toLowerCase();
  return /^[0-9a-f]+$/.test(trimmed);
}

/**
 * Validates and trims text input
 * @param {string} input - Input string
 * @param {boolean} required - Whether field is required
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string|null} Trimmed string or null if invalid
 */
function parseText(input, required = false, maxLength = null) {
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
function parsePort(input, defaultValue = null) {
  return parseInteger(input, 1, 65535, defaultValue);
}

/**
 * Validates boolean input (y/n, yes/no, 1/0, true/false)
 * @param {string} input - Input string
 * @param {boolean} defaultValue - Default value if input is empty
 * @returns {boolean|null} Boolean value or null if invalid
 */
function parseBoolean(input, defaultValue = null) {
  const trimmed = input.trim().toLowerCase();
  
  if (!trimmed && defaultValue !== null) {
    return defaultValue;
  }
  
  if (['y', 'yes', '1', 'true', 'on'].includes(trimmed)) {
    return true;
  }
  if (['n', 'no', '0', 'false', 'off'].includes(trimmed)) {
    return false;
  }
  
  return null;
}

/**
 * Converts a string to hex and pads to specified byte length
 */
function stringToHexPadded(str, lengthBytes) {
  const buf = Buffer.from(str, "ascii");
  const padding = Buffer.alloc(Math.max(lengthBytes - buf.length, 0), 0x00);
  return Buffer.concat([buf, padding]).toString("hex");
}

/**
 * Converts a number to little-endian hex string
 */
function numberToLittleEndianHex(num, bytes) {
  let hex = num.toString(16).padStart(bytes * 2, "0");
  // Convert to little-endian (swap bytes)
  let result = "";
  for (let i = bytes - 1; i >= 0; i--) {
    result += hex.slice(i * 2, (i + 1) * 2);
  }
  return result;
}

/**
 * Builds a CONFIG frame
 * @param {string} configCode - Configuration type code (e.g., CODE_C_PSM)
 * @param {string} valueHex - Configuration value in hex format
 * @returns {string} Complete frame in hex
 */
function buildConfigFrame(configCode, valueHex) {
  const trama = {};
  trama.idTrama = tConst.CODE_S_CONF;
  trama.ack = configCode;
  // Use default values for frame ID and session (not applicable for config frames)
  trama.idFrame = "00";
  trama.idSessionH = "00";
  trama.idSessionL = "00";
  
  // Calculate size (little-endian, in bytes)
  const valueBytes = valueHex.length / 2;
  trama.size = numberToLittleEndianHex(valueBytes, 2);
  trama.value = valueHex;
  
  // Build frame without CRC
  const cadena = buildTrama(trama, false);
  const crc = calcularCRC(cadena);
  
  return (cadena + crc).toLowerCase();
}

/**
 * Prompts for configuration parameters based on config type
 */
async function getConfigParameters(configCode) {
  switch (configCode) {
    case tConst.CODE_C_PSM:
      console.log(chalk.cyan("\n=== PSM Configuration ==="));
      let psmValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter PSM configuration value (hex): "));
        if (isValidHex(hexInput)) {
          psmValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return psmValue;
      
    case tConst.CODE_C_WEV:
      console.log(chalk.cyan("\n=== Network Configuration ==="));
      let networkValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter network configuration value (hex): "));
        if (isValidHex(hexInput)) {
          networkValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return networkValue;
      
    case tConst.CODE_C_SERV:
      console.log(chalk.cyan("\n=== Server Parameters ==="));
      let serverHost, serverPort;
      
      // Get and validate server host
      while (true) {
        const hostInput = await ask(chalk.yellow("Server host/IP: "));
        serverHost = parseText(hostInput, true, 255);
        if (serverHost) {
          break;
        }
        console.log(chalk.red("❌ Server host/IP is required (max 255 characters)."));
      }
      
      // Get and validate server port
      while (true) {
        const portInput = await ask(chalk.yellow("Server port: "));
        serverPort = parsePort(portInput);
        if (serverPort !== null) {
          break;
        }
        console.log(chalk.red("❌ Invalid port number. Please enter a number between 1 and 65535."));
      }
      
      // Build server config hex value
      // Format depends on protocol - you'll need to adjust based on documentation
      const serverValue = stringToHexPadded(serverHost, 64) + numberToLittleEndianHex(serverPort, 2);
      return serverValue;
      
    case tConst.CODE_C_SEND:
      return await configureTransmissionWindows();
      
    case tConst.CODE_C_RECV:
      console.log(chalk.cyan("\n=== Reading Windows ==="));
      let recvValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter reading window configuration (hex): "));
        if (isValidHex(hexInput)) {
          recvValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return recvValue;
      
    case tConst.CODE_C_DNS:
      console.log(chalk.cyan("\n=== DNS Configuration ==="));
      let dnsValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter DNS configuration (hex): "));
        if (isValidHex(hexInput)) {
          dnsValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return dnsValue;
      
    case tConst.CODE_C_AUTH:
      console.log(chalk.cyan("\n=== Authorization Parameters ==="));
      const authUser = await ask(chalk.yellow("Username: "));
      const authPass = await ask(chalk.yellow("Password: "));
      const authValue = stringToHexPadded(authUser, 32) + stringToHexPadded(authPass, 32);
      return authValue;
      
    case tConst.CODE_C_MAGN:
      console.log(chalk.cyan("\n=== Magnet Activation ==="));
      console.log(chalk.white("0 - Disable"));
      console.log(chalk.white("1 - Enable"));
      let magnValue;
      while (true) {
        const boolInput = await ask(chalk.yellow("Enable magnet? (0/1 or y/n): "));
        const boolValue = parseBoolean(boolInput);
        if (boolValue !== null) {
          magnValue = boolValue ? "01" : "00";
          break;
        }
        // Also accept direct 0/1 input
        const directValue = parseInteger(boolInput, 0, 1);
        if (directValue !== null) {
          magnValue = directValue === 1 ? "01" : "00";
          break;
        }
        console.log(chalk.red("❌ Invalid input. Please enter 0/1, y/n, yes/no, or true/false."));
      }
      return magnValue;
      
    case tConst.CODE_C_RTC:
      console.log(chalk.cyan("\n=== RTC Adjustment ==="));
      let rtcValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter RTC adjustment value (hex): "));
        if (isValidHex(hexInput)) {
          rtcValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return rtcValue;
      
    case tConst.CODE_C_NTP:
      console.log(chalk.cyan("\n=== NTP Configuration ==="));
      let ntpServer;
      while (true) {
        const serverInput = await ask(chalk.yellow("NTP server address: "));
        ntpServer = parseText(serverInput, true, 255);
        if (ntpServer) {
          break;
        }
        console.log(chalk.red("❌ NTP server address is required (max 255 characters)."));
      }
      const ntpValue = stringToHexPadded(ntpServer, 64);
      return ntpValue;
      
    case tConst.CODE_C_RSER:
      console.log(chalk.cyan("\n=== Remote Server Parameters ==="));
      let rserValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter remote server configuration (hex): "));
        if (isValidHex(hexInput)) {
          rserValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return rserValue;
      
    case tConst.CODE_C_TRSER:
      console.log(chalk.cyan("\n=== Temporary Remote Server ==="));
      let trserValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter temporary remote server configuration (hex): "));
        if (isValidHex(hexInput)) {
          trserValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return trserValue;
      
    case tConst.CODE_C_TMAX:
      console.log(chalk.cyan("\n=== Max Connection Time ==="));
      let tmaxSeconds;
      while (true) {
        const secondsInput = await ask(chalk.yellow("Maximum connection time (seconds): "));
        tmaxSeconds = parseInteger(secondsInput, 0);
        if (tmaxSeconds !== null) {
          break;
        }
        console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
      }
      return numberToLittleEndianHex(tmaxSeconds, 4);
      
    case tConst.CODE_C_TTMAX:
      console.log(chalk.cyan("\n=== Temporary Max Connection Time ==="));
      let ttmaxSeconds;
      while (true) {
        const secondsInput = await ask(chalk.yellow("Temporary maximum connection time (seconds): "));
        ttmaxSeconds = parseInteger(secondsInput, 0);
        if (ttmaxSeconds !== null) {
          break;
        }
        console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
      }
      return numberToLittleEndianHex(ttmaxSeconds, 4);
      
    case tConst.CODE_C_WMBUS:
      console.log(chalk.cyan("\n=== WMBUS Reading Time ==="));
      let wmbusSeconds;
      while (true) {
        const secondsInput = await ask(chalk.yellow("WMBUS reading time (seconds): "));
        wmbusSeconds = parseInteger(secondsInput, 0);
        if (wmbusSeconds !== null) {
          break;
        }
        console.log(chalk.red("❌ Invalid number. Please enter a valid integer (>= 0)."));
      }
      return numberToLittleEndianHex(wmbusSeconds, 4);
      
    default:
      let customValue;
      while (true) {
        const hexInput = await ask(chalk.yellow("Enter configuration value (hex): "));
        if (isValidHex(hexInput)) {
          customValue = hexInput.trim().toLowerCase();
          break;
        }
        console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
      }
      return customValue;
  }
}

/**
 * Configure transmission windows (up to 8 windows)
 * Returns the hex value for the configuration frame
 */
/**
 * Configure transmission windows (up to 8 windows)
 * @param {Array} existingWindows - Optional array of existing windows to pre-fill
 * Returns the hex value for the configuration frame
 */
async function configureTransmissionWindows(existingWindows = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         TRANSMISSION WINDOWS CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("You can configure up to 8 transmission windows."));
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
      // Keep existing windows, add more
      existingWindows.forEach((window) => {
        windows.push({
          windowNumber: window.window_number,
          startTimeMinutes: window.start_time_minutes,
          endTimeMinutes: window.end_time_minutes,
          samplingIntervalMinutes: window.sampling_interval_minutes,
          enabled: window.enabled === 1
        });
        windowCount++;
      });
      console.log(chalk.green(`✅ Keeping ${existingWindows.length} existing window(s). You can add more.`));
      console.log("");
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
      const defaultStart = existingWindow ? existingWindow.start_time_minutes.toString() : "";
      const prompt = defaultStart ? `Start time (minutes UTC, 0-1440, current: ${defaultStart}): ` : "Start time (minutes UTC, 0-1440): ";
      const startInput = await ask(chalk.yellow(prompt));
      if (!startInput.trim() && defaultStart) {
        startTimeMinutes = existingWindow.start_time_minutes;
        break;
      }
      startTimeMinutes = parseInteger(startInput, 0, 1440);
      if (startTimeMinutes !== null) {
        break;
      }
      console.log(chalk.red("❌ Invalid start time. Please enter a number between 0 and 1440."));
    }
    
    // Get end time (pre-fill if updating existing)
    let endTimeMinutes;
    while (true) {
      const defaultEnd = existingWindow ? existingWindow.end_time_minutes.toString() : "";
      const prompt = defaultEnd ? `End time (minutes UTC, 0-1440, current: ${defaultEnd}): ` : "End time (minutes UTC, 0-1440): ";
      const endInput = await ask(chalk.yellow(prompt));
      if (!endInput.trim() && defaultEnd) {
        endTimeMinutes = existingWindow.end_time_minutes;
        break;
      }
      endTimeMinutes = parseInteger(endInput, 0, 1440);
      if (endTimeMinutes !== null && endTimeMinutes > startTimeMinutes) {
        break;
      }
      if (endTimeMinutes !== null && endTimeMinutes <= startTimeMinutes) {
        console.log(chalk.red("❌ End time must be greater than start time."));
      } else {
        console.log(chalk.red("❌ Invalid end time. Please enter a number between 0 and 1440."));
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
    const startHours = Math.floor(startTimeMinutes / 60);
    const startMins = startTimeMinutes % 60;
    const endHours = Math.floor(endTimeMinutes / 60);
    const endMins = endTimeMinutes % 60;
    console.log(chalk.green(`✅ Window ${windowCount} configured: ${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')} - ${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')} UTC, sampling: ${samplingInterval} min, enabled: ${enabled ? 'yes' : 'no'}`));
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
  if (!global.transmissionWindowsData) {
    global.transmissionWindowsData = {};
  }
  global.transmissionWindowsData.pending = windows;
  
  console.log(chalk.blue(`\n📦 Generated hex value: ${hexValue}`));
  console.log(chalk.blue(`📏 Total length: ${hexValue.length / 2} bytes (${windows.length} window(s))`));
  
  return hexValue;
}

/**
 * Root menu: Main device selection options
 */
async function showRootMenu() {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         DEVICE CONFIGURATION TOOL"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  if (currentDeviceId) {
    const device = deviceDB.getById(currentDeviceId);
    if (device) {
      console.log(chalk.blue(`   Device Name: `) + chalk.white.bold(device.name));
    }
  }
  console.log("");
  console.log(chalk.yellow.bold("Options:"));
  console.log(chalk.yellow("   1 - ") + chalk.white("Choose device from list"));
  console.log(chalk.yellow("   2 - ") + chalk.white("Add new device"));
  console.log(chalk.yellow("   3 - ") + chalk.white("Manage devices (update/delete)"));
  console.log("");
  console.log(chalk.red("   0 - ") + chalk.white("Exit"));
  console.log("");
  
  const option = await ask("Select an option: ");
  
  if (option === "0") {
    return false; // Exit
  } else if (option === "1") {
    // Choose device from list
    const result = await chooseDeviceFromList();
    if (result === false) {
      return false; // Exit
    }
    return result; // true = proceed to config menu, null = back to root
  } else if (option === "2") {
    // Add new device
    const result = await addNewDevice();
    if (result === false) {
      return false; // Exit
    }
    return result; // true = proceed to config menu, null = back to root
  } else if (option === "3") {
    // Manage devices
    await manageDevices();
    return null; // Back to root menu
  } else {
    console.log(chalk.red("❌ Invalid option."));
    await ask("Press Enter to continue...");
    return null; // Invalid, show menu again
  }
}

/**
 * Choose device from database list
 */
async function chooseDeviceFromList() {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         CHOOSE DEVICE FROM LIST"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  
  // Get devices from database
  const devices = deviceDB.getAll();
  
  if (devices.length === 0) {
    console.log(chalk.yellow("⚠️  No devices saved in database."));
    console.log(chalk.white("   Please add a device first or enter IP manually."));
    console.log("");
    await ask("Press Enter to continue...");
    return null; // Back to root menu
  }
  
  console.log(chalk.yellow.bold("Saved devices:"));
  devices.forEach((device, idx) => {
      const marker = device.id === currentDeviceId ? chalk.green(" ← Current") : "";
      const deviceName = device.id === currentDeviceId 
        ? chalk.green.bold(device.name)
        : chalk.white(device.name);
      const desc = device.description ? chalk.gray(` - ${device.description}`) : "";
      console.log(chalk.white(`   ${idx + 1} - `) + deviceName + desc + marker);
    if (device.description) {
      console.log(chalk.gray(`       ${device.description}`));
    }
  });
  console.log("");
  console.log(chalk.red("   0 - ") + chalk.white("Back"));
  console.log("");
  
  const option = await ask("Select device: ");
  const optionNum = parseInteger(option, 1);
  
  if (option === "0") {
    return null; // Back to root menu
  } else if (optionNum !== null && optionNum >= 1 && optionNum <= devices.length) {
    // Select from saved devices
    const selectedDevice = devices[optionNum - 1];
    currentDeviceId = selectedDevice.id;
    
    // Note: Session and frame ID are not used for config frames
    
    console.log(chalk.green(`✅ Selected: ${selectedDevice.name}`));
    await ask("Press Enter to continue...");
    return true; // Valid selection, proceed to config menu
  } else {
    console.log(chalk.red("❌ Invalid option."));
    await ask("Press Enter to continue...");
    return null; // Invalid, back to root menu
  }
}

/**
 * Add new device to database
 */
async function addNewDevice() {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         ADD NEW DEVICE"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  
  let name, description;
  
  // Get and validate device name
  while (true) {
    const nameInput = await ask(chalk.yellow("Device name: "));
    name = parseText(nameInput, true, 255);
    if (name) {
      break;
    }
    console.log(chalk.red("❌ Device name is required and must be non-empty (max 255 characters)."));
  }
  
  // Get description (optional)
  const descriptionInput = await ask(chalk.yellow("Description (optional): "));
  description = parseText(descriptionInput, false, 1000);
  
  // Save device
  const deviceId = deviceDB.upsert(name, description);
  currentDeviceId = deviceId;
  console.log(chalk.green(`✅ Device saved: ${name}`));
  await ask("Press Enter to continue...");
  return true; // Proceed to config menu
}

/**
 * Manage devices (update/delete)
 */
async function manageDevices() {
  let option = "";
  
  while (option !== "0") {
    console.clear();
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("         MANAGE DEVICES"));
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log("");
    
    const devices = deviceDB.getAll();
    
    if (devices.length === 0) {
      console.log(chalk.yellow("⚠️  No devices saved in database."));
      console.log("");
      await ask("Press Enter to continue...");
      return;
    }
    
    console.log(chalk.yellow.bold("Saved devices:"));
    devices.forEach((device, idx) => {
      const marker = device.id === currentDeviceId ? chalk.green(" ← Current") : "";
      const deviceName = device.id === currentDeviceId 
        ? chalk.green.bold(device.name)
        : chalk.white(device.name);
      const desc = device.description ? chalk.gray(` - ${device.description}`) : "";
      console.log(chalk.white(`   ${idx + 1} - `) + deviceName + desc + marker);
      if (device.description) {
        console.log(chalk.gray(`       ${device.description}`));
      }
    });
    console.log("");
    console.log(chalk.red("   0 - ") + chalk.white("Back"));
    console.log("");
    
    option = await ask("Select device to manage: ");
    const optionNum = parseInteger(option, 1);
    
    if (option === "0") {
      return; // Back to root menu
    } else if (optionNum >= 1 && optionNum <= devices.length) {
      const selectedDevice = devices[optionNum - 1];
      await manageDeviceDetails(selectedDevice);
    } else {
      console.log(chalk.red("❌ Invalid option."));
      await ask("Press Enter to continue...");
    }
  }
}

/**
 * Manage individual device (update/delete)
 */
async function manageDeviceDetails(device) {
  let option = "";
  
  while (option !== "0") {
    console.clear();
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("         DEVICE DETAILS"));
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log("");
    console.log(chalk.yellow.bold("Device Information:"));
    console.log(chalk.white(`   ID: `) + chalk.gray(device.id));
    console.log(chalk.white(`   Name: `) + chalk.green.bold(device.name));
    if (device.description) {
      console.log(chalk.white(`   Description: `) + chalk.gray(device.description));
    }
    console.log(chalk.white(`   Created: `) + chalk.gray(device.created_at));
    console.log("");
    
    // Count pending configs
    const pendingConfigs = deviceConfigsDB.getPendingByDeviceId(device.id);
    console.log(chalk.yellow(`   Pending Configurations: `) + chalk.white(pendingConfigs.length));
    console.log("");
    
    console.log(chalk.yellow.bold("Actions:"));
    console.log(chalk.yellow("   1 - ") + chalk.white("Update device"));
    console.log(chalk.yellow("   2 - ") + chalk.white("Delete device"));
    console.log("");
    console.log(chalk.red("   0 - ") + chalk.white("Back"));
    console.log("");
    
    option = await ask("Select action: ");
    
    if (option === "0") {
      return; // Back to device list
    } else if (option === "1") {
      await updateDevice(device);
    } else if (option === "2") {
      await deleteDevice(device);
      return; // Exit after deletion
    } else {
      console.log(chalk.red("❌ Invalid option."));
      await ask("Press Enter to continue...");
    }
  }
}

/**
 * Update device information
 */
async function updateDevice(device) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         UPDATE DEVICE"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  
  let finalName, finalDescription;
  
  // Get and validate device name
  while (true) {
    const nameInput = await ask(chalk.yellow(`Device name (current: ${device.name}): `));
    if (!nameInput.trim()) {
      finalName = device.name;
      break;
    }
    finalName = parseText(nameInput, true, 255);
    if (finalName) {
      break;
    }
    console.log(chalk.red("❌ Device name must be non-empty (max 255 characters)."));
  }
  
  // Get description (optional)
  const descriptionInput = await ask(chalk.yellow(`Description (current: ${device.description || "none"}): `));
  finalDescription = parseText(descriptionInput, false, 1000);
  if (!finalDescription) {
    finalDescription = device.description || "";
  }
  
  // Update device
  deviceDB.update(device.id, finalName, finalDescription);
  console.log(chalk.green(`\n✅ Device updated successfully.`));
  
  // Refresh device data from database
  const updatedDevice = deviceDB.getById(device.id);
  if (updatedDevice) {
    // Update the device object with new values
    device.name = updatedDevice.name;
    device.description = updatedDevice.description;
    device.updated_at = updatedDevice.updated_at;
  }
  
  await ask("Press Enter to continue...");
}

/**
 * Delete device
 */
async function deleteDevice(device) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         DELETE DEVICE"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.red.bold("⚠️  WARNING: This will permanently delete:"));
  console.log(chalk.white(`   - Device: ${device.name}`));
  
  // Count pending configs
  const pendingConfigs = deviceConfigsDB.getPendingByDeviceId(device.id);
  if (pendingConfigs.length > 0) {
    console.log(chalk.red(`   - ${pendingConfigs.length} pending configuration(s)`));
  }
  
  // Count history entries
  const history = deviceConfigsDB.getSentByDeviceId(device.id, 1);
  if (history.length > 0) {
    console.log(chalk.yellow(`   - Configuration history (will be deleted)`));
  }
  
  console.log("");
  const confirm = await ask(chalk.red("Type 'DELETE' to confirm: "));
  
  if (confirm === "DELETE") {
    deviceDB.delete(device.id);
    console.log(chalk.green(`\n✅ Device deleted successfully.`));
    
    // Clear current device if it was deleted
    if (device.id === currentDeviceId) {
      currentDeviceId = null;
    }
    
    await ask("Press Enter to continue...");
  } else {
    console.log(chalk.yellow("⚠️  Deletion cancelled."));
    await ask("Press Enter to continue...");
  }
}

/**
 * View pending and sent configurations for current device
 */
async function viewConfigurations() {
  if (!currentDeviceId) {
    console.clear();
    console.log(chalk.red("❌ No device selected. Please select a device first."));
    await ask("Press Enter to continue...");
    return;
  }
  
  const device = deviceDB.getById(currentDeviceId);
  if (!device) {
    console.log(chalk.red("❌ Device not found."));
    await ask("Press Enter to continue...");
    return;
  }
  
  let option = "";
  
  while (option !== "0") {
    console.clear();
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("         CONFIGURATIONS FOR: ") + chalk.green.bold(device.name));
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log("");
    
    // Get pending configs
    const pendingConfigs = deviceConfigsDB.getPendingByDeviceId(currentDeviceId);
    const historyConfigs = deviceConfigsDB.getSentByDeviceId(currentDeviceId, 50);
    
    console.log(chalk.yellow.bold("Pending Configurations: ") + chalk.white(`(${pendingConfigs.length})`));
    if (pendingConfigs.length === 0) {
      console.log(chalk.gray("   No pending configurations"));
    } else {
      pendingConfigs.forEach((config, idx) => {
        console.log(chalk.white(`   ${idx + 1}. `) + chalk.green.bold(config.config_type) + chalk.gray(` (${config.config_code})`));
        console.log(chalk.gray(`      Created: ${config.created_at}`));
        console.log(chalk.gray(`      Value: ${config.config_value.substring(0, 40)}${config.config_value.length > 40 ? '...' : ''}`));
      });
    }
    
    console.log("");
    console.log(chalk.yellow.bold("Sent Configurations (Recent): ") + chalk.white(`(${historyConfigs.length})`));
    if (historyConfigs.length === 0) {
      console.log(chalk.gray("   No sent configurations"));
    } else {
      historyConfigs.slice(0, 10).forEach((config, idx) => {
        const statusIcon = config.response ? chalk.green("✅") : chalk.yellow("⏳");
        console.log(chalk.white(`   ${idx + 1}. `) + statusIcon + " " + chalk.blue(config.config_type) + chalk.gray(` (${config.config_code})`));
        console.log(chalk.gray(`      Sent: ${config.sent_at || config.created_at}`));
      });
      if (historyConfigs.length > 10) {
        console.log(chalk.gray(`   ... and ${historyConfigs.length - 10} more`));
      }
    }
    
    console.log("");
    if (pendingConfigs.length > 0) {
      console.log(chalk.yellow.bold("Actions:"));
      console.log(chalk.yellow("   1 - ") + chalk.white("Manage pending configuration"));
      console.log(chalk.yellow("   2 - ") + chalk.white("Delete all pending configurations"));
      console.log("");
    }
    console.log(chalk.red("   0 - ") + chalk.white("Back"));
    console.log("");
    
    option = await ask("Select an option: ");
    
    if (option === "0") {
      return; // Back to configuration menu
    } else if (option === "1" && pendingConfigs.length > 0) {
      await managePendingConfig(pendingConfigs);
    } else if (option === "2" && pendingConfigs.length > 0) {
      await deleteAllPendingConfigs(pendingConfigs);
    } else {
      console.log(chalk.red("❌ Invalid option or no pending configurations."));
      await ask("Press Enter to continue...");
    }
  }
}

/**
 * Manage individual pending configuration
 */
async function managePendingConfig(pendingConfigs) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         MANAGE PENDING CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  
  console.log(chalk.yellow.bold("Select configuration to manage:"));
  pendingConfigs.forEach((config, idx) => {
    console.log(chalk.white(`   ${idx + 1}. `) + chalk.green.bold(config.config_type) + chalk.gray(` (${config.config_code})`));
    console.log(chalk.gray(`      Created: ${config.created_at}`));
    console.log(chalk.gray(`      Value: ${config.config_value.substring(0, 60)}${config.config_value.length > 60 ? '...' : ''}`));
  });
  console.log("");
  console.log(chalk.red("   0 - ") + chalk.white("Back"));
  console.log("");
  
  const option = await ask("Select configuration: ");
  const optionNum = parseInteger(option, 1);
  
  if (option === "0") {
    return;
  } else if (optionNum >= 1 && optionNum <= pendingConfigs.length) {
    const selectedConfig = pendingConfigs[optionNum - 1];
    await managePendingConfigDetails(selectedConfig);
  } else {
    console.log(chalk.red("❌ Invalid option."));
    await ask("Press Enter to continue...");
  }
}

/**
 * Manage pending configuration details (update/delete)
 */
async function managePendingConfigDetails(config) {
  let option = "";
  
  while (option !== "0") {
    console.clear();
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("         CONFIGURATION DETAILS"));
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log("");
    console.log(chalk.yellow.bold("Configuration Information:"));
    console.log(chalk.white(`   ID: `) + chalk.gray(config.id));
    console.log(chalk.white(`   Type: `) + chalk.green.bold(config.config_type));
    console.log(chalk.white(`   Code: `) + chalk.blue(config.config_code));
    console.log(chalk.white(`   Status: `) + chalk.yellow(config.status));
    console.log(chalk.white(`   Created: `) + chalk.gray(config.created_at));
    console.log(chalk.white(`   Value: `) + chalk.gray(config.config_value));
    console.log(chalk.white(`   Frame: `) + chalk.gray(config.frame_hex.substring(0, 80) + (config.frame_hex.length > 80 ? '...' : '')));
    console.log("");
    
    console.log(chalk.yellow.bold("Actions:"));
    console.log(chalk.yellow("   1 - ") + chalk.white("Update configuration value"));
    console.log(chalk.yellow("   2 - ") + chalk.white("Delete configuration"));
    console.log("");
    console.log(chalk.red("   0 - ") + chalk.white("Back"));
    console.log("");
    
    option = await ask("Select action: ");
    
    if (option === "0") {
      return;
    } else if (option === "1") {
      await updatePendingConfig(config);
      return; // Exit after update
    } else if (option === "2") {
      await deletePendingConfig(config);
      return; // Exit after delete
    } else {
      console.log(chalk.red("❌ Invalid option."));
      await ask("Press Enter to continue...");
    }
  }
}

/**
 * Update pending configuration value
 */
async function updatePendingConfig(config) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         UPDATE CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow.bold("Current Configuration:"));
  console.log(chalk.white(`   Type: ${config.config_type} (${config.config_code})`));
  console.log(chalk.white(`   Current Value: ${config.config_value}`));
  console.log("");
  
  // If this is a transmission windows config, show existing windows
  if (config.config_code === tConst.CODE_C_SEND) {
    const existingWindows = transmissionWindowsDB.getByDeviceConfigId(config.id);
    if (existingWindows && existingWindows.length > 0) {
      console.log(chalk.yellow.bold("Current Transmission Windows:"));
      existingWindows.forEach((window) => {
        const startHours = Math.floor(window.start_time_minutes / 60);
        const startMins = window.start_time_minutes % 60;
        const endHours = Math.floor(window.end_time_minutes / 60);
        const endMins = window.end_time_minutes % 60;
        const status = window.enabled ? chalk.green("enabled") : chalk.red("disabled");
        console.log(chalk.white(`   Window ${window.window_number}: `) + 
                   chalk.blue(`${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')} - ${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')} UTC`) +
                   chalk.gray(` | Sampling: ${window.sampling_interval_minutes} min | `) + status);
      });
      console.log("");
    } else {
      console.log(chalk.gray("   No transmission windows configured yet."));
      console.log("");
    }
  }
  
  // Find the config option to get prompts
  const configOption = configOptions.find(opt => opt.code === config.config_code);
  
  if (configOption) {
    console.log(chalk.cyan(`\n=== ${configOption.name} ===`));
    
    // If this is transmission windows, pass existing windows to the configuration function
    let newValueHex;
    if (config.config_code === tConst.CODE_C_SEND) {
      const existingWindows = transmissionWindowsDB.getByDeviceConfigId(config.id);
      newValueHex = await configureTransmissionWindows(existingWindows);
    } else {
      newValueHex = await getConfigParameters(config.config_code);
    }
    
    if (!newValueHex || newValueHex.length === 0) {
      console.log(chalk.red("❌ No value provided. Cancelled."));
      await ask("Press Enter to continue...");
      return;
    }
    
    // Rebuild frame with new value
    const newFrame = buildConfigFrame(config.config_code, newValueHex);
    
    console.log(chalk.blue(`\n📦 New frame: `) + chalk.gray(newFrame.substring(0, 80) + '...'));
    
    const confirm = await ask(chalk.yellow("\n❓ Update this configuration? (y/n): "));
    if (confirm.toLowerCase() === "y" || confirm.toLowerCase() === "yes") {
      // Update in database
      deviceConfigsDB.update(config.id, newValueHex, newFrame);
      
      // If this is a transmission windows config, also update the windows in transmission_windows table
      if (config.config_code === tConst.CODE_C_SEND && global.transmissionWindowsData && global.transmissionWindowsData.pending) {
        const windows = global.transmissionWindowsData.pending;
        
        // Delete existing windows for this config
        transmissionWindowsDB.deleteByDeviceConfigId(config.id);
        
        // Insert new windows
        for (const window of windows) {
          transmissionWindowsDB.upsert({
            deviceConfigId: config.id,
            windowNumber: window.windowNumber,
            startTimeMinutes: window.startTimeMinutes,
            endTimeMinutes: window.endTimeMinutes,
            samplingIntervalMinutes: window.samplingIntervalMinutes,
            enabled: window.enabled
          });
        }
        
        // Clear the pending windows data
        delete global.transmissionWindowsData.pending;
        console.log(chalk.green(`   ${windows.length} transmission window(s) updated in database.`));
      }
      
      console.log(chalk.green("\n✅ Configuration updated successfully."));
    } else {
      // Clear pending windows data if cancelled
      if (global.transmissionWindowsData && global.transmissionWindowsData.pending) {
        delete global.transmissionWindowsData.pending;
      }
      console.log(chalk.yellow("⚠️  Cancelled."));
    }
  } else {
    // Fallback for unknown config types
    let newValueHex;
    while (true) {
      const hexInput = await ask(chalk.yellow("Enter new configuration value (hex): "));
      if (isValidHex(hexInput)) {
        newValueHex = hexInput.trim().toLowerCase();
        break;
      }
      console.log(chalk.red("❌ Invalid hex format. Please enter hexadecimal characters only (0-9, a-f)."));
    }
    
    const newFrame = buildConfigFrame(config.config_code, newValueHex);
    const confirm = await ask(chalk.yellow("\n❓ Update this configuration? (y/n): "));
    if (confirm.toLowerCase() === "y" || confirm.toLowerCase() === "yes") {
      deviceConfigsDB.update(config.id, newValueHex, newFrame);
      console.log(chalk.green("\n✅ Configuration updated successfully."));
    }
  }
  
  await ask("Press Enter to continue...");
}

/**
 * Delete pending configuration
 */
async function deletePendingConfig(config) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         DELETE CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.red.bold("⚠️  WARNING: This will delete:"));
  console.log(chalk.white(`   - Configuration: ${config.config_type} (${config.config_code})`));
  console.log(chalk.white(`   - Created: ${config.created_at}`));
  console.log("");
  
  const confirm = await ask(chalk.red("Type 'DELETE' to confirm: "));
  
  if (confirm === "DELETE") {
    deviceConfigsDB.delete(config.id);
    console.log(chalk.green(`\n✅ Configuration deleted successfully.`));
  } else {
    console.log(chalk.yellow("⚠️  Deletion cancelled."));
  }
  
  await ask("Press Enter to continue...");
}

/**
 * Delete all pending configurations
 */
async function deleteAllPendingConfigs(pendingConfigs) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         DELETE ALL PENDING CONFIGURATIONS"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.red.bold("⚠️  WARNING: This will delete ALL pending configurations:"));
  console.log(chalk.white(`   - Count: ${pendingConfigs.length} configuration(s)`));
  pendingConfigs.forEach((config, idx) => {
    console.log(chalk.gray(`   ${idx + 1}. ${config.config_type} (${config.config_code})`));
  });
  console.log("");
  
  const confirm = await ask(chalk.red("Type 'DELETE ALL' to confirm: "));
  
  if (confirm === "DELETE ALL") {
    deviceConfigsDB.deletePendingByDeviceId(currentDeviceId);
    console.log(chalk.green(`\n✅ All pending configurations deleted successfully.`));
  } else {
    console.log(chalk.yellow("⚠️  Deletion cancelled."));
  }
  
  await ask("Press Enter to continue...");
}

/**
 * Second level menu: Configuration options
 */
async function showConfigurationMenu() {
  let option = "";

  while (option !== "0") {
    console.clear();
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log(chalk.cyan.bold("         DEVICE CONFIGURATION MENU"));
    console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
    console.log("");
    console.log(chalk.yellow.bold("Device State:"));
    if (currentDeviceId) {
      const device = deviceDB.getById(currentDeviceId);
      if (device) {
        console.log(chalk.white(`   Device Name: `) + chalk.green.bold(device.name));
        if (device.description) {
          console.log(chalk.white(`   Description: `) + chalk.gray(device.description));
        }
      }
    }
    console.log("");
    console.log(chalk.yellow.bold("Configuration Options:"));
    configOptions.forEach((opt, idx) => {
      const optionNum = (idx + 1).toString().padStart(2);
      console.log(chalk.yellow(`   ${optionNum} - `) + chalk.white.bold(opt.name) + chalk.gray(` (${opt.code})`));
      console.log(chalk.gray(`       ${opt.description}`));
    });
    console.log("");
    console.log(chalk.yellow.bold("Settings:"));
    console.log(chalk.yellow(`   ${configOptions.length + 1} - `) + chalk.white("Change device"));
    console.log(chalk.yellow(`   ${configOptions.length + 2} - `) + chalk.white("View pending/sent configurations"));
    console.log("");
    console.log(chalk.red("   0 - ") + chalk.white("Back to main menu"));
    console.log("");
    
    option = await ask("Select an option: ");

    const optionNum = parseInteger(option, 1);
    
    if (option === "0") {
      return true; // Go back to root menu
    } else if (optionNum >= 1 && optionNum <= configOptions.length) {
      const selectedConfig = configOptions[optionNum - 1];
      console.clear();
      console.log(chalk.cyan.bold(`Selected: ${selectedConfig.name}`));
      
      try {
        const valueHex = await getConfigParameters(selectedConfig.code);
        
        if (!valueHex || valueHex.length === 0) {
          console.log(chalk.red("❌ No value provided. Cancelled."));
          await ask("Press Enter to continue...");
          continue;
        }
        
        // Build config frame
        const frame = buildConfigFrame(selectedConfig.code, valueHex);
        console.log(chalk.blue(`\n📦 Generated frame: `) + chalk.gray(frame));
        console.log(chalk.blue(`📏 Frame length: `) + chalk.white(`${frame.length / 2} bytes`));
        
        if (!currentDeviceId) {
          console.log(chalk.red("\n❌ Cannot save configuration: No device selected from database."));
          console.log(chalk.yellow("   Please select a device from the list or add a new device."));
          await ask("\nPress Enter to continue...");
          continue;
        }
        
        const confirm = await ask(chalk.yellow("\n❓ Save this configuration to be sent when device connects? (y/n): "));
        if (confirm.toLowerCase() === "y" || confirm.toLowerCase() === "yes") {
          // Store in pending configurations
          const deviceConfigId = deviceConfigsDB.add(
            currentDeviceId,
            selectedConfig.name,
            selectedConfig.code,
            valueHex,
            frame
          );
          
          // If this is a transmission windows config, also insert the windows into transmission_windows table
          if (selectedConfig.code === tConst.CODE_C_SEND && global.transmissionWindowsData && global.transmissionWindowsData.pending) {
            const windows = global.transmissionWindowsData.pending;
            for (const window of windows) {
              transmissionWindowsDB.upsert({
                deviceConfigId: deviceConfigId,
                windowNumber: window.windowNumber,
                startTimeMinutes: window.startTimeMinutes,
                endTimeMinutes: window.endTimeMinutes,
                samplingIntervalMinutes: window.samplingIntervalMinutes,
                enabled: window.enabled
              });
            }
            // Clear the pending windows data
            delete global.transmissionWindowsData.pending;
            console.log(chalk.green(`   ${windows.length} transmission window(s) saved to database.`));
          }
          
          console.log(chalk.green("\n✅ Configuration saved to database."));
          console.log(chalk.blue("   It will be sent when the device connects to the server."));
        } else {
          // Clear pending windows data if cancelled
          if (global.transmissionWindowsData && global.transmissionWindowsData.pending) {
            delete global.transmissionWindowsData.pending;
          }
          console.log(chalk.yellow("⚠️  Cancelled."));
        }
        
        await ask("\nPress Enter to continue...");
      } catch (error) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        await ask("Press Enter to continue...");
      }
    } else if (optionNum === configOptions.length + 1) {
      // Change device - go back to root menu
      return true; // Go back to root menu to choose different device
    } else if (optionNum === configOptions.length + 2) {
      // View pending/sent configurations
      await viewConfigurations();
    } else {
      console.log(chalk.red("❌ Invalid option."));
      await ask("Press Enter to continue...");
    }
  }
  
  return true; // Go back to IP selection
}

// Handle process termination signals for clean exit
process.on('SIGINT', () => {
  closeReadline();
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeReadline();
  closeDatabase();
  process.exit(0);
});

// Main menu loop
(async () => {
  try {
    while (true) {
      const rootResult = await showRootMenu();
      
      if (rootResult === false) {
        // Exit
        break;
      } else if (rootResult === true) {
        // Device selected, show configuration menu
        const goBack = await showConfigurationMenu();
        if (goBack === false) {
          // Exit from configuration menu
          break;
        }
        // If goBack === true, loop back to root menu
      }
      // If rootResult === null, loop again to show root menu
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
  } finally {
    // Cleanup on exit
    closeReadline();
    closeDatabase();
    console.log(chalk.cyan("👋 Goodbye!"));
    // Explicitly exit the process to prevent hanging in GitLab CI
    process.exit(0);
  }
})();

