/* ----------------- IMPORTS------------------ */
import dotenv from "dotenv";
dotenv.config(); // Carga las variables de .env

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const configPath = process.env.CONFIG_PATH;

if (!configPath) {
  throw new Error("CONFIG_PATH no está definido en .env");
}

const config = require("." + configPath);
import * as tConst from "./const.js";
import {
  parseTrama,
  buildAutenticacion,
  getName,
  findName,
  getTramas,
  buildEnd,
  buildACK,
  buildNACK,
  buildNACKDesdeMensaje,
  parseAutenticacion,
  buildTrama,
  calcularCRC,
} from "./tst.js";
import {
  activeSessions,
  getSessionKey,
  createOrUpdateSession,
  updateSessionFrameId,
  removeSession,
  getSession,
  sessionExists,
  generateSequentialSessionId,
  initializeSessionManager,
  clearWaitingForAsk,
  isWaitingForAsk,
  setSessionTopic,
  setSessionLastMessage,
} from "./sessionManager.js";

/* --------------- LOG PATHS ----------------- */
const now = new Date(); // también se usa en la función logger
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, "0"); // 01-12

const dbLogPath = `./logs/log_${year}_${month}.txt`;
const detailedLogPath = `./logs/detailedLog_${year}_${month}.txt`;

const separacion = "--------------------------------";
/* ------------------- DB -------------------- */
process.env.PGUSER = config.pguser;
process.env.PGHOST = config.pghost;
process.env.PGPASSWORD = config.pgpassword;
process.env.PGDATABASE = config.pgdatabase;
process.env.PGPORT = config.pgport;
var pg = require("pg");

// Create explicit connection config
var dbConfig = {
  user: config.pguser,
  host: config.pghost,
  password: config.pgpassword,
  database: config.pgdatabase,
  port: config.pgport,
  connectionTimeoutMillis: 5000, // 5 second timeout
  idleTimeoutMillis: 30000,
  max: 20,
};

console.log("DB Config:", {
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  password: dbConfig.password ? "***SET***" : "NOT SET",
});

var pool = new pg.Pool(dbConfig);

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Error conectando al pool:", err.message);
  } else {
    console.log("✅ Conexión exitosa al pool!");
    release();
  }
});
/* ------------------- DB -------------------- */

/* ------------------- SESSION MANAGEMENT INIT ------------------- */
// Initialize session manager with config
initializeSessionManager(config);

/* ------------------- TST ------------------- */
let trama = {
  idTrama: null,
  ack: null,
  idFrame: null,
  idSessionH: null,
  idSessionL: null,
  size: null,
  value: null,
  crc: null,
};

// callStack removed - using activeSessions dictionary instead

/* ------------------- TST ------------------- */

/**
 * Graba en la base de datos la trama recibida.
 * Crea un log de la cadena grabada en base de datos: archivo log
 *
 * @param {string} topic - Dirección remitente del mensaje.
 * @param {string} trama - Trama enviada que se almacenará.
 */
function inserta(topic, trama) {
  // console.log('Attempting to insert:', topic, trama)

  var strSQL =
    "INSERT into trm_avant.complete_plot ( value, discriminator, status, topic, plot_date  ) VALUES($1, $2, $3, $4, now()) RETURNING id";
  var valores = [trama, config.discriminator, "N", topic];
  // console.log(strSQL)
  //console.log(valores)

  console.log("Executing query...");

  pool.query(strSQL, valores, (err, res) => {
    console.log("Query completed!");
    var fs = require("fs");
    var logEntry =
      topic + ";" + trama + ";" + config.discriminator + ";" + Date.now() + ";";

    if (!err) {
      console.log("✅ inserción correcta - ID:", res.rows[0].id);
      logEntry += "SUCCESS";
    } else {
      console.log("❌ inserción Incorrecta");
      console.log("Error message:", err.message);
      console.log("Error code:", err.code);
      console.log("Error detail:", err.detail);
      console.log("Error hint:", err.hint);
      logEntry += err.code || "UNKNOWN_ERROR";
    }

    fs.appendFile(dbLogPath, logEntry + "\n", function (err) {
      if (err) {
        console.log("❌ Failed to write to log file:", err.message);
      } else {
        console.log("📝 Log entry written to file");
      }
    });
  });
}

