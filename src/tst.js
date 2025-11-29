/**
 * El formato base de la trama es
 * const trama = {
 *   idTrama: null,    // tipo de trama
 *   ack: null,        //
 *   idFrame: null,    // identificador del nº de trama dentro de la comunicación
 *   idSessionH: null, // id de la sesión, creado por el servidor
 *   idSessionL: null, // id de la sesión, creado por el servidor
 *   size: null,
 *   value: null,
 *   crc: null
 * };
 * a partir de ahí se irá ampliando dependiendo de las funciones
 */
import * as tConst from "./const.js";
import {
  getSessionTopic,
  setSessionTopic,
  getSessionLastMessage,
  setSessionLastMessage,
  createOrUpdateSession,
  updateSessionFrameId,
  removeSession,
  getSession,
} from "./sessionManager.js";
const charPerByte = 2;

/* -------------------------- Auxiliares -------------------------- */
function esTST(topic) {
  const cadenaAntigua = "TST/OMS/";
  if (topic.substr(0, cadenaAntigua.length) === cadenaAntigua) return false;
  return true;
}

/**
 * Calcula el CRC de una trama
 * @param string Trama completa, excluyendo los 4 últimos caracteres(crc)
 * @param boolean littleEndian
 * @returns
 */
function calcularCRC(hexString, littleEndian = true) {
  const genpoly = 0x1021;
  let accum = 0;

  // 🔹 Convertir cada par de caracteres en un byte
  const buffer = [];
  for (let i = 0; i < hexString.length; i += charPerByte) {
    buffer.push(parseInt(hexString.substr(i, charPerByte), 16));
  }

  // 🔹 Calcular CRC
  for (let pos = 0; pos < buffer.length; pos++) {
    let data = buffer[pos] << 8;
    for (let i = 0; i < 8; i++) {
      if ((data ^ accum) & 0x8000) {
        accum = ((accum << 1) ^ genpoly) & 0xffff;
      } else {
        accum = (accum << 1) & 0xffff;
      }
      data = (data << 1) & 0xffff;
    }
  }

  // 🔹 Convertir a hexadecimal
  let crcHex = accum.toString(16).toLowerCase().padStart(4, "0");

  // 🔹 Si la trama está en little endian → invertir los bytes
  if (littleEndian) {
    crcHex =
      crcHex.slice(charPerByte, charPerByte * 2) + crcHex.slice(0, charPerByte);
  }

  return crcHex;
}

function generarIdUnico(arr) {
  if (!arr && arr.length == 0)
    return Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toLowerCase()
      .padStart(4, "0");

  const usados = new Set(arr.map((tr) => tr.idSessionH + tr.idSessionL));

  let nuevoId;
  do {
    nuevoId = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toLowerCase()
      .padStart(4, "0");
  } while (usados.has(nuevoId));

  return nuevoId;
}
/* -------------------------- Auxiliares -------------------------- */

/* -------------------------- Parseadores-------------------------- */
function buildTrama(trama, incluyeCRC = true) {
  // console.log("buildTrama");
  // console.log(trama);

  let cadena = "";

  cadena += trama.idTrama;
  cadena += trama.ack;
  cadena += trama.idFrame;
  cadena += trama.idSessionH;
  cadena += trama.idSessionL;
  cadena += trama.size;
  cadena += trama.value;
  if (incluyeCRC) cadena += trama.crc;

  return cadena;
}

/**
 * Recibe una cadena y divide la trama en los valores correspondientes
 * @param String cadena
 * @returns { success: boolean, trama: object | null, error: string | null }
 *          On success: { success: true, trama: {...}, error: null }
 *          On failure: { success: false, trama: null, error: "error message" }
 */
