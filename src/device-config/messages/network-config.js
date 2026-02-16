import chalk from "chalk";
import { stringToHexPadded, parseText, parseBoolean, parseInteger } from "../utils/input-parser.js";

/**
 * Helper functions for network configuration (WEV)
 * 
 * Frame structure (191 bytes total):
 * - Byte 0-9: Final Operator (10 bytes, ASCII, padded with 0x00)
 * - Byte 10: Reserved (0x00)
 * - Byte 11-50: Final APN (40 bytes, ASCII, padded with 0x00)
 * - Byte 51: Reserved (0x00)
 * - Byte 52: Reserved (0x00)
 * - Byte 53-72: User (20 bytes, ASCII, padded with 0x00)
 * - Byte 73: Reserved (0x00)
 * - Byte 74-93: Password (20 bytes, ASCII, padded with 0x00)
 * - Byte 94: Reserved (0x00)
 * - Byte 95: eSIM flag (0x00 = No reconfigure, 0x01 = Reconfigure)
 * - Byte 96-105: Intermediate Operator (10 bytes, ASCII, padded with 0x00) - only if eSIM = 1
 * - Byte 106: Reserved (0x00)
 * - Byte 107-146: Intermediate APN (40 bytes, ASCII, padded with 0x00) - only if eSIM = 1
 * - Byte 147: Reserved (0x00)
 * - Byte 148: Reserved (0x00)
 * - Byte 149-168: Intermediate User (20 bytes, ASCII, padded with 0x00) - only if eSIM = 1
 * - Byte 169: Reserved (0x00)
 * - Byte 170-189: Intermediate Password (20 bytes, ASCII, padded with 0x00) - only if eSIM = 1
 * - Byte 190: Reserved (0x00)
 */

/**
 * Configure network settings
 * @param {Function} ask - Function to prompt user for input
 * @param {Object|null} existingConfig - Optional existing configuration to pre-fill
 * @returns {Promise<string>} Hex value for the configuration frame (191 bytes)
 */
