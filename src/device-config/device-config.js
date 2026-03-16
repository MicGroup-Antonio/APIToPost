import { calcularCRC, buildTrama } from "../tst.js";
import * as tConst from "../const.js";
import readline from "readline";
import { initDatabase, closeDatabase, getDatabase, deviceDB, deviceConfigsDB, transmissionWindowsDB, readingWindowsDB, authorizationParametersDB, networkParametersDB } from "./db.js";
import { configureReadingWindows } from "./messages/reading-windows.js";
import { configureTransmissionWindows } from "./messages/transmission-windows.js";
import { configureAuthorization } from "./messages/authorization.js";
import { configureTemporaryMaxConnectionTime } from "./messages/temporary-max-connection-time.js";
import { configureWmbusReadingTime } from "./messages/wmbus-reading-time.js";
import { configureNetwork } from "./messages/network-config.js";
import { configureRemoteServerParameters } from "./messages/remote-server.js";
import { formatMinutesForDisplay, formatMinutes } from "./utils/time-parser.js";
import { numberToLittleEndianHex } from "./utils/hex-converter.js";
import { parseInteger, parseBoolean, parseText, parsePort, isValidHex, stringToHexPadded } from "./utils/input-parser.js";
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
      return await configureNetwork(ask);
      
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
      return await configureTransmissionWindows(ask);
      
    case tConst.CODE_C_RECV:
      return await configureReadingWindows(ask);
      
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
      return await configureAuthorization(ask);
      
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
      return await configureRemoteServerParameters(ask);
      
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
      return await configureTemporaryMaxConnectionTime(ask);
      
    case tConst.CODE_C_WMBUS:
      return await configureWmbusReadingTime(ask);
      
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
 * Parse configuration value and return human-readable parameters
 * @param {string} configCode - Configuration code
 * @param {string} configValue - Hex value string
 * @param {number} configId - Configuration ID (for database lookups)
 * @returns {Object} Parsed parameters object
 */