function parseTrama(cadena) {
  const trama = {};

  let offset = 0;

  trama.idTrama = cadena.substr(offset, charPerByte);
  offset += charPerByte;
  trama.ack = cadena.substr(offset, charPerByte);
  offset += charPerByte;
  trama.idFrame = cadena.substr(offset, charPerByte);
  offset += charPerByte;
  trama.idSessionH = cadena.substr(offset, charPerByte);
  offset += charPerByte;
  trama.idSessionL = cadena.substr(offset, charPerByte);
  offset += charPerByte;
  trama.size = cadena.substr(offset, 2 * charPerByte);
  offset += 2 * charPerByte;

  const sizeValue = getSizeFromLittleEndian(trama.size);
  trama.value = cadena.substr(offset, sizeValue);
  offset += sizeValue;

  trama.crc = cadena.substr(offset, 2 * charPerByte);
  
  // Validate CRC
  const frameWithoutCrc = cadena.substr(0, offset);
  const expectedCrc = calcularCRC(frameWithoutCrc);
  const receivedCrc = trama.crc.toLowerCase();
  const expectedCrcLower = expectedCrc.toLowerCase();
  
  if (receivedCrc !== expectedCrcLower) {
    const errorMessage = `CRC validation failed: expected ${expectedCrcLower}, received ${receivedCrc}. Frame type: ${trama.idTrama}, Frame ID: ${trama.idFrame}, Session: ${trama.idSessionH}${trama.idSessionL}`;
    return {
      success: false,
      trama: null,
      error: errorMessage
    };
  }
  
  return {
    success: true,
    trama: trama,
    error: null
  };
}

function parseAutenticacion(cadena, trama) {
  let offset = 7 * charPerByte;

  trama.iMEI = cadena.substr(offset, 21 * charPerByte);
  offset += 21 * charPerByte;

  trama.usuario = cadena.substr(offset, 21 * charPerByte);
  offset += 21 * charPerByte;

  trama.password = cadena.substr(offset, 21 * charPerByte);
  offset += 21 * charPerByte;

  trama.name = cadena.substr(offset, 40 * charPerByte);
  offset += 40 * charPerByte;

  return trama;
}

function getSizeFromLittleEndian(sizeStr) {
  const size =
    sizeStr.substr(charPerByte, charPerByte) + sizeStr.substr(0, charPerByte);
  return parseInt(size, 16) * charPerByte;
}

function getName(tramaCompleta) {
  const offset = 70 * charPerByte;

  const hexName = tramaCompleta.substr(offset, 40 * charPerByte);
  const name = Buffer.from(hexName, "hex").toString("ascii");

  return name.replace(/\x00+$/, "");
}
function findName(trama) {
  // Find topic using activeSessions instead of callStack
  if (!trama.idSessionH || !trama.idSessionL) return null;
  return getSessionTopic(trama.idSessionH, trama.idSessionL);
}

function getTramas(grupoDeTramas) {
  //en cadena.valor están todas las lecturas, habiendo quitado la cabecera del agrupamiento
  //en cadena.size está el tamaño de todas las lecturas agrupadas

  //  console.log("getTramas");
  //  console.log(grupoDeTramas);

  const totalSize = getSizeFromLittleEndian(grupoDeTramas.size);
  let offset = 0;
  let response = [];

  //  console.log(`offset: ${offset}`);
  //  console.log(`totalSize: ${totalSize}`);

  while (offset < totalSize) {
    const parseResult = parseTrama(grupoDeTramas.value.substr(offset));
    
    // Only process successfully parsed tramas
    if (parseResult.success && parseResult.trama) {
      response.push(parseResult.trama);
      const sizeValue = getSizeFromLittleEndian(parseResult.trama.size);
      //sizeValue quita exactamente los caracteres de Value, tenemos que quitar la cabecera y el crc además de sizeValue
      offset += (7 + 2) * charPerByte + sizeValue;
    } else {
      // If parsing fails, log error and break to avoid infinite loop
      if (parseResult.error) {
        console.error(`❌ Error parsing grouped trama at offset ${offset}: ${parseResult.error}`);
      } else {
        console.error(`❌ Error parsing grouped trama at offset ${offset}: Invalid frame structure`);
      }
      // Break to avoid infinite loop if we can't parse the frame
      break;
    }

    // console.log(actual);
    // console.log(`offset: ${offset}`);
    // console.log(`totalSize: ${totalSize}`);
  }
  return response;
}
/* -------------------------- Parseadores-------------------------- */