function logger(logEntry) {
  var fs = require("fs");
  const log = now.toString() + " - " + logEntry;
  fs.appendFile(detailedLogPath, log + "\n", function (err) {
    if (err) {
      console.log("❌ Failed to write to log file:", err.message);
    } else {
      console.log("📝 Log entry written to file");
    }
  });
}

/**
 * Processes an authentication frame
 * @param {object} trama - Parsed frame object
 * @param {Buffer} message - Original message buffer
 * @param {object} config - Server configuration
 * @returns {object} { respuesta: string, logEntry: string }
 */
function processAuthenticationFrame(trama, message, config) {
  let respuesta = "";
  let logEntry = "";

  // Validate authentication frame before processing
  const authValidation = validateAuthenticationFrame(trama, message.toString("hex"), config);
  
  if (!authValidation.valid) {
    logEntry = `❌ Authentication failed: ${authValidation.reason}`;
    console.error(logEntry);
    logger(logEntry);
    respuesta = buildNACK(trama);
    return { respuesta, logEntry };
  }
  
  trama.topic = getName(message.toString("hex"));

  logEntry = "Trama de autenticación " + trama.topic;
  console.log(logEntry);
  
  // Parse authentication data (user, password, etc.)
  trama = parseAutenticacion(message.toString("hex"), trama);

  // buildAutenticacion now handles session creation with topic
  respuesta = buildAutenticacion(trama, generateSequentialSessionId);
  
  if (!respuesta) {
    // Failed to generate session ID
    logEntry = "Error: Failed to generate session ID";
    console.error(logEntry);
    logger(logEntry);
    respuesta = buildNACK(trama);
    return { respuesta, logEntry };
  }
  
  // Session is already created in buildAutenticacion with topic
  // Just get session info for logging
  const sessionKey = getSessionKey(trama.idSessionH, trama.idSessionL);
  if (sessionKey) {
    const session = getSession(trama.idSessionH, trama.idSessionL);
    logEntry += ` | Session: ${sessionKey}, FrameId: ${session?.lastFrameId || "00"}`;
  }

  return { respuesta, logEntry };
}

/**
 * Processes an ASK (configuration request) frame
 * @param {object} trama - Parsed frame object
 * @returns {object} { respuesta: string, logEntry: string }
 */
function processAskFrame(trama) {
  let respuesta = "";
  let logEntry = "Trama de petición de configuración";
  console.log(logEntry);

  // Clear waitingForAsk flag if this is the ASK after authentication
  if (trama.idSessionH && trama.idSessionL) {
    clearWaitingForAsk(trama.idSessionH, trama.idSessionL);
  }

  // ASK always gets ACK response
  respuesta = buildACK(trama);
  if (!respuesta) {
    // If buildACK returns null (session not found), create ACK anyway
    // This shouldn't happen after authentication, but ensures ASK always gets ACK
    console.warn("⚠️ Session not found in activeSessions for ASK, creating ACK anyway");
    let ackResponse = {};
    ackResponse.idTrama = tConst.CODE_S_ACK;
    ackResponse.ack = tConst.CODE_OK;
    ackResponse.idFrame = trama.idFrame || "00";
    ackResponse.idSessionH = trama.idSessionH || "00";
    ackResponse.idSessionL = trama.idSessionL || "00";
    ackResponse.size = "0000";
    ackResponse.value = "";
    const cadena = buildTrama(ackResponse, false);
    respuesta = cadena + calcularCRC(cadena);
    
    // Store the manually created ACK as last message for RACK resend
    if (trama.idSessionH && trama.idSessionL) {
      setSessionLastMessage(trama.idSessionH, trama.idSessionL, respuesta);
    }
  }

  return { respuesta, logEntry };
}

/**
 * Processes a RACK (resend ASK) frame
 * Resends the last ASK ACK response that was sent to the session
 * @param {object} trama - Parsed frame object
 * @returns {object} { respuesta: string, logEntry: string }
 */
