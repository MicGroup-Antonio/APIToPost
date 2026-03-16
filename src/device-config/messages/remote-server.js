import chalk from "chalk";
import { stringToHexPadded, parseText, parsePort, parseInteger } from "../utils/input-parser.js";
import { numberToLittleEndianHex } from "../utils/hex-converter.js";

/**
 * Remote Server Parameters (Message 11 - CODE_C_RSER)
 * Frame structure per spec 10.3.5.11:
 * - Bytes 0-49:   IP address (50 bytes ASCII, padded 0x00)
 * - Byte 50:      Reserved (0x00)
 * - Bytes 51-52:  Port (2 bytes, little-endian)
 * - Byte 53:      Mode: 0=UDO, 1=UDP-DTLS, 2=LwM2M
 * - Bytes 54-93:  PSK_ID (40 bytes ASCII, padded 0x00)
 * - Byte 94:      Reserved (0x00)
 * - Bytes 95-158: PSK_Content (64 bytes ASCII, padded 0x00)
 * - Byte 159:     Reserved (0x00)
 * Total value: 160 bytes (320 hex chars)
 */

const MODE_NAMES = { 0: "UDO", 1: "UDP-DTLS", 2: "LwM2M" };

/**
 * Configure remote server parameters
 * @param {Function} ask - Function to prompt user for input
 * @param {Object} existingParams - Optional existing parameters { ip, port, mode, pskId, pskContent }
 * @returns {Promise<string>} Hex value for the configuration frame (160 bytes)
 */
export async function configureRemoteServerParameters(ask, existingParams = null) {
  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold("         REMOTE SERVER PARAMETERS"));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow("Configure temporary connection to another server (e.g. for OTAP)."));
  console.log(chalk.gray("  IP: 50 bytes | Port: 2 bytes (LE) | Mode: 0=UDO, 1=UDP-DTLS, 2=LwM2M"));
  console.log(chalk.gray("  PSK_ID: 40 bytes | PSK_Content: 64 bytes"));
  console.log("");

  if (existingParams) {
    console.log(chalk.yellow.bold("Current parameters:"));
    console.log(chalk.white(`   IP: ${existingParams.ip || "(empty)"}`));
    console.log(chalk.white(`   Port: ${existingParams.port ?? "(empty)"}`));
    console.log(chalk.white(`   Mode: ${existingParams.mode !== undefined ? MODE_NAMES[existingParams.mode] ?? existingParams.mode : "(empty)"}`));
    console.log(chalk.white(`   PSK_ID: ${existingParams.pskId ? "(set)" : "(empty)"}`));
    console.log(chalk.white(`   PSK_Content: ${existingParams.pskContent ? "(set)" : "(empty)"}`));
    console.log("");
  }

  // IP (max 50 bytes ASCII)
  let ip;
  while (true) {
    const prompt = existingParams?.ip != null
      ? chalk.yellow(`IP address (current: ${existingParams.ip}, max 50 chars): `)
      : chalk.yellow("IP address (max 50 characters): ");
    const input = await ask(prompt);
    if (input.trim() === "" && existingParams?.ip != null) {
      ip = existingParams.ip;
      break;
    }
    ip = parseText(input, true, 50);
    if (ip !== null) break;
    console.log(chalk.red("❌ IP is required, max 50 characters."));
  }

  // Port (1-65535)
  let port;
  while (true) {
    const prompt = existingParams?.port != null
      ? chalk.yellow(`Port (current: ${existingParams.port}, 1-65535): `)
      : chalk.yellow("Port (1-65535): ");
    const input = await ask(prompt);
    if (input.trim() === "" && existingParams?.port != null) {
      port = existingParams.port;
      break;
    }
    port = parsePort(input);
    if (port !== null) break;
    console.log(chalk.red("❌ Invalid port. Use 1-65535."));
  }

  // Mode (0, 1, 2)
  let mode;
  while (true) {
    console.log(chalk.white("   Mode: 0=UDO, 1=UDP-DTLS, 2=LwM2M"));
    const prompt = existingParams?.mode !== undefined
      ? chalk.yellow(`Mode (current: ${existingParams.mode} ${MODE_NAMES[existingParams.mode]}, 0/1/2): `)
      : chalk.yellow("Mode (0/1/2): ");
    const input = await ask(prompt);
    if (input.trim() === "" && existingParams?.mode !== undefined) {
      mode = existingParams.mode;
      break;
    }
    mode = parseInteger(input, 0, 2);
    if (mode !== null) break;
    console.log(chalk.red("❌ Mode must be 0, 1, or 2."));
  }

  // PSK_ID (max 40 bytes ASCII, optional)
  let pskId;
  const pskIdPrompt = existingParams?.pskId != null
    ? chalk.yellow(`PSK_ID (current: "${existingParams.pskId}", max 40 chars, Enter to keep): `)
    : chalk.yellow("PSK_ID (max 40 characters, optional): ");
  const pskIdInput = await ask(pskIdPrompt);
  if (pskIdInput.trim() === "" && existingParams?.pskId != null) {
    pskId = existingParams.pskId;
  } else {
    pskId = parseText(pskIdInput, false, 40) ?? "";
  }

  // PSK_Content (max 64 bytes ASCII, optional)
  let pskContent;
  const pskContentPrompt = existingParams?.pskContent != null
    ? chalk.yellow("PSK_Content (current: ***, max 64 chars, Enter to keep): ")
    : chalk.yellow("PSK_Content (max 64 characters, optional): ");
  const pskContentInput = await ask(pskContentPrompt);
  if (pskContentInput.trim() === "" && existingParams?.pskContent != null) {
    pskContent = existingParams.pskContent;
  } else {
    pskContent = parseText(pskContentInput, false, 64) ?? "";
  }

  // Build value: 160 bytes
  const ipHex = stringToHexPadded(ip || "", 50);           // 100 hex
  const reserved1 = "00";                                     // 2 hex
  const portHex = numberToLittleEndianHex(port, 2);          // 4 hex
  const modeHex = mode.toString(16).padStart(2, "0");        // 2 hex
  const pskIdHex = stringToHexPadded(pskId || "", 40);       // 80 hex
  const reserved2 = "00";                                     // 2 hex
  const pskContentHex = stringToHexPadded(pskContent || "", 64); // 128 hex
  const reserved3 = "00";                                     // 2 hex

  const hexValue = (
    ipHex + reserved1 + portHex + modeHex +
    pskIdHex + reserved2 + pskContentHex + reserved3
  ).toLowerCase();

  console.log("");
  console.log(chalk.green("✓ Remote server parameters configured"));
  console.log(chalk.blue(`📦 Value length: ${hexValue.length / 2} bytes (160 expected)`));
  await ask(chalk.gray("Press Enter to continue..."));

  return hexValue;
}