function parseConfigParameters(configCode, configValue, configId) {
  const params = {
    type: configCode,
    raw: configValue,
    parsed: {}
  };

  try {
    switch (configCode) {
      case tConst.CODE_C_SEND:
        // Transmission Windows - get from database
        const transmissionWindows = transmissionWindowsDB.getByDeviceConfigId(configId);
        if (transmissionWindows && transmissionWindows.length > 0) {
          params.parsed.windows = transmissionWindows.map(w => ({
            number: w.window_number,
            startTime: formatMinutesForDisplay(w.start_time_minutes),
            endTime: formatMinutesForDisplay(w.end_time_minutes),
            samplingInterval: w.sampling_interval_minutes,
            enabled: w.enabled === 1
          }));
        }
        break;

      case tConst.CODE_C_RECV:
        // Reading Windows - get from database
        const readingWindows = readingWindowsDB.getByDeviceConfigId(configId);
        if (readingWindows && readingWindows.length > 0) {
          params.parsed.windows = readingWindows.map(w => ({
            number: w.window_number,
            startTime: formatMinutesForDisplay(w.start_time_minutes),
            endTime: formatMinutesForDisplay(w.end_time_minutes),
            samplingInterval: w.sampling_interval_minutes,
            enabled: w.enabled === 1
          }));
        }
        break;

      case tConst.CODE_C_SERV:
        // Server Parameters: host (64 bytes) + port (2 bytes LE)
        if (configValue.length >= 132) { // 64*2 + 2*2 = 132 hex chars
          const hostHex = configValue.substring(0, 128); // 64 bytes = 128 hex chars
          const portHex = configValue.substring(128, 132); // 2 bytes = 4 hex chars
          
          // Convert hex to string (remove null bytes)
          let host = "";
          for (let i = 0; i < 128; i += 2) {
            const byte = parseInt(hostHex.substring(i, i + 2), 16);
            if (byte === 0) break;
            host += String.fromCharCode(byte);
          }
          
          // Convert port from little-endian
          const port = parseInt(portHex.substring(2, 4) + portHex.substring(0, 2), 16);
          
          params.parsed.host = host;
          params.parsed.port = port;
        }
        break;

      case tConst.CODE_C_RSER:
        // Remote Server Parameters: 50 IP + 1 reserved + 2 port LE + 1 mode + 40 PSK_ID + 1 reserved + 64 PSK_Content + 1 reserved = 160 bytes
        if (configValue.length >= 320) {
          let ip = "";
          for (let i = 0; i < 100; i += 2) {
            const byte = parseInt(configValue.substring(i, i + 2), 16);
            if (byte === 0) break;
            ip += String.fromCharCode(byte);
          }
          const portHex = configValue.substring(102, 106);
          const port = parseInt(portHex.substring(2, 4) + portHex.substring(0, 2), 16);
          const mode = parseInt(configValue.substring(106, 108), 16);
          let pskId = "";
          for (let i = 108; i < 188; i += 2) {
            const byte = parseInt(configValue.substring(i, i + 2), 16);
            if (byte === 0) break;
            pskId += String.fromCharCode(byte);
          }
          let pskContent = "";
          for (let i = 190; i < 318; i += 2) {
            const byte = parseInt(configValue.substring(i, i + 2), 16);
            if (byte === 0) break;
            pskContent += String.fromCharCode(byte);
          }
          params.parsed.ip = ip;
          params.parsed.port = port;
          params.parsed.mode = mode;
          params.parsed.pskId = pskId;
          params.parsed.pskContent = pskContent;
        }
        break;

      case tConst.CODE_C_AUTH:
        // Authorization: get from database
        const authParams = authorizationParametersDB.getByDeviceConfigId(configId);
        if (authParams) {
          params.parsed.username = authParams.username;
          params.parsed.password = authParams.password ? "***" : ""; // Hide password
        }
        break;

      case tConst.CODE_C_MAGN:
        // Magnet: "01" = enabled, "00" = disabled
        params.parsed.enabled = configValue === "01";
        break;

      case tConst.CODE_C_NTP:
        // NTP Server: server address (64 bytes)
        if (configValue.length >= 128) { // 64 bytes = 128 hex chars
          let server = "";
          for (let i = 0; i < 128; i += 2) {
            const byte = parseInt(configValue.substring(i, i + 2), 16);
            if (byte === 0) break;
            server += String.fromCharCode(byte);
          }
          params.parsed.server = server;
        }
        break;

      case tConst.CODE_C_TMAX:
        // Max Connection Time: seconds (4 bytes LE)
        if (configValue.length >= 8) {
          const seconds = parseInt(
            configValue.substring(6, 8) + configValue.substring(4, 6) + 
            configValue.substring(2, 4) + configValue.substring(0, 2), 
            16
          );
          params.parsed.seconds = seconds;
          params.parsed.formatted = `${seconds} seconds (${Math.floor(seconds / 60)} min ${seconds % 60} sec)`;
        }
        break;

      case tConst.CODE_C_TTMAX:
        // Temporary Max Connection Time: single byte hex (minutes)
        // Example: 0x14 = 20 minutes
        if (configValue.length >= 2) {
          const minutes = parseInt(configValue.substring(0, 2), 16);
          params.parsed.minutes = minutes;
          params.parsed.formatted = `${minutes} minutes (${formatMinutes(minutes)})`;
        }
        break;

      case tConst.CODE_C_WMBUS:
        // WMBUS Reading Time
        // Format 1: 1 byte (0-255 minutes) - e.g., "05" = 5 minutes
        // Format 2: 2 bytes little-endian (0-65535 minutes) - e.g., "9001" = 400 minutes
        // Also supports legacy format: 0200 prefix + 2 bytes little-endian (for backward compatibility)
        if (configValue.length >= 2) {
          // Check for legacy format with 0200 prefix (backward compatibility)
          if (configValue.length >= 6 && configValue.substring(0, 4) === "0200") {
            // Legacy: 0200 prefix + 2 bytes little-endian
            const lowByte = configValue.substring(4, 6);
            const highByte = configValue.substring(6, 8);
            const minutes = parseInt(highByte + lowByte, 16);
            params.parsed.minutes = minutes;
            params.parsed.formatted = `${minutes} minutes (${formatMinutes(minutes)}) [legacy format]`;
          } else if (configValue.length === 2) {
            // Format 1: 1 byte (e.g., "05" = 5 minutes)
            const minutes = parseInt(configValue, 16);
            params.parsed.minutes = minutes;
            params.parsed.formatted = `${minutes} minutes (${formatMinutes(minutes)})`;
          } else if (configValue.length >= 4) {
            // Format 2: 2 bytes little-endian (e.g., "9001" = 400 minutes)
            const lowByte = configValue.substring(0, 2);
            const highByte = configValue.substring(2, 4);
            const minutes = parseInt(highByte + lowByte, 16);
            params.parsed.minutes = minutes;
            params.parsed.formatted = `${minutes} minutes (${formatMinutes(minutes)})`;
          }
        }
        break;

      default:
        // For other types, just show hex value
        params.parsed.hex = configValue;
        break;
    }
  } catch (error) {
    // If parsing fails, just show raw value
    params.parsed.error = "Failed to parse parameters";
    params.parsed.hex = configValue;
  }

  return params;
}