function processRackFrame(trama) {
  let respuesta = "";
  let logEntry = "Trama de petición de reenvío";
  console.log(logEntry);
  
  // Try to get the last message (should be the ASK ACK response)
  respuesta = buildLastResponse(trama);
  
  // If no last message found, send ACK anyway (like ASK does)
  // This handles edge cases where last message wasn't stored
  if (!respuesta) {
    console.warn("⚠️ No last message found for RACK, sending ACK instead");
    respuesta = buildACK(trama);
    if (!respuesta) {
      // If buildACK also fails, create ACK manually
      console.warn("⚠️ Session not found for RACK, creating ACK anyway");
      let ackResponse = {};
      ackResponse.idTrama = tConst.CODE_S_ACK;
      ackResponse.ack = tConst.CODE_OK;
      ackResponse.idFrame = trama.idFrame || "00";
      ackResponse.idSessionH = trama.idSessionH || "00";
      ackResponse.idSessionL = trama.idSessionL || "00";
      ackResponse.size = "0000";
      ackResponse.value = "";
      const cadena = buildTrama(ackResponse, false);
      respuesta = cadena + calcularCRC(cadena);
    }
  }

  return { respuesta, logEntry };
}

/**
 * Calculates the expected next frame ID (increments and wraps at 255)
 * @param {string} lastFrameId - Last frame ID received (2 hex chars, e.g., "00", "FF")
 * @returns {string} Expected next frame ID (2 hex chars)
 */
function getExpectedNextFrameId(lastFrameId) {
  if (!lastFrameId) return "01"; // If no last frame ID, first expected is 01 (after auth with 00)
  
  let num = parseInt(lastFrameId, 16);
  num = (num + 1) % 256; // Increment and wrap at 255 (0xFF)
  return num.toString(16).toLowerCase().padStart(2, "0");
}

/**
 * Validates if a frame ID is in order (matches expected next frame ID)
 * @param {object} trama - Parsed frame object
 * @returns {boolean} True if frame ID is in order, false if out of order
 */
function validateFrameIdOrder(trama) {
  // Authentication frames always use frame ID "00" - no order check needed
  if (trama.idTrama && trama.idTrama.toLowerCase() === tConst.CODE_R_AUTH) {
    return true;
  }

  // Get session to check last frame ID
  if (!trama.idSessionH || !trama.idSessionL) {
    return false; // No session ID, will be caught by other validation
  }

  const session = getSession(trama.idSessionH, trama.idSessionL);
  if (!session) {
    return false; // No session, will be caught by other validation
  }

  const lastFrameId = session.lastFrameId || "00";
  const expectedFrameId = getExpectedNextFrameId(lastFrameId);
  const receivedFrameId = (trama.idFrame || "00").toLowerCase();

  if (receivedFrameId !== expectedFrameId) {
    console.warn(`⚠️ Frame ID out of order: expected ${expectedFrameId}, received ${receivedFrameId} (Session: ${trama.idSessionH}${trama.idSessionL}, Last: ${lastFrameId})`);
    return false;
  }

  return true;
}

/**
 * Validates if a frame requires an active session
 * Non-authentication frames must have an active session, otherwise they are discarded
 * @param {object} trama - Parsed frame object
 * @returns {boolean} True if frame should be processed, false if it should be discarded (no response)
 */
function validateFrameRequiresActiveSession(trama) {
  // Authentication frames don't require an existing session
  if (trama.idTrama && trama.idTrama.toLowerCase() === tConst.CODE_R_AUTH) {
    return true;
  }

  // All other frames require an active session
  if (!trama.idSessionH || !trama.idSessionL) {
    // Frame has no session ID, discard it
    console.warn(`⚠️ Frame discarded: No session ID provided (Frame type: ${trama.idTrama})`);
    return false;
  }

  // Check if session exists in activeSessions
  const hasActiveSession = sessionExists(trama.idSessionH, trama.idSessionL);
  if (!hasActiveSession) {
    console.warn(`⚠️ Frame discarded: No active session found for ${trama.idSessionH}${trama.idSessionL} (Frame type: ${trama.idTrama}, Frame ID: ${trama.idFrame})`);
    return false;
  }

  return true;
}

