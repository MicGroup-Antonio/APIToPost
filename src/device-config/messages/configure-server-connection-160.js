import chalk from "chalk";
import { parseText, parsePort, parseInteger } from "../utils/input-parser.js";
import { build160ByteServerParametersPayload } from "./server-payload-160.js";

/**
 * Interactive wizard for the 160-byte server-connection payload (spec 10.3.5.3).
 * Same layout for CODE_C_SERV (primary) and CODE_C_RSER (remote).
 */

const MODE_NAMES = { 0: "UDP", 1: "UDP-DTLS", 2: "LwM2M" };

const UI = {
  primary: {
    title: "SERVER PARAMETERS (10.3.5.3)",
    intro: "Primary server connection (IP, port, transport mode, optional PSK).",
    success: "✓ Server parameters configured (160-byte payload per spec).",
    ipLabel: "Server IP / host",
    ipError: "❌ IP/host is required, max 50 characters (per specification).",
  },
  remote: {
    title: "REMOTE SERVER PARAMETERS",
    intro: "Temporary connection to another server (e.g. for OTAP).",
    success: "✓ Remote server parameters configured",
    ipLabel: "IP address",
    ipError: "❌ IP is required, max 50 characters.",
  },
};

/**
 * @param {Function} ask
 * @param {{ ip?: string, port?: number, mode?: number, pskId?: string, pskContent?: string } | null} existingParams
 * @param {"primary" | "remote"} variant
 * @returns {Promise<string>} 320 hex chars
 */
async function run160ConnectionWizard(ask, existingParams, variant) {
  const u = UI[variant];

  console.clear();
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log(chalk.cyan.bold(`         ${u.title}`));
  console.log(chalk.cyan("═══════════════════════════════════════════════════════"));
  console.log("");
  console.log(chalk.yellow(u.intro));
  console.log(chalk.gray("  IP: 50 bytes | Port: 2 bytes (LE) | Mode: 0=UDP, 1=UDP-DTLS, 2=LwM2M"));
  console.log(chalk.gray("  PSK_ID: 40 bytes | PSK_Content: 64 bytes"));
  console.log("");

  if (existingParams) {
    console.log(chalk.yellow.bold("Current parameters:"));
    console.log(chalk.white(`   IP: ${existingParams.ip || "(empty)"}`));
    console.log(chalk.white(`   Port: ${existingParams.port ?? "(empty)"}`));
    console.log(
      chalk.white(
        `   Mode: ${existingParams.mode !== undefined ? MODE_NAMES[existingParams.mode] ?? existingParams.mode : "(empty)"}`
      )
    );
    console.log(chalk.white(`   PSK_ID: ${existingParams.pskId ? "(set)" : "(empty)"}`));
    console.log(chalk.white(`   PSK_Content: ${existingParams.pskContent ? "(set)" : "(empty)"}`));
    console.log("");
  }

  let ip;
  while (true) {
    const prompt =
      existingParams?.ip != null
        ? chalk.yellow(`${u.ipLabel} (current: ${existingParams.ip}, max 50 chars): `)
        : chalk.yellow(`${u.ipLabel} (max 50 characters): `);
    const input = await ask(prompt);
    if (input.trim() === "" && existingParams?.ip != null) {
      ip = existingParams.ip;
      break;
    }
    ip = parseText(input, true, 50);
    if (ip !== null) break;
    console.log(chalk.red(u.ipError));
  }

  let port;
  while (true) {
    const prompt =
      existingParams?.port != null
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

  let mode;
  while (true) {
    console.log(chalk.white("   Mode: 0=UDP, 1=UDP-DTLS, 2=LwM2M"));
    const prompt =
      existingParams?.mode !== undefined
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

  let pskId;
  const pskIdPrompt =
    existingParams?.pskId != null
      ? chalk.yellow(`PSK_ID (current: "${existingParams.pskId}", max 40 chars, Enter to keep): `)
      : chalk.yellow("PSK_ID (max 40 characters, optional): ");
  const pskIdInput = await ask(pskIdPrompt);
  if (pskIdInput.trim() === "" && existingParams?.pskId != null) {
    pskId = existingParams.pskId;
  } else {
    pskId = parseText(pskIdInput, false, 40) ?? "";
  }

  let pskContent;
  const pskContentPrompt =
    existingParams?.pskContent != null
      ? chalk.yellow("PSK_Content (current: ***, max 64 chars, Enter to keep): ")
      : chalk.yellow("PSK_Content (max 64 characters, optional): ");
  const pskContentInput = await ask(pskContentPrompt);
  if (pskContentInput.trim() === "" && existingParams?.pskContent != null) {
    pskContent = existingParams.pskContent;
  } else {
    pskContent = parseText(pskContentInput, false, 64) ?? "";
  }

  const hexValue = build160ByteServerParametersPayload({
    ip,
    port,
    mode,
    pskId,
    pskContent,
  });

  console.log("");
  console.log(chalk.green(u.success));
  console.log(chalk.blue(`📦 Value length: ${hexValue.length / 2} bytes (160 expected)`));
  await ask(chalk.gray("Press Enter to continue..."));

  return hexValue;
}

/** @param {Function} ask @param {object|null} existingParams */
export async function configureServerParameters(ask, existingParams = null) {
  return run160ConnectionWizard(ask, existingParams, "primary");
}

/** @param {Function} ask @param {object|null} existingParams */
export async function configureRemoteServerParameters(ask, existingParams = null) {
  return run160ConnectionWizard(ask, existingParams, "remote");
}
