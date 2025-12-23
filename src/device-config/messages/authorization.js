import chalk from "chalk";

/**
 * Helper functions for authorization parameters configuration
 */

/**
 * Convert string to hex with padding
 * @param {string} str - String to convert
 * @param {number} lengthBytes - Target length in bytes
 * @returns {string} Hex string
 */
function stringToHexPadded(str, lengthBytes) {
  const buf = Buffer.from(str, "ascii");
  const padding = Buffer.alloc(Math.max(lengthBytes - buf.length, 0), 0x00);
  return Buffer.concat([buf, padding]).toString("hex");
}

/**
 * Parse text input with validation
 * @param {string} input - Input string
 * @param {boolean} required - Whether input is required
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string|null} Parsed text or null if invalid
 */
function parseText(input, required = false, maxLength = null) {
  if (!input || !input.trim()) {
    return required ? null : "";
  }
  const trimmed = input.trim();
  if (maxLength !== null && trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

/**
 * Configure authorization parameters (username and password)
 * @param {Function} ask - Function to prompt user for input
 * @param {Object} existingParams - Optional existing parameters to pre-fill {username, password}
 * @returns {Promise<string>} Hex value for the configuration frame
 */
export async function configureAuthorization(ask, existingParams = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         AUTHORIZATION PARAMETERS CONFIGURATION"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("Configure authentication credentials:"));
  console.log(chalk.white("  - Username (max 32 characters)"));
  console.log(chalk.white("  - Password (max 32 characters)"));
  console.log("");
  
  // If updating, show existing parameters
  if (existingParams) {
    console.log(chalk.yellow.bold("Current Authorization Parameters:"));
    console.log(chalk.white(`   Username: `) + chalk.blue(existingParams.username || "(empty)"));
    console.log(chalk.white(`   Password: `) + chalk.gray(existingParams.password ? "***" : "(empty)"));
    console.log("");
  }
  
  // Get username
  let username;
  while (true) {
    const defaultUser = existingParams ? existingParams.username : "";
    const prompt = defaultUser ? `Username (current: ${defaultUser}, max 32 chars): ` : "Username (max 32 characters): ";
    const userInput = await ask(chalk.yellow(prompt));
    if (!userInput.trim() && defaultUser) {
      username = defaultUser;
      break;
    }
    username = parseText(userInput, false, 32);
    if (username !== null) {
      break;
    }
    console.log(chalk.red("❌ Username cannot exceed 32 characters."));
  }
  
  // Get password
  let password;
  while (true) {
    const defaultPass = existingParams ? existingParams.password : "";
    const prompt = defaultPass ? `Password (current: ***, max 32 chars, press Enter to keep): ` : "Password (max 32 characters): ";
    const passInput = await ask(chalk.yellow(prompt));
    if (!passInput.trim() && defaultPass) {
      password = defaultPass;
      break;
    }
    password = parseText(passInput, false, 32);
    if (password !== null) {
      break;
    }
    console.log(chalk.red("❌ Password cannot exceed 32 characters."));
  }
  
  // Build hex value: username (32 bytes) + password (32 bytes)
  const authValue = stringToHexPadded(username || "", 32) + stringToHexPadded(password || "", 32);
  
  // Store authorization data for later insertion (we'll need device_config_id)
  if (!global.authorizationData) {
    global.authorizationData = {};
  }
  global.authorizationData.pending = {
    username: username || "",
    password: password || ""
  };
  
  console.log(chalk.green(`\n✅ Authorization parameters configured`));
  console.log(chalk.blue(`📦 Generated hex value: ${authValue.substring(0, 80)}${authValue.length > 80 ? '...' : ''}`));
  console.log(chalk.blue(`📏 Total length: ${authValue.length / 2} bytes`));
  
  return authValue;
}

