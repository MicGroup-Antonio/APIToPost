import dgram from "dgram";
import fs from "fs";
import path from "path";
import { calcularCRC, buildTrama } from "./src/tst.js";
import { CODE_S_ACK, CODE_OK, CODE_R_AUTH } from "./src/const.js";

// Configuration
const PORT = process.env.TEST_PORT || 3005;
const LOG_FILE = path.join(process.cwd(), "test-messages.log");

// Session ID management (simple sequential counter)
let nextSessionId = 1;
const MAX_SESSION_ID = 0xffff; // 65535

/**
 * Generates a new sequential session ID and splits it into high and low bytes
 * @returns {{idSessionH: string, idSessionL: string}} Object with hex strings for SessionH and SessionL
 */
function generateSequentialSessionId() {
  const sessionId = nextSessionId;
  nextSessionId = nextSessionId >= MAX_SESSION_ID ? 1 : nextSessionId + 1;
  
  // Convert to 2-byte hex string (4 hex chars) and split into high/low bytes
  const sessionIdHex = sessionId.toString(16).toLowerCase().padStart(4, "0");
  const idSessionH = sessionIdHex.slice(0, 2);
  const idSessionL = sessionIdHex.slice(2, 4);
  
  return { idSessionH, idSessionL };
}

// Create UDP socket
const server = dgram.createSocket("udp4");

/**
 * Builds a simple ACK response from message hex
 * For authentication frames, assigns a new session ID
 * For other frames, uses the session ID from the message
 */
function buildSimpleACK(msgHex) {
  // Extract frame info from message (assuming minimum 5 bytes)
  // Byte 0: frame type, Byte 1: ack, Byte 2: frame ID, Byte 3: session H, Byte 4: session L
  const frameType = msgHex.slice(0, 2).toLowerCase();
  const idFrame = msgHex.slice(2 * 2, 3 * 2) || "00";
  
  let idSessionH, idSessionL;
  
  // For authentication frames, generate a new session ID
  // For all other frames, use the session ID from the message
  if (frameType === CODE_R_AUTH.toLowerCase()) {
    const sessionIds = generateSequentialSessionId();
    idSessionH = sessionIds.idSessionH;
    idSessionL = sessionIds.idSessionL;
    console.log(`🔢 Assigned new session ID: ${idSessionH}${idSessionL} (${parseInt(idSessionH + idSessionL, 16)})`);
  } else {
    idSessionH = msgHex.slice(3 * 2, 4 * 2) || "00";
    idSessionL = msgHex.slice(4 * 2, 5 * 2) || "00";
  }

  const respuesta = {
    idTrama: CODE_S_ACK,
    ack: CODE_OK,
    idFrame: idFrame,
    idSessionH: idSessionH,
    idSessionL: idSessionL,
    size: "0000",
    value: "",
  };

  const cadena = buildTrama(respuesta, false);
  return cadena + calcularCRC(cadena);
}

/**
 * Extracts name from authentication frame
 * Name is at offset 70 bytes (140 hex chars) and is 40 bytes (80 hex chars)
 */
function extractName(msgHex) {
  const charPerByte = 2;
  const offset = 70 * charPerByte; // 140 hex chars
  const nameLength = 40 * charPerByte; // 80 hex chars
  
  if (msgHex.length < offset + nameLength) {
    return null;
  }
  
  const hexName = msgHex.slice(offset, offset + nameLength);
  try {
    const name = Buffer.from(hexName, "hex").toString("ascii");
    return name.replace(/\x00+$/, ""); // Remove null padding
  } catch (error) {
    return null;
  }
}

/**
 * Logs message to file (synchronous for speed)
 * Extracts and logs name, frame ID, and session ID
 */
function logMessage(msg, rinfo) {
  const timestamp = new Date().toISOString();
  const msgHex = msg.toString("hex");
  
  // Extract frame ID and session ID from message
  // Byte 0: frame type, Byte 1: ack, Byte 2: frame ID, Byte 3: session H, Byte 4: session L
  const frameType = msgHex.slice(0, 2).toLowerCase();
  const frameId = msgHex.length >= 6 ? msgHex.slice(2 * 2, 3 * 2) : "??";
  const sessionH = msgHex.length >= 8 ? msgHex.slice(3 * 2, 4 * 2) : "??";
  const sessionL = msgHex.length >= 10 ? msgHex.slice(4 * 2, 5 * 2) : "??";
  const sessionId = `${sessionH}${sessionL}`;
  
  // Extract name if it's an authentication frame
  let namePart = "";
  if (frameType === CODE_R_AUTH.toLowerCase()) {
    const name = extractName(msgHex);
    if (name) {
      namePart = `Name:${name} `;
    } else {
      namePart = `Name:(unable to extract) `;
    }
  }
  
  const logEntry = `[${timestamp}] ${rinfo.address}:${rinfo.port} - ${namePart}Session:${sessionId} FrameID:${frameId} - ${msgHex}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logEntry, "utf8");
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

// Handle incoming UDP messages
server.on("message", (msg, rinfo) => {
  // Log message to file (fast, synchronous)
  logMessage(msg, rinfo);

  // Build ACK response as fast as possible
  const msgHex = msg.toString("hex");
  let ackResponse;
  
  try {
    ackResponse = buildSimpleACK(msgHex);
  } catch (error) {
    console.error(`Error building ACK: ${error.message}`);
    return; // Don't send response if ACK building fails
  }

  // Send ACK immediately (non-blocking)
  server.send(Buffer.from(ackResponse, "hex"), rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error(`Error sending ACK to ${rinfo.address}:${rinfo.port}:`, err.message);
    }
  });
});

// Handle socket errors
server.on("error", (err) => {
  console.error(`UDP server error: ${err.message}`);
  server.close();
});

// Start listening
server.bind(PORT, () => {
  console.log(`Test server listening on port ${PORT}`);
  console.log(`Logging messages to: ${LOG_FILE}`);
});

