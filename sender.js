import fetch from "node-fetch";
import { calcularCRC } from "./src/tst.js";

const API_URL1 = "http://mgapi.hostsolucion.com/";
const API_URL2 = "http://localhost:3005/";
const API_URL3 = "http://10.0.70.99:3005/";
const API_URL4 = "http://104.21.53.141/";
const API_URL = API_URL1;

const charPerByte = 2;
const hexOpciones = {
  auth: "d00000000067003836313531383034303937363837390000000000007573657200000000000000000000000000000000007061737300000000000000000000000000000000004e6f6d627265416c417a6172000000000000000000000000000000000000000000000000000000009081",
  ask: "c000010029000013c4",
  info: "b0000100290101a75b776303000000050000000c000000682f00000000000008000000000000000000000001000000050000000300000032000000a7ffffff00000000b60c0000f9ffffffa5ffffff0b000000a0a65705000000003839333430313230313231313530303031353300003231343033323539353030303631390000000000003139313042303853494d3730323047000000000000000000000000000000000000000000000000000000000000000000000000010000000a0000003231343033000000000000696f742e696e7465726e65742e6573000000000000000000000000000000000000000000000000000030303131313031300030303031303030300000007dd2",
  trama:
    "a2010000005100945b776369070000005653435a31343034393737320952433030303038353936353832382c312c2d35095831303230094130094630343130094250313456413034393737324509516030094339303a360d812f",
  grupo:
    "e0040400292e01a0010000004d00945b7763ae020000005653454c31373032343532320952433030303030302e31343130373009583330353109413009516f3009463132373209424a31375941303234353232560943333636320db1fda0010000004300945b7763d7040000005653435a30323131373831300952433030303035353235343832342c322c2d320958323032310941300946303331390951603009433f3e373e0dad82a0010000005100945b776369070000005653435a31343034393737320952433030303038353936353832382c312c2d35095831303230094130094630343130094250313456413034393737324509516030094339303a360d812fa0010000002900945b77635d0900000030303032383830303837303138373538383134303030333330303030333131330ebe1a95",
  fallo: "cc00010029000013c4",
  end: "c200000000000016F6",
};

// Convierte string ASCII a hexadecimal y lo rellena hasta lengthBytes con 0x00
function asciiToHexRellenado(str, lengthBytes) {
  const buf = Buffer.from(str + "\x00", "ascii");
  const relleno = Buffer.alloc(Math.max(lengthBytes - buf.length, 0), 0x00);
  return Buffer.concat([buf, relleno]).toString("hex");
}

function modificarTrama(baseHex, { idSession, name }) {
  let trama = "";
  trama += baseHex.slice(0 * charPerByte, 2 * charPerByte);
  trama += idSession;
  if (name && name.length > 0) {
    trama += baseHex.slice(5 * charPerByte, 70 * charPerByte);
    trama += asciiToHexRellenado(name, 40);
    trama += baseHex.slice(110 * charPerByte);
  } else {
    trama += baseHex.slice(5 * charPerByte);
  }
  // Recalcular CRC (últimos 2 bytes)
  trama = trama.slice(0, -4);
  const crc = calcularCRC(trama);
  trama = trama + crc;

  return trama.toLowerCase();
}

const opcion = process.argv[2] || "fallo"; // por defecto 'a' si no se pasa nada
const idSession = process.argv[3] || "000000"; // Frame, SesionH, SesionL
const name =
  process.argv[4] && process.argv[4].length > 0 ? process.argv[4] : null;

let hex = hexOpciones[opcion].toLowerCase();

if (!hex) {
  console.error(`Opción inválida: ${opcion}`);
  process.exit(1);
}

hex = modificarTrama(hex, {
  idSession,
  name,
});

console.log(`Enviando ${hex}`);
const url = `${API_URL}${encodeURIComponent(hex)}`;

async function enviarHex() {
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const respuesta = Buffer.from(buffer).toString("hex");
    console.log("Respuesta recibida:");
    console.log(`buffer : ${buffer}`);
    console.log(`respuesta: ${respuesta}`);
    console.log(`Responder a ${respuesta.slice(4, 10)}`);
  } catch (err) {
    console.error("Error al enviar GET:", err.message);
  }
}

enviarHex();
