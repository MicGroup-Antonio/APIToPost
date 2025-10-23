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

const charPerByte = 2;
const id = {
  Autenticacion: "d0",
  ASK: "c0",
  LecturaSimple: "a2",
  LecturaAgrupada: "e0",
  End: "c2",
};

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
 * @returns { idTrama, ack, idFrame, idSessionH, idSessionL, size, value, crc }
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
  // console.log({
  //   sizeStr: trama.size,
  //   sizeValue,
  //   valueLength: trama.value.length,
  //   remaining: cadena.length - offset,
  // });
  if (trama.crc == calcularCRC(cadena.substr(0, offset))) return trama;
  return null;
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
function findName(trama, callStack) {
  // console.log("findName");
  // console.log(trama);
  // console.log(callStack);

  if (!callStack || callStack.length < 1) return null;
  let element = callStack.find(
    (element) =>
      element.idSessionH === trama.idSessionH &&
      element.idSessionL === trama.idSessionL
  );

  if (!element) return null;
  return element.topic;
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
    const actual = parseTrama(grupoDeTramas.value.substr(offset));
    response.push(actual);

    const sizeValue = getSizeFromLittleEndian(actual.size);
    //sizeValue quita exactamente los caracteres de Value, tenemos que quitar la cabecera y el crc además de sizeValue
    offset += (7 + 2) * charPerByte + sizeValue;

    // console.log(actual);
    // console.log(`offset: ${offset}`);
    // console.log(`totalSize: ${totalSize}`);
  }
  return response;
}
/* -------------------------- Parseadores-------------------------- */

/* -------------------------- Contestadores------------------------ */
function buildAutenticacion(trama, callStack) {
  //si ya estaba autenticado, borro la sesión para empezar de nuevo
  let index = callStack.indexOf((element) => element.topic === trama.topic);
  if (index >= 0) callStack.splice(index, 1);

  //miramos si ya estaba la trama en el callstack (no recibieron confirmación)
  let id = "";
  id = generarIdUnico(callStack);
  trama.idSessionH = id.slice(0, 2);
  trama.idSessionL = id.slice(2, 4);
  callStack.push(trama);

  return buildACK(trama, callStack);
}

function buildEnd(trama, callStack) {
  //quitamos la sesión de la trama, no devolvemos por que es fin de transmisión
  let index = callStack.indexOf((element) => element.topic === trama.topic);
  if (index >= 0) callStack.splice(index, 1);
}

function buildACK(trama, callStack) {
  //buscamos en el callStack la sesión, para actualizarla
  let session = callStack.find(
    (element) =>
      element.idSessionH === trama.idSessionH &&
      element.idSessionL === trama.idSessionL
  );
  if (!session || session === undefined) return null;

  session.idFrame = trama.idFrame;
  session.idTrama = trama.idTrama;

  let respuesta = {};
  respuesta.idTrama = "41";
  respuesta.ack = "00";
  respuesta.idFrame = session.idFrame;
  respuesta.idSessionH = session.idSessionH;
  respuesta.idSessionL = session.idSessionL;
  respuesta.size = "0000";
  respuesta.value = "";

  const cadena = buildTrama(respuesta, false);
  return cadena + calcularCRC(cadena);
}
function buildNACK(trama) {
  let respuesta = {};
  respuesta.idTrama = "41";
  respuesta.ack = "10";
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
  respuesta.idTrama = "41";
  respuesta.ack = "10";
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
  id,
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
  buildACK,
  buildNACK,
  buildNACKDesdeMensaje,
};