export async function configureNetwork(ask, existingConfig = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         NETWORK CONFIGURATION (WEV)"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("Configure network settings for the device."));
  console.log(chalk.white("This includes Final Operator, APN, User, Password,"));
  console.log(chalk.white("and optionally Intermediate settings for eSIM reconfiguration."));
  console.log("");

  // Display existing configuration if available
  if (existingConfig) {
    console.log(chalk.yellow.bold("Current Configuration:"));
    if (existingConfig.finalOperator) {
      console.log(chalk.white(`   Final Operator: ${existingConfig.finalOperator}`));
    }
    if (existingConfig.finalAPN) {
      console.log(chalk.white(`   Final APN: ${existingConfig.finalAPN}`));
    }
    if (existingConfig.user) {
      console.log(chalk.white(`   User: ${existingConfig.user}`));
    }
    if (existingConfig.password) {
      console.log(chalk.white(`   Password: ***`));
    }
    if (existingConfig.eSIM !== undefined) {
      console.log(chalk.white(`   eSIM Reconfigure: ${existingConfig.eSIM ? "Yes" : "No"}`));
    }
    console.log("");
  }

  // Final Operator (bytes 0-9, 10 bytes)
  let finalOperator;
  while (true) {
    const defaultOp = existingConfig ? existingConfig.finalOperator : "";
    const prompt = defaultOp 
      ? chalk.yellow(`Final Operator (current: ${defaultOp}, max 10 chars, press Enter to keep): `)
      : chalk.yellow("Final Operator (max 10 characters): ");
    const input = await ask(prompt);
    
    if (!input.trim() && defaultOp) {
      finalOperator = defaultOp;
      break;
    }
    
    finalOperator = parseText(input, false, 10);
    if (finalOperator !== null) {
      break;
    }
    console.log(chalk.red("❌ Final Operator cannot exceed 10 characters."));
  }

  // Final APN (bytes 11-50, 40 bytes)
  let finalAPN;
  while (true) {
    const defaultAPN = existingConfig ? existingConfig.finalAPN : "";
    const prompt = defaultAPN
      ? chalk.yellow(`Final APN (current: ${defaultAPN || "(empty)"}, max 40 chars, press Enter to keep): `)
      : chalk.yellow("Final APN (max 40 characters, optional): ");
    const input = await ask(prompt);
    
    if (!input.trim() && defaultAPN !== undefined) {
      finalAPN = defaultAPN || "";
      break;
    }
    
    finalAPN = parseText(input, false, 40);
    if (finalAPN !== null) {
      break;
    }
    console.log(chalk.red("❌ Final APN cannot exceed 40 characters."));
  }

  // User (bytes 53-72, 20 bytes)
  let user;
  while (true) {
    const defaultUser = existingConfig ? existingConfig.user : "";
    const prompt = defaultUser
      ? chalk.yellow(`User (current: ${defaultUser}, max 20 chars, press Enter to keep): `)
      : chalk.yellow("User (max 20 characters): ");
    const input = await ask(prompt);
    
    if (!input.trim() && defaultUser) {
      user = defaultUser;
      break;
    }
    
    user = parseText(input, false, 20);
    if (user !== null) {
      break;
    }
    console.log(chalk.red("❌ User cannot exceed 20 characters."));
  }

  // Password (bytes 74-93, 20 bytes)
  let password;
  while (true) {
    const defaultPass = existingConfig ? existingConfig.password : "";
    const prompt = defaultPass
      ? chalk.yellow(`Password (current: ***, max 20 chars, press Enter to keep): `)
      : chalk.yellow("Password (max 20 characters): ");
    const input = await ask(prompt);
    
    if (!input.trim() && defaultPass) {
      password = defaultPass;
      break;
    }
    
    password = parseText(input, false, 20);
    if (password !== null) {
      break;
    }
    console.log(chalk.red("❌ Password cannot exceed 20 characters."));
  }

  // eSIM flag (byte 95)
  let eSIM;
  while (true) {
    const defaultESIM = existingConfig ? existingConfig.eSIM : false;
    const prompt = defaultESIM !== undefined
      ? chalk.yellow(`eSIM Reconfigure? (current: ${defaultESIM ? "Yes" : "No"}, 0=No, 1=Yes, press Enter to keep): `)
      : chalk.yellow("eSIM Reconfigure? (0=No, 1=Yes): ");
    const input = await ask(prompt);
    
    if (!input.trim() && defaultESIM !== undefined) {
      eSIM = defaultESIM;
      break;
    }
    
    const boolValue = parseBoolean(input);
    if (boolValue !== null) {
      eSIM = boolValue;
      break;
    }
    
    const intValue = parseInteger(input, 0, 1);
    if (intValue !== null) {
      eSIM = intValue === 1;
      break;
    }
    
    console.log(chalk.red("❌ Invalid input. Please enter 0/1, y/n, yes/no, or true/false."));
  }

  // Intermediate settings (only if eSIM = true)
  let intermediateOperator = "";
  let intermediateAPN = "";
  let intermediateUser = "";
  let intermediatePassword = "";

  if (eSIM) {
    console.log("");
    console.log(chalk.cyan("Intermediate Settings (for eSIM reconfiguration):"));
    console.log("");

    // Intermediate Operator (bytes 96-105, 10 bytes)
    while (true) {
      const defaultOp = existingConfig ? existingConfig.intermediateOperator : "";
      const prompt = defaultOp
        ? chalk.yellow(`Intermediate Operator (current: ${defaultOp || "(empty)"}, max 10 chars, press Enter to keep): `)
        : chalk.yellow("Intermediate Operator (max 10 characters, optional): ");
      const input = await ask(prompt);
      
      if (!input.trim() && defaultOp !== undefined) {
        intermediateOperator = defaultOp || "";
        break;
      }
      
      intermediateOperator = parseText(input, false, 10);
      if (intermediateOperator !== null) {
        break;
      }
      console.log(chalk.red("❌ Intermediate Operator cannot exceed 10 characters."));
    }

    // Intermediate APN (bytes 107-146, 40 bytes)
    while (true) {
      const defaultAPN = existingConfig ? existingConfig.intermediateAPN : "";
      const prompt = defaultAPN
        ? chalk.yellow(`Intermediate APN (current: ${defaultAPN || "(empty)"}, max 40 chars, press Enter to keep): `)
        : chalk.yellow("Intermediate APN (max 40 characters, optional): ");
      const input = await ask(prompt);
      
      if (!input.trim() && defaultAPN !== undefined) {
        intermediateAPN = defaultAPN || "";
        break;
      }
      
      intermediateAPN = parseText(input, false, 40);
      if (intermediateAPN !== null) {
        break;
      }
      console.log(chalk.red("❌ Intermediate APN cannot exceed 40 characters."));
    }

    // Intermediate User (bytes 149-168, 20 bytes)
    while (true) {
      const defaultUser = existingConfig ? existingConfig.intermediateUser : "";
      const prompt = defaultUser
        ? chalk.yellow(`Intermediate User (current: ${defaultUser || "(empty)"}, max 20 chars, press Enter to keep): `)
        : chalk.yellow("Intermediate User (max 20 characters, optional): ");
      const input = await ask(prompt);
      
      if (!input.trim() && defaultUser !== undefined) {
        intermediateUser = defaultUser || "";
        break;
      }
      
      intermediateUser = parseText(input, false, 20);
      if (intermediateUser !== null) {
        break;
      }
      console.log(chalk.red("❌ Intermediate User cannot exceed 20 characters."));
    }

    // Intermediate Password (bytes 170-189, 20 bytes)
    while (true) {
      const defaultPass = existingConfig ? existingConfig.intermediatePassword : "";
      const prompt = defaultPass
        ? chalk.yellow(`Intermediate Password (current: ***, max 20 chars, press Enter to keep): `)
        : chalk.yellow("Intermediate Password (max 20 characters, optional): ");
      const input = await ask(prompt);
      
      if (!input.trim() && defaultPass !== undefined) {
        intermediatePassword = defaultPass || "";
        break;
      }
      
      intermediatePassword = parseText(input, false, 20);
      if (intermediatePassword !== null) {
        break;
      }
      console.log(chalk.red("❌ Intermediate Password cannot exceed 20 characters."));
    }
  }

  // Build the hex frame
  let hexFrame = "";

  // Byte 0-9: Final Operator (10 bytes)
  hexFrame += stringToHexPadded(finalOperator || "", 10);

  // Byte 10: Reserved (0x00)
  hexFrame += "00";

  // Byte 11-50: Final APN (40 bytes)
  hexFrame += stringToHexPadded(finalAPN || "", 40);

  // Byte 51: Reserved (0x00)
  hexFrame += "00";

  // Byte 52: Reserved (0x00)
  hexFrame += "00";

  // Byte 53-72: User (20 bytes)
  hexFrame += stringToHexPadded(user || "", 20);

  // Byte 73: Reserved (0x00)
  hexFrame += "00";

  // Byte 74-93: Password (20 bytes)
  hexFrame += stringToHexPadded(password || "", 20);

  // Byte 94: Reserved (0x00)
  hexFrame += "00";

  // Byte 95: eSIM flag (0x00 or 0x01)
  hexFrame += eSIM ? "01" : "00";

  // Byte 96-105: Intermediate Operator (10 bytes)
  hexFrame += stringToHexPadded(intermediateOperator || "", 10);

  // Byte 106: Reserved (0x00)
  hexFrame += "00";

  // Byte 107-146: Intermediate APN (40 bytes)
  hexFrame += stringToHexPadded(intermediateAPN || "", 40);

  // Byte 147: Reserved (0x00)
  hexFrame += "00";

  // Byte 148: Reserved (0x00)
  hexFrame += "00";

  // Byte 149-168: Intermediate User (20 bytes)
  hexFrame += stringToHexPadded(intermediateUser || "", 20);

  // Byte 169: Reserved (0x00)
  hexFrame += "00";

  // Byte 170-189: Intermediate Password (20 bytes)
  hexFrame += stringToHexPadded(intermediatePassword || "", 20);

  // Byte 190: Reserved (0x00)
  hexFrame += "00";

  // Verify total length (191 bytes = 382 hex characters)
  if (hexFrame.length !== 382) {
    throw new Error(`Invalid frame length: expected 382 hex chars (191 bytes), got ${hexFrame.length}`);
  }

  // Store network data for later insertion (we'll need device_config_id)
  if (!global.networkData) {
    global.networkData = {};
  }
  global.networkData.pending = {
    finalOperator: finalOperator || "",
    finalAPN: finalAPN || "",
    user: user || "",
    password: password || "",
    eSIM: eSIM,
    intermediateOperator: intermediateOperator || "",
    intermediateAPN: intermediateAPN || "",
    intermediateUser: intermediateUser || "",
    intermediatePassword: intermediatePassword || ""
  };

  console.log("");
  console.log(chalk.green("✓ Configuration:"));
  console.log(chalk.white(`   Final Operator: ${finalOperator || "(empty)"}`));
  console.log(chalk.white(`   Final APN: ${finalAPN || "(empty)"}`));
  console.log(chalk.white(`   User: ${user || "(empty)"}`));
  console.log(chalk.white(`   Password: ***`));
  console.log(chalk.white(`   eSIM Reconfigure: ${eSIM ? "Yes" : "No"}`));
  if (eSIM) {
    console.log(chalk.white(`   Intermediate Operator: ${intermediateOperator || "(empty)"}`));
    console.log(chalk.white(`   Intermediate APN: ${intermediateAPN || "(empty)"}`));
    console.log(chalk.white(`   Intermediate User: ${intermediateUser || "(empty)"}`));
    console.log(chalk.white(`   Intermediate Password: ***`));
  }
  console.log("");

  console.log(chalk.cyan("Hex value (191 bytes):"));
  console.log(chalk.white(`   ${hexFrame.substring(0, 80)}${hexFrame.length > 80 ? '...' : ''}`));
  console.log(chalk.gray(`   Total length: ${hexFrame.length / 2} bytes (${hexFrame.length} hex chars)`));
  console.log("");

  await ask(chalk.gray("Press Enter to continue..."));

  return hexFrame;
}

