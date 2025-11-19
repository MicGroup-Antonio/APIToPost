import fetch from "node-fetch";
import { calcularCRC } from "./src/tst.js";

import readline from "readline";

const API_URL_LIST = [
  "http://mgapi.hostsolucion.com/",
  "localhost",
  "10.0.70.99",
  "104.21.53.141",
  "172.67.213.105",
];
let API_URL = API_URL_LIST[0];
let name = "NuevoNombre";
const PORT = ":3005";
const http = "http://";

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
  console.log("modificarTrama " + idSession + " " + name);

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

function incrementarIdSession() {
  // Obtener los dos primeros caracteres como número hexadecimal
  const hexa = idSession.substring(0, 2);

  // Convertir a entero base 16, sumar 1
  let num = parseInt(hexa, 16) + 1;

  // Convertir otra vez a hex y asegurarse de que quede en dos caracteres
  const nuevoHex = num.toString(16).toUpperCase().padStart(2, "0");

  // Reconstruir la idSession
  idSession = nuevoHex + idSession.substring(2);
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

const hexKeysByIndex = [
  "auth",
  "ask",
  "info",
  "trama",
  "grupo",
  "fallo",
  "end",
];
let hex = hexOpciones["auth"].toLowerCase();
let idSession = "000000";
hex = modificarTrama(hex, {
  idSession,
  name,
});
(async () => {
  let option = "";

  while (option !== "0") {
    console.clear();
    console.log("1 seleccionar dirección ip");
    console.log("2 seleccionar mensaje");
    console.log("3 modificar numero o id");
    console.log("4 Cambiar nombre de remitente");
    console.log("5 enviar");
    console.log("0 salir");
    option = await ask("Selecciona una opción: ");

    switch (option) {
      case "1":
        console.clear();
        console.log("Escoge una dirección");
        API_URL_LIST.forEach((dir, index) => {
          console.log(index + " " + dir);
        });
        console.log(API_URL_LIST.length + " Introducción manual");
        option = await ask("Selecciona una opción: ");
        const optionNumber = Number(option);
        if (
          Number.isNaN(optionNumber) ||
          optionNumber < 0 ||
          optionNumber > API_URL_LIST.length
        ) {
          console.log("Opción no válida.");
          await ask("Pulse enter para continuar ");
          option = "";
          break;
        }
        if (optionNumber === API_URL_LIST.length)
          API_URL = await ask("Introduzca la nueva IP: ");
        else API_URL = API_URL_LIST[optionNumber];
        console.log("Desea añadir el puerto 3005?");
        console.log("1 -> si");
        console.log("2 -> introducir manualmente");
        option = await ask("(cualquier otro valor) -> no ");
        if (option === "1") API_URL += PORT;
        else if (option === "2")
          API_URL += ":" + (await ask("Introduzca el puerto: "));
        option = await ask(
          "Desea añadir http:// 1->si (cualquier otro valor)->no "
        );
        if (option === "1") API_URL = http + API_URL;

        /*
        option = await ask(
          "Desea añadir '/' al final 1->si (cualquier otro valor)->no "
        );
        if (option === "1") API_URL += "/";
        */
        if (API_URL.slice(API_URL.length - 1) !== "/") API_URL += "/";
        console.log("la dirección resultante es " + API_URL);
        await ask("Pulse enter para continuar ");
        option = "";
        option = "";
        break;
      case "2":
        console.clear();
        console.log("0 - autenticación");
        console.log("1 - ask");
        console.log("2 - info");
        console.log("3 - trama simple");
        console.log("4 - trama agrupada");
        console.log("5 - mensaje fallido");
        console.log("6 - fin de transmisión");
        option = await ask("Escoge un mensaje (0-6): ");
        const idx = Number(option);
        if (Number.isNaN(idx) || idx < 0 || idx >= hexKeysByIndex.length) {
          console.error(`Opción inválida: ${option}`);
          await ask("Pulse enter para continuar ");
          option = "";
          break;
        }
        const hexKey = hexKeysByIndex[idx];
        hex = hexOpciones[hexKey].toLowerCase();
        let named = idx === 0 ? name : null;
        // console.log({ name, named, idx });
        hex = modificarTrama(hex, {
          idSession,
          name: named,
        });
        console.log(`Seleccionado: ${hexKey}`);
        await ask("Pulse enter para continuar ");
        option = "";
        break;
      case "3":
        console.clear();
        console.log(
          `Numero actual = ${idSession.substring(
            0,
            2
          )} id de sesión actual = ${idSession.substring(2, 6)}`
        );
        let newNumber = await ask(
          "Introduzca el nuevo número (deje vacía para mantener el mismo)"
        );
        let newSession = await ask(
          "Introduzca la nueva sesión (deje vacía para mantener la misma)"
        );
        newNumber =
          newNumber.length > 0 ? newNumber : idSession.substring(0, 2);

        newSession =
          newSession.length > 0 ? newSession : idSession.substring(2, 6);
        idSession = newNumber + newSession;

        console.log(`los datos resultantes son:)`);
        console.log(
          `numero ${idSession.substring(
            0,
            2
          )} id de sesión = ${idSession.substring(2, 6)}`
        );
        await ask("Pulse enter para continuar ");
        option = "";
        option = "";
        break;
      case "4":
        console.clear();
        name = await ask(`Introduzca nuevo nombre: `);
        console.log(`Recuerde mandar mensaje de auth para aplicar ${name}`);
        await ask("Pulse enter para continuar ");
        break;

      case "5":
        console.clear();
        console.log(`Enviando ${hex}`);
        const url = `${API_URL}${encodeURIComponent(hex)}`;
        async function enviarHex() {
          try {
            const res = await fetch(url);
            const buffer = await res.arrayBuffer();
            const respuesta = Buffer.from(buffer).toString("hex");
            console.log("Respuesta recibida:");
            console.log(`respuesta: ${respuesta}`);
            if (respuesta.slice(0, 2) !== "41") {
              console.log("No es ACK/NACK");
            } else if (respuesta.slice(2, 4) === "00") {
              console.log("Es ACK -- actualizamos idSesion");
              idSession = respuesta.slice(4, 10);
              incrementarIdSession();
            } else if (respuesta.slice(2, 4) === "01") {
              console.log("Es NACK");
            } else
              console.log(
                `Codigo ${respuesta.slice(0, 2)} -  ${respuesta.slice(
                  2,
                  4
                )} desconocido`
              );
            console.log(
              `idSession recibido = ${respuesta.slice(
                4,
                10
              )} nuevo idSession ${idSession}`
            );
          } catch (err) {
            console.error("Error al enviar GET:", err.message);
          }
        }
        await enviarHex();
        await ask("Pulse enter para continuar ");
        option = "";
        option = "";
        break;
    }
  }
  console.log("Fin del programa.");
})();