function validateAuthenticationFrame(trama, messageHex, config) {
  // Check 1: Frame ID must be 0 (00 in hex)
  if (trama.idFrame !== "00") {
    return {
      valid: false,
      reason: `Invalid frame ID: expected 00, got ${trama.idFrame}`,
    };
  }
  
  // Check 2: User and password must be configured
  if (!config.authUser || !config.authPassword) {
    return {
      valid: false,
      reason: "Authentication credentials not configured in server",
    };
  }
  
  // Parse authentication data to extract user and password
  const authData = parseAutenticacion(messageHex, {});
  
  if (!authData.usuario || !authData.password) {
    return {
      valid: false,
      reason: "Could not extract user or password from authentication frame",
    };
  }
  
  // Convert hex strings to ASCII (remove null padding)
  const receivedUser = Buffer.from(authData.usuario, "hex")
    .toString("ascii")
    .replace(/\x00+$/, "");
  const receivedPassword = Buffer.from(authData.password, "hex")
    .toString("ascii")
    .replace(/\x00+$/, "");
  
  // Check 3: Validate user
  if (receivedUser !== config.authUser) {
    return {
      valid: false,
      reason: `Invalid user: expected '${config.authUser}', got '${receivedUser}'`,
    };
  }
  
  // Check 4: Validate password
  if (receivedPassword !== config.authPassword) {
    return {
      valid: false,
      reason: "Invalid password",
    };
  }
  
  console.log(`✅ Authentication validated: user '${receivedUser}'`);
  return { valid: true, reason: "" };
}

/**
 * Función que decodifica el mensaje recibido, y contesta dependiendo del tipo de mensaje
 *
 * @param {string} message - trama recibida
 * @returns
 */