/* -------------------------- Contestadores------------------------ */
function buildAutenticacion(trama, generateSequentialSessionId) {
  // If already authenticated with same topic, remove old session
  // (This is handled by createOrUpdateSession which overwrites existing sessions)

  // Generate sequential session ID from server
  // Session ID is a 2-byte number split into high (H) and low (L) bytes
  const sessionIds = generateSequentialSessionId();
  if (!sessionIds) {
    console.error("❌ Failed to generate session ID for authentication");
    return null;
  }
  
  trama.idSessionH = sessionIds.idSessionH;
  trama.idSessionL = sessionIds.idSessionL;

  // Create session in activeSessions with topic
  createOrUpdateSession(trama.idSessionH, trama.idSessionL, trama.idFrame, trama.topic);

  let response = buildACK(trama);
  setSessionLastMessage(trama.idSessionH, trama.idSessionL, response);
  return response;
}

function buildEnd(trama) {
  // Remove session from activeSessions (end of transmission)
  removeSession(trama.idSessionH, trama.idSessionL);
}

function buildLastResponse(trama) {
  // Get last message from activeSessions
  return getSessionLastMessage(trama.idSessionH, trama.idSessionL);
}

function buildACK(trama) {
  // Get session from activeSessions
  const session = getSession(trama.idSessionH, trama.idSessionL);
  if (!session) return null;

  // Update frame ID in session
  updateSessionFrameId(trama.idSessionH, trama.idSessionL, trama.idFrame);

  let respuesta = {};
  respuesta.idTrama = tConst.CODE_S_ACK;
  respuesta.ack = tConst.CODE_OK;
  respuesta.idFrame = trama.idFrame;
  respuesta.idSessionH = trama.idSessionH;
  respuesta.idSessionL = trama.idSessionL;
  respuesta.size = "0000";
  respuesta.value = "";

  const cadena = buildTrama(respuesta, false);
  let response = cadena + calcularCRC(cadena);
  
  // Store last message in session
  setSessionLastMessage(trama.idSessionH, trama.idSessionL, response);
  return response;
}
function buildNACK(trama) {
  let respuesta = {};
  respuesta.idTrama = tConst.CODE_S_ACK;
  respuesta.ack = tConst.CODE_NOK;
  respuesta.idFrame = trama ? trama.idFrame : null;
  respuesta.idSessionH = trama ? trama.idSessionH : null;
  respuesta.idSessionL = trama ? trama.idSessionL : null;
  respuesta.size = "0000";
  respuesta.value = "";
  const cadena = buildTrama(respuesta, false);
  return cadena + calcularCRC(cadena);
}
function buildNACKDesdeMensaje(mensaje) {
  while (mensaje.length < 10) {
    mensaje += "0";
  }
  let respuesta = {};
  respuesta.idTrama = tConst.CODE_S_ACK;
  respuesta.ack = tConst.CODE_NOK;
  respuesta.idFrame = mensaje.slice(2 * charPerByte, 3 * charPerByte);
  respuesta.idSessionH = mensaje.slice(3 * charPerByte, 4 * charPerByte);
  respuesta.idSessionL = mensaje.slice(4 * charPerByte, 5 * charPerByte);
  respuesta.size = "0000";
  respuesta.value = "";
  const cadena = buildTrama(respuesta, false);
  const res = cadena + calcularCRC(cadena);
  console.log(`res: ${res}`);

  return res;
}
/* -------------------------- Contestadores------------------------ */

export {
  esTST,
  calcularCRC,
  buildTrama,
  parseTrama,
  parseAutenticacion,
  getName,
  findName,
  getTramas,
  buildAutenticacion,
  buildEnd,
  buildLastResponse,
  buildACK,
  buildNACK,
  buildNACKDesdeMensaje,
};