/**
 * Display parsed configuration parameters in a human-readable format
 * @param {Object} params - Parsed parameters from parseConfigParameters
 */
function displayConfigParameters(params) {
  console.log(chalk.yellow.bold("Configuration Parameters:"));
  
  if (Object.keys(params.parsed).length === 0) {
    console.log(chalk.gray("   No parameters to display"));
    return;
  }

  switch (params.type) {
    case tConst.CODE_C_SEND:
      if (params.parsed.windows && params.parsed.windows.length > 0) {
        params.parsed.windows.forEach((window) => {
          const status = window.enabled ? chalk.green("enabled") : chalk.red("disabled");
          console.log(chalk.white(`   Window ${window.number}: `) + 
                     chalk.blue(`${window.startTime} - ${window.endTime} UTC`) +
                     chalk.gray(` | Sampling: ${window.samplingInterval} min | `) + status);
        });
      } else {
        console.log(chalk.gray("   No transmission windows configured"));
      }
      break;

    case tConst.CODE_C_RECV:
      if (params.parsed.windows && params.parsed.windows.length > 0) {
        params.parsed.windows.forEach((window) => {
          const status = window.enabled ? chalk.green("enabled") : chalk.red("disabled");
          console.log(chalk.white(`   Window ${window.number}: `) + 
                     chalk.blue(`${window.startTime} - ${window.endTime} UTC`) +
                     chalk.gray(` | Sampling: ${window.samplingInterval} min | `) + status);
        });
      } else {
        console.log(chalk.gray("   No reading windows configured"));
      }
      break;

    case tConst.CODE_C_SERV:
      if (params.parsed.host) {
        console.log(chalk.white(`   Server Host: `) + chalk.blue(params.parsed.host));
      }
      if (params.parsed.port !== undefined) {
        console.log(chalk.white(`   Server Port: `) + chalk.blue(params.parsed.port));
      }
      break;

    case tConst.CODE_C_RSER:
      if (params.parsed.ip !== undefined) {
        console.log(chalk.white(`   IP: `) + chalk.blue(params.parsed.ip));
      }
      if (params.parsed.port !== undefined) {
        console.log(chalk.white(`   Port: `) + chalk.blue(params.parsed.port));
      }
      if (params.parsed.mode !== undefined) {
        const modeNames = { 0: "UDO", 1: "UDP-DTLS", 2: "LwM2M" };
        console.log(chalk.white(`   Mode: `) + chalk.blue(`${params.parsed.mode} (${modeNames[params.parsed.mode] ?? "?"})`));
      }
      if (params.parsed.pskId !== undefined) {
        console.log(chalk.white(`   PSK_ID: `) + chalk.gray(params.parsed.pskId ? "(set)" : "(empty)"));
      }
      if (params.parsed.pskContent !== undefined) {
        console.log(chalk.white(`   PSK_Content: `) + chalk.gray(params.parsed.pskContent ? "(set)" : "(empty)"));
      }
      break;

    case tConst.CODE_C_AUTH:
      if (params.parsed.username) {
        console.log(chalk.white(`   Username: `) + chalk.blue(params.parsed.username));
      }
      if (params.parsed.password !== undefined) {
        console.log(chalk.white(`   Password: `) + chalk.gray(params.parsed.password || "(empty)"));
      }
      break;

    case tConst.CODE_C_MAGN:
      const magnStatus = params.parsed.enabled ? chalk.green("Enabled") : chalk.red("Disabled");
      console.log(chalk.white(`   Magnet: `) + magnStatus);
      break;

    case tConst.CODE_C_NTP:
      if (params.parsed.server) {
        console.log(chalk.white(`   NTP Server: `) + chalk.blue(params.parsed.server));
      }
      break;

    case tConst.CODE_C_TMAX:
      if (params.parsed.formatted) {
        console.log(chalk.white(`   Time: `) + chalk.blue(params.parsed.formatted));
      } else if (params.parsed.seconds !== undefined) {
        console.log(chalk.white(`   Seconds: `) + chalk.blue(params.parsed.seconds));
      }
      break;

    case tConst.CODE_C_TTMAX:
      if (params.parsed.formatted) {
        console.log(chalk.white(`   Time: `) + chalk.blue(params.parsed.formatted));
      } else if (params.parsed.minutes !== undefined) {
        console.log(chalk.white(`   Minutes: `) + chalk.blue(params.parsed.minutes));
      }
      break;

    case tConst.CODE_C_WMBUS:
      if (params.parsed.formatted) {
        console.log(chalk.white(`   Time: `) + chalk.blue(params.parsed.formatted));
      } else if (params.parsed.minutes !== undefined) {
        console.log(chalk.white(`   Minutes: `) + chalk.blue(params.parsed.minutes));
      }
      break;

    default:
      if (params.parsed.hex) {
        console.log(chalk.white(`   Hex Value: `) + chalk.gray(params.parsed.hex.substring(0, 80) + (params.parsed.hex.length > 80 ? '...' : '')));
      }
      break;
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
    console.log("");
    
    // Parse and display configuration parameters
    const parsedParams = parseConfigParameters(config.config_code, config.config_value, config.id);
    displayConfigParameters(parsedParams);
    console.log("");
    
    console.log(chalk.yellow.bold("Raw Data:"));
    console.log(chalk.white(`   Value (hex): `) + chalk.gray(config.config_value.substring(0, 80) + (config.config_value.length > 80 ? '...' : '')));
    console.log(chalk.white(`   Frame (hex): `) + chalk.gray(config.frame_hex.substring(0, 80) + (config.frame_hex.length > 80 ? '...' : '')));
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
        const startTime = formatMinutesForDisplay(window.start_time_minutes);
        const endTime = formatMinutesForDisplay(window.end_time_minutes);
        const status = window.enabled === 1 ? chalk.green("enabled") : chalk.red("disabled");
        console.log(chalk.white(`   Window ${window.window_number}: `) + 
                   chalk.blue(`${startTime} - ${endTime} UTC`) +
                   chalk.gray(` | Sampling: ${window.sampling_interval_minutes} min | `) + status);
      });
      console.log("");
    } else {
      console.log(chalk.gray("   No transmission windows configured yet."));
      console.log("");
    }
  }
  
  // If this is a reading windows config, show existing windows
  if (config.config_code === tConst.CODE_C_RECV) {
    const existingWindows = readingWindowsDB.getByDeviceConfigId(config.id);
    if (existingWindows && existingWindows.length > 0) {
      console.log(chalk.yellow.bold("Current Reading Windows:"));
      existingWindows.forEach((window) => {
        const startTime = formatMinutesForDisplay(window.start_time_minutes);
        const endTime = formatMinutesForDisplay(window.end_time_minutes);
        const status = window.enabled === 1 ? chalk.green("enabled") : chalk.red("disabled");
        console.log(chalk.white(`   Window ${window.window_number}: `) + 
                   chalk.blue(`${startTime} - ${endTime} UTC`) +
                   chalk.gray(` | Sampling: ${window.sampling_interval_minutes} min | `) + status);
      });
      console.log("");
    } else {
      console.log(chalk.gray("   No reading windows configured yet."));
      console.log("");
    }
  }
  
  // If this is an authorization config, show existing parameters
  if (config.config_code === tConst.CODE_C_AUTH) {
    const existingParams = authorizationParametersDB.getByDeviceConfigId(config.id);
    if (existingParams) {
      console.log(chalk.yellow.bold("Current Authorization Parameters:"));
      console.log(chalk.white(`   Username: `) + chalk.blue(existingParams.username || "(empty)"));
      console.log(chalk.white(`   Password: `) + chalk.gray(existingParams.password ? "***" : "(empty)"));
      console.log("");
    } else {
      console.log(chalk.gray("   No authorization parameters configured yet."));
      console.log("");
    }
  }
  
  // If this is a network config, show existing parameters
  if (config.config_code === tConst.CODE_C_WEV) {
    const existingParams = networkParametersDB.getByDeviceConfigId(config.id);
    if (existingParams) {
      console.log(chalk.yellow.bold("Current Network Parameters:"));
      console.log(chalk.white(`   Final Operator: `) + chalk.blue(existingParams.final_operator || "(empty)"));
      console.log(chalk.white(`   Final APN: `) + chalk.blue(existingParams.final_apn || "(empty)"));
      console.log(chalk.white(`   User: `) + chalk.blue(existingParams.user || "(empty)"));
      console.log(chalk.white(`   Password: `) + chalk.gray(existingParams.password ? "***" : "(empty)"));
      console.log(chalk.white(`   eSIM Reconfigure: `) + chalk.blue(existingParams.eSIM ? "Yes" : "No"));
      if (existingParams.eSIM) {
        console.log(chalk.white(`   Intermediate Operator: `) + chalk.blue(existingParams.intermediate_operator || "(empty)"));
        console.log(chalk.white(`   Intermediate APN: `) + chalk.blue(existingParams.intermediate_apn || "(empty)"));
        console.log(chalk.white(`   Intermediate User: `) + chalk.blue(existingParams.intermediate_user || "(empty)"));
        console.log(chalk.white(`   Intermediate Password: `) + chalk.gray(existingParams.intermediate_password ? "***" : "(empty)"));
      }
      console.log("");
    } else {
      console.log(chalk.gray("   No network parameters configured yet."));
      console.log("");
    }
  }
  
  // Find the config option to get prompts
  const configOption = configOptions.find(opt => opt.code === config.config_code);
  
  if (configOption) {
    console.log(chalk.cyan(`\n=== ${configOption.name} ===`));
    
    // If this is transmission windows, reading windows, authorization, or network config, pass existing data to the configuration function
    let newValueHex;
    if (config.config_code === tConst.CODE_C_SEND) {
      const existingWindows = transmissionWindowsDB.getByDeviceConfigId(config.id);
      newValueHex = await configureTransmissionWindows(ask, existingWindows);
    } else if (config.config_code === tConst.CODE_C_RECV) {
      const existingWindows = readingWindowsDB.getByDeviceConfigId(config.id);
      newValueHex = await configureReadingWindows(ask, existingWindows);
    } else if (config.config_code === tConst.CODE_C_AUTH) {
      const existingParams = authorizationParametersDB.getByDeviceConfigId(config.id);
      newValueHex = await configureAuthorization(ask, existingParams);
    } else if (config.config_code === tConst.CODE_C_WEV) {
      const existingParams = networkParametersDB.getByDeviceConfigId(config.id);
      // Convert database format to function format
      const existingConfig = existingParams ? {
        finalOperator: existingParams.final_operator,
        finalAPN: existingParams.final_apn,
        user: existingParams.user,
        password: existingParams.password,
        eSIM: existingParams.eSIM,
        intermediateOperator: existingParams.intermediate_operator,
        intermediateAPN: existingParams.intermediate_apn,
        intermediateUser: existingParams.intermediate_user,
        intermediatePassword: existingParams.intermediate_password
      } : null;
      newValueHex = await configureNetwork(ask, existingConfig);
    } else if (config.config_code === tConst.CODE_C_RSER) {
      // Parse existing value from config_value (160 bytes: IP 50 + reserved + port 2 LE + mode 1 + PSK_ID 40 + reserved + PSK_Content 64 + reserved)
      let existingParams = null;
      if (config.config_value && config.config_value.length >= 320) {
        let ip = "";
        for (let i = 0; i < 100; i += 2) {
          const byte = parseInt(config.config_value.substring(i, i + 2), 16);
          if (byte === 0) break;
          ip += String.fromCharCode(byte);
        }
        const portHex = config.config_value.substring(102, 106);
        const port = parseInt(portHex.substring(2, 4) + portHex.substring(0, 2), 16);
        const mode = parseInt(config.config_value.substring(106, 108), 16);
        let pskId = "";
        for (let i = 108; i < 188; i += 2) {
          const byte = parseInt(config.config_value.substring(i, i + 2), 16);
          if (byte === 0) break;
          pskId += String.fromCharCode(byte);
        }
        let pskContent = "";
        for (let i = 190; i < 318; i += 2) {
          const byte = parseInt(config.config_value.substring(i, i + 2), 16);
          if (byte === 0) break;
          pskContent += String.fromCharCode(byte);
        }
        existingParams = { ip, port, mode, pskId, pskContent };
      }
      newValueHex = await configureRemoteServerParameters(ask, existingParams);
    } else if (config.config_code === tConst.CODE_C_TTMAX) {
      // Parse existing value from config_value (single byte hex, minutes)
      let existingValue = null;
      if (config.config_value && config.config_value.length >= 2) {
        existingValue = parseInt(config.config_value.substring(0, 2), 16);
      }
      newValueHex = await configureTemporaryMaxConnectionTime(ask, existingValue);
    } else if (config.config_code === tConst.CODE_C_WMBUS) {
      // Parse existing value from config_value
      // Supports: 1-byte, 2-byte little-endian, and legacy 0200 prefix format
      let existingValue = null;
      if (config.config_value) {
        // Legacy format: 0200 prefix + 2 bytes little-endian
        if (config.config_value.length >= 6 && config.config_value.substring(0, 4) === "0200") {
          const lowByte = config.config_value.substring(4, 6);
          const highByte = config.config_value.substring(6, 8);
          existingValue = parseInt(highByte + lowByte, 16);
        } else if (config.config_value.length === 2) {
          // 1-byte format (e.g., "05" = 5 minutes)
          existingValue = parseInt(config.config_value, 16);
        } else if (config.config_value.length >= 4) {
          // 2-byte little-endian format (e.g., "9001" = 400 minutes)
          const lowByte = config.config_value.substring(0, 2);
          const highByte = config.config_value.substring(2, 4);
          existingValue = parseInt(highByte + lowByte, 16);
        }
      }
      newValueHex = await configureWmbusReadingTime(ask, existingValue);
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
      
      // If this is a reading windows config, also update the windows in reading_windows table
      if (config.config_code === tConst.CODE_C_RECV && global.readingWindowsData && global.readingWindowsData.pending) {
        const windows = global.readingWindowsData.pending;
        
        // Delete existing windows for this config
        readingWindowsDB.deleteByDeviceConfigId(config.id);
        
        // Insert new windows
        for (const window of windows) {
          readingWindowsDB.upsert({
            deviceConfigId: config.id,
            windowNumber: window.windowNumber,
            startTimeMinutes: window.startTimeMinutes,
            endTimeMinutes: window.endTimeMinutes,
            samplingIntervalMinutes: window.samplingIntervalMinutes,
            enabled: window.enabled
          });
        }
        
        // Clear the pending windows data
        delete global.readingWindowsData.pending;
        console.log(chalk.green(`   ${windows.length} reading window(s) updated in database.`));
      }
      
      // If this is an authorization config, also update the authorization parameters in authorization_parameters table
      if (config.config_code === tConst.CODE_C_AUTH && global.authorizationData && global.authorizationData.pending) {
        const authParams = global.authorizationData.pending;
        
        // Update authorization parameters
        authorizationParametersDB.upsert({
          deviceConfigId: config.id,
          username: authParams.username,
          password: authParams.password
        });
        
        // Clear the pending authorization data
        delete global.authorizationData.pending;
        console.log(chalk.green(`   Authorization parameters updated in database.`));
      }
      
      // If this is a network config, also update the network parameters in network_parameters table
      if (config.config_code === tConst.CODE_C_WEV && global.networkData && global.networkData.pending) {
        const networkParams = global.networkData.pending;
        
        // Update network parameters
        networkParametersDB.upsert({
          deviceConfigId: config.id,
          finalOperator: networkParams.finalOperator,
          finalAPN: networkParams.finalAPN,
          user: networkParams.user,
          password: networkParams.password,
          eSIM: networkParams.eSIM,
          intermediateOperator: networkParams.intermediateOperator,
          intermediateAPN: networkParams.intermediateAPN,
          intermediateUser: networkParams.intermediateUser,
          intermediatePassword: networkParams.intermediatePassword
        });
        
        // Clear the pending network data
        delete global.networkData.pending;
        console.log(chalk.green(`   Network parameters updated in database.`));
      }
      
      console.log(chalk.green("\n✅ Configuration updated successfully."));
    } else {
      // Clear pending windows data if cancelled
      if (global.transmissionWindowsData && global.transmissionWindowsData.pending) {
        delete global.transmissionWindowsData.pending;
      }
      if (global.readingWindowsData && global.readingWindowsData.pending) {
        delete global.readingWindowsData.pending;
      }
      if (global.authorizationData && global.authorizationData.pending) {
        delete global.authorizationData.pending;
      }
      if (global.networkData && global.networkData.pending) {
        delete global.networkData.pending;
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
          
          // If this is a reading windows config, also insert the windows into reading_windows table
          if (selectedConfig.code === tConst.CODE_C_RECV && global.readingWindowsData && global.readingWindowsData.pending) {
            const windows = global.readingWindowsData.pending;
            for (const window of windows) {
              readingWindowsDB.upsert({
                deviceConfigId: deviceConfigId,
                windowNumber: window.windowNumber,
                startTimeMinutes: window.startTimeMinutes,
                endTimeMinutes: window.endTimeMinutes,
                samplingIntervalMinutes: window.samplingIntervalMinutes,
                enabled: window.enabled
              });
            }
            // Clear the pending windows data
            delete global.readingWindowsData.pending;
            console.log(chalk.green(`   ${windows.length} reading window(s) saved to database.`));
          }
          
          // If this is an authorization config, also insert the authorization parameters into authorization_parameters table
          if (selectedConfig.code === tConst.CODE_C_AUTH && global.authorizationData && global.authorizationData.pending) {
            const authParams = global.authorizationData.pending;
            authorizationParametersDB.upsert({
              deviceConfigId: deviceConfigId,
              username: authParams.username,
              password: authParams.password
            });
            // Clear the pending authorization data
            delete global.authorizationData.pending;
            console.log(chalk.green(`   Authorization parameters saved to database.`));
          }
          
          // If this is a network config, also insert the network parameters into network_parameters table
          if (selectedConfig.code === tConst.CODE_C_WEV && global.networkData && global.networkData.pending) {
            const networkParams = global.networkData.pending;
            networkParametersDB.upsert({
              deviceConfigId: deviceConfigId,
              finalOperator: networkParams.finalOperator,
              finalAPN: networkParams.finalAPN,
              user: networkParams.user,
              password: networkParams.password,
              eSIM: networkParams.eSIM,
              intermediateOperator: networkParams.intermediateOperator,
              intermediateAPN: networkParams.intermediateAPN,
              intermediateUser: networkParams.intermediateUser,
              intermediatePassword: networkParams.intermediatePassword
            });
            // Clear the pending network data
            delete global.networkData.pending;
            console.log(chalk.green(`   Network parameters saved to database.`));
          }
          
          console.log(chalk.green("\n✅ Configuration saved to database."));
          console.log(chalk.blue("   It will be sent when the device connects to the server."));
        } else {
          // Clear pending data if cancelled
          if (global.transmissionWindowsData && global.transmissionWindowsData.pending) {
            delete global.transmissionWindowsData.pending;
          }
          if (global.readingWindowsData && global.readingWindowsData.pending) {
            delete global.readingWindowsData.pending;
          }
          if (global.authorizationData && global.authorizationData.pending) {
            delete global.authorizationData.pending;
          }
          if (global.networkData && global.networkData.pending) {
            delete global.networkData.pending;
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