async function processTstProtocol(message) {
  logger(separacion);

  let respuesta = "";
  let logEntry = "Received - " + message;
  logger(logEntry);
  //Dividimos la trama en su modo más genérico
  const parseResult = parseTrama(message.toString("hex"));
  
  // Check if parsing was successful
  if (!parseResult.success || !parseResult.trama || !parseResult.trama.idTrama) {
    respuesta = buildNACKDesdeMensaje(message);
    
    // Log meaningful error message
    if (parseResult.error) {
      logEntry = `❌ Frame parsing failed: ${parseResult.error}`;
    } else {
      logEntry = "❌ Frame parsing failed: Invalid frame structure";
    }
    console.error(logEntry);
    logger(logEntry);
    logger(respuesta);
    const buffer = Buffer.from(respuesta, "hex");
    return buffer;
  }
  
  // Extract trama from successful parse result
  let trama = parseResult.trama;
  console.log(trama);

  // Validate that non-authentication frames have an active session
  // If validation fails, discard frame silently (no response)
  if (!validateFrameRequiresActiveSession(trama)) {
    logEntry = `🚫 Frame discarded: No active session (Frame type: ${trama.idTrama}, Session: ${trama.idSessionH || "??"}${trama.idSessionL || "??"})`;
    console.warn(logEntry);
    logger(logEntry);
    // Return null to indicate no response should be sent
    return null;
  }

  // Validate frame ID order (check for out-of-order frames)
  // If validation fails, discard frame silently (no response)
  if (!validateFrameIdOrder(trama)) {
    logEntry = `🚫 Frame discarded: Frame ID out of order (Frame type: ${trama.idTrama}, Session: ${trama.idSessionH}${trama.idSessionL}, Frame ID: ${trama.idFrame})`;
    console.warn(logEntry);
    logger(logEntry);
    // Return null to indicate no response should be sent
    return null;
  }

  //buscamos sessionH y sessionL de la trama
  let insertTopic = findName(trama);
  //  console.log(`insertTopic: ${insertTopic}`);
  console.log(`topic: ${insertTopic}`);

  // Check if session is waiting for ASK after authentication
  // If waiting for ASK and frame is not ASK, discard it
  if (
    trama.idSessionH &&
    trama.idSessionL &&
    trama.idTrama.toLowerCase() !== tConst.CODE_R_AUTH &&
    isWaitingForAsk(trama.idSessionH, trama.idSessionL)
  ) {
    if (trama.idTrama.toLowerCase() !== tConst.CODE_R_ASK) {
      logEntry = `❌ Invalid frame after authentication: expected ASK (${tConst.CODE_R_ASK}), got ${trama.idTrama}`;
      console.error(logEntry);
      logger(logEntry);
      respuesta = buildNACK(trama);
      const buffer = Buffer.from(respuesta, "hex");
      return buffer;
    }
  }

  // hasta este punto, los mensajes no están asociados a una trama,
  // así que no podemos guardarlos para reenviar
  // a partir de este punto, en trama tendremos un campo .lastMessage, con el último mensaje enviado

  logEntry = "";
  logEntry += trama.idTrama ? "idTrama - " + trama.idTrama : "" + " | ";
  logEntry += trama.ack ? "ack - " + trama.ack : "" + " | ";
  logEntry += trama.idFrame ? "idFrame - " + trama.idFrame : "" + " | ";
  logEntry += trama.idSessionH
    ? "idSessionH - " + trama.idSessionH
    : "" + " | ";
  logEntry += trama.idSessionL
    ? "idSessionL - " + trama.idSessionL
    : "" + " | ";
  logEntry += trama.size ? "size - " + trama.size : "" + " | ";
  logEntry += trama.crc ? "crc - " + trama.crc : "" + " | ";
  logEntry += trama.value ? "value - " + trama.value : "";
  logger(logEntry);

  switch (trama.idTrama ? trama.idTrama.toLowerCase() : undefined) {
    case tConst.CODE_R_AUTH: // Trama de autenticación
      const authResult = processAuthenticationFrame(trama, message, config);
      respuesta = authResult.respuesta;
      logEntry = authResult.logEntry;
      break;
    case tConst.CODE_R_ASK: // Trama de petición de configuración
      const askResult = processAskFrame(trama);
      respuesta = askResult.respuesta;
      logEntry = askResult.logEntry;
      break;
    case tConst.CODE_R_INFO: // Trama de información
      logEntry = "Trama de información";
      console.log(logEntry);

      respuesta = buildACK(trama);
      break;
    case tConst.CODE_R_RACK: // Trama de petición de reenvío ASK
      const rackResult = processRackFrame(trama);
      respuesta = rackResult.respuesta;
      logEntry = rackResult.logEntry;
      break;
    case tConst.CODE_R_READ: // Trama de lectura sin agrupar
      logEntry = "Trama de lectura sin agrupar";
      console.log(logEntry);

      inserta(insertTopic, trama.value);
      respuesta = buildACK(trama);
      break;
    case tConst.CODE_R_GROUP: // Trama de lecturas agrupadas
      logEntry = "Trama de lecturas agrupadas";
      console.log(logEntry);

      let tramas = getTramas(trama);
      console.log(`tramas recibidas`);

      console.log(tramas);

      for (let element of tramas) {
        console.log(element);

        inserta(insertTopic, element.value);
      }
      console.log("acabó el for");

      respuesta = buildACK(trama);
      break;
    case tConst.CODE_R_FOTA: // Petición de tramas en modo FOTA
      logEntry = "Petición de tramas en modo FOTA";
      console.log(logEntry);

      respuesta = buildACK(trama);
      break;
    case tConst.CODE_R_ENDS: // Trama de Fin de Sesión
      logEntry = "Trama de Fin de Sesión";
      console.log(logEntry);
      buildEnd(trama); //no devuelve, elimina el elemento de la lista de conversaciones
      
      // Remove session from activeSessions dictionary
      const removed = removeSession(trama.idSessionH, trama.idSessionL);
      if (removed) {
        const sessionKey = getSessionKey(trama.idSessionH, trama.idSessionL);
        logEntry += ` | Session removed: ${sessionKey}`;
      }
      break;
    default:
      logEntry = "Trama no reconocida";
      console.log(logEntry);

      respuesta = buildNACK(trama);
      break;
  }

  if (!respuesta) respuesta = buildNACK(trama);

  // Update last frame ID for non-authentication messages if session exists
  // (Session validation will be added in a later step)
  if (trama.idTrama && trama.idTrama.toLowerCase() !== tConst.CODE_R_AUTH) {
    updateSessionFrameId(trama.idSessionH, trama.idSessionL, trama.idFrame);
  }

  logger(logEntry);
  logger(respuesta);

  const buffer = Buffer.from(respuesta, "hex");
  console.log("activeSessions:", activeSessions);
  return buffer;
}

export { processTstProtocol };
