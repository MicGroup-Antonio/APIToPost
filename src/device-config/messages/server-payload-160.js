/**
 * Spec 10.3.5.3 — Parámetros del Servidor (same binary layout as 10.3.5.11 Remote Server).
 *
 * Value field: 160 bytes (320 hex chars)
 * - Bytes 0–49:   IP (ASCII, padded 0x00)
 * - Byte 50:      Reserved (0x00)
 * - Bytes 51–52:  Port (uint16, little-endian)
 * - Byte 53:      Mode: 0=UDP, 1=UDP-DTLS, 2=LwM2M
 * - Bytes 54–93:  PSK_ID (ASCII, padded 0x00)
 * - Byte 94:      Reserved (0x00)
 * - Bytes 95–158: PSK_Content (ASCII, padded 0x00)
 * - Byte 159:     Reserved (0x00)
 */

import { stringToHexPadded } from "../utils/input-parser.js";
import { numberToLittleEndianHex } from "../utils/hex-converter.js";

/**
 * @param {{ ip: string, port: number, mode: number, pskId?: string, pskContent?: string }} fields
 * @returns {string} 320 hex characters (lowercase)
 */
export function build160ByteServerParametersPayload({ ip, port, mode, pskId = "", pskContent = "" }) {
  const m = Number.isInteger(mode) ? mode : parseInt(mode, 10);
  const modeByte = Math.max(0, Math.min(2, Number.isNaN(m) ? 0 : m));

  const ipHex = stringToHexPadded(ip || "", 50);
  const reserved1 = "00";
  const portHex = numberToLittleEndianHex(port, 2);
  const modeHex = modeByte.toString(16).padStart(2, "0");
  const pskIdHex = stringToHexPadded(pskId || "", 40);
  const reserved2 = "00";
  const pskContentHex = stringToHexPadded(pskContent || "", 64);
  const reserved3 = "00";

  return (
    ipHex +
    reserved1 +
    portHex +
    modeHex +
    pskIdHex +
    reserved2 +
    pskContentHex +
    reserved3
  ).toLowerCase();
}

/**
 * @param {string} configValue - hex string (at least 320 chars)
 * @returns {{ ip: string, port: number, mode: number, pskId: string, pskContent: string } | null}
 */
export function parse160ByteServerParametersPayload(configValue) {
  if (!configValue || configValue.length < 320) {
    return null;
  }
  const v = configValue.toLowerCase();

  let ip = "";
  for (let i = 0; i < 100; i += 2) {
    const byte = parseInt(v.substring(i, i + 2), 16);
    if (byte === 0) break;
    ip += String.fromCharCode(byte);
  }

  const portHex = v.substring(102, 106);
  const port = parseInt(portHex.substring(2, 4) + portHex.substring(0, 2), 16);

  const mode = parseInt(v.substring(106, 108), 16);

  let pskId = "";
  for (let i = 108; i < 188; i += 2) {
    const byte = parseInt(v.substring(i, i + 2), 16);
    if (byte === 0) break;
    pskId += String.fromCharCode(byte);
  }

  let pskContent = "";
  for (let i = 190; i < 318; i += 2) {
    const byte = parseInt(v.substring(i, i + 2), 16);
    if (byte === 0) break;
    pskContent += String.fromCharCode(byte);
  }

  return { ip, port, mode, pskId, pskContent };
}
