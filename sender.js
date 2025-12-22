import dgram from "dgram";
import { calcularCRC } from "./src/tst.js";

import readline from "readline";

const HOST_LIST = [
  "mgapi.hostsolucion.com",
  "localhost",
  "10.0.70.99",
  "104.21.53.141",
  "172.67.213.105",
  "5.196.166.251",
];
let HOST = HOST_LIST[0];
let PORT = 3005;
let name = "NuevoNombre";

// Device state - mimics real device behavior
let deviceState = {
  sessionH: "00",      // Session High byte (from server)
  sessionL: "00",      // Session Low byte (from server)
  frameId: "00",       // Current frame ID (increments with each message)
  authenticated: false, // Whether device is authenticated
};

// Out-of-order testing mode: when true, frame ID won't auto-increment after sending
let outOfOrderTestingMode = false;

const charPerByte = 2;
const hexOpciones = {
  auth: "d00000000067003836313531383034303937363837390000000000007573657200000000000000000000000000000000007061737300000000000000000000000000000000004e6f6d627265416c417a6172000000000000000000000000000000000000000000000000000000009081",
  ask: "c000010029000013c4",
  info: "b0000100290101a75b776303000000050000000c000000682f00000000000008000000000000000000000001000000050000000300000032000000a7ffffff00000000b60c0000f9ffffffa5ffffff0b000000a0a65705000000003839333430313230313231313530303031353300003231343033323539353030303631390000000000003139313042303853494d3730323047000000000000000000000000000000000000000000000000000000000000000000000000010000000a0000003231343033000000000000696f742e696e7465726e65742e6573000000000000000000000000000000000000000000000000000030303131313031300030303031303030300000007dd2",
  trama:
    //"a2010000005100945b776369070000005653435a31343034393737320952433030303038353936353832382c312c2d35095831303230094130094630343130094250313456413034393737324509516030094339303a360d812f",
    //"e43a3169e72d990000ff03654424345351072384077b1600518804013603f40847d5fe11ebfb44c3a78dfc5ccfbeec5964a7cbddf3b2da1e4a7a126f81ba7e7cb2232b319d72a588349b0b307e04089a820f9ec9dffe36a7c527af2f5f254f5aa514eb2a0899620cf0f3a57b3b4f9bac0ad9",
    "5eb23c69c177480100ff03674424341363002484077b588b518804013200efd637e86b11e6d6af2a9af7db0292acdd8aa5d9576085dccd9af80fbec70a9f362861ba714919464963cd60eb2c1f88e5e6a2377b004ee3853cc07722286dc85130422230e1e4048206684062f25790df5ac2ae1e5c",
  grupo:
    //"e0040400292e01a0010000004d00945b7763ae020000005653454c31373032343532320952433030303030302e31343130373009583330353109413009516f3009463132373209424a31375941303234353232560943333636320db1fda0010000004300945b7763d7040000005653435a30323131373831300952433030303035353235343832342c322c2d320958323032310941300946303331390951603009433f3e373e0dad82a0010000005100945b776369070000005653435a31343034393737320952433030303038353936353832382c312c2d35095831303230094130094630343130094250313456413034393737324509516030094339303a360d812fa0010000002900945b77635d0900000030303032383830303837303138373538383134303030333330303030333131330ebe1a95",
    "e0051200049902a20014000374005eb23c69ec35450100ff03674424342163002484077b568b518804013000f2220ebd7bc65efbefe85ec76c4f0ffb452fa22a646ac9e555f0f05ea5be291095fd89fb80af159b7ad607a67781dfe63ac418652676f410aea309f379d63ebb54a4f38c61dba63438645ca4d45021b5de5ab09e33a294f5a20014000372005eb23c695720460100ff03654424348751002484077b58005188040132006a9194989102a749a7ce4cb858cddf6864d0d150cc0970201f1adf4adc3ac70b53ca85a8f23271afe09087b3726de71e267619e6f0b41613478c8641023586eb088a1356d3d1fa7a701c030d3ff5de5a3fb83a3af6caa20014000389005eb23c69e66e470100ff037c4424342120702587077b7100518800a0000a068cd130968af9d137d124fbd4453e77496a450a4c3527a249a4547d837ba16f0ba31c30c679917c7e8ab70ce1a2569fcb619131e4a1d3bfe1374af74d2b57e735eafc8fbbba369300a01362f44aefe89e29807919396c61a814c6810f131070bab81e24d9df5a9d49213df1a2a20014000389005eb23c695619480100ff037c4424343020702587077b7100518800a000b36df68ab62cbf7be2ee93aac61373b09dc15aec793500d78cffd503dfe038ede296659def1d83c34b7e90cbaafbf236bef10760a0e482099165d66c87fbc84d362618cd5d6536d3ac3180f8b4734d6270ce2660e26628b95a77faf633c821776725b4285ddadf5a73af36548e58a20014000374005eb23c69c177480100ff03674424341363002484077b588b518804013200efd637e86b11e6d6af2a9af7db0292acdd8aa5d9576085dccd9af80fbec70a9f362861ba714919464963cd60eb2c1f88e5e6a2377b004ee3853cc07722286dc85130422230e1e4048206684062f25790df5ac2ae1e5c6369f2af",
  fallo: "cc00010029000013c4",
  end: "c200000000000016F6",
};

// Convierte string ASCII a hexadecimal y lo rellena hasta lengthBytes con 0x00
function asciiToHexRellenado(str, lengthBytes) {
  const buf = Buffer.from(str + "\x00", "ascii");
  const relleno = Buffer.alloc(Math.max(lengthBytes - buf.length, 0), 0x00);
  return Buffer.concat([buf, relleno]).toString("hex");
}

/**
 * Modifies a frame with current session ID and frame ID
 * @param {string} baseHex - Base hex frame
 * @param {string} name - Optional name for authentication frames
 * @returns {string} Modified hex frame
 */
function modificarTrama(baseHex, name = null) {
  let trama = "";
  
  // Byte 0: Frame type (keep original) - 1 byte = 2 hex chars
  trama += baseHex.slice(0 * charPerByte, 1 * charPerByte);
  
  // Byte 1: ACK status (keep original) - 1 byte = 2 hex chars
  trama += baseHex.slice(1 * charPerByte, 2 * charPerByte);
  
  // Byte 2: Frame ID (use current device frame ID) - 1 byte = 2 hex chars
  trama += deviceState.frameId;
  
  // Byte 3: Session H (use current device session) - 1 byte = 2 hex chars
  trama += deviceState.sessionH;
  
  // Byte 4: Session L (use current device session) - 1 byte = 2 hex chars
  trama += deviceState.sessionL;
  
  // Rest of the frame (from byte 5 onwards: size, value, and old CRC)
  if (name && name.length > 0) {
    // For authentication frames, insert name at offset 70 (byte 70 = 140 hex chars)
    trama += baseHex.slice(5 * charPerByte, 70 * charPerByte);
    trama += asciiToHexRellenado(name, 40);
    trama += baseHex.slice(110 * charPerByte);
  } else {
    // For non-auth frames, get everything from byte 5 onwards (includes size, value, and old CRC)
    trama += baseHex.slice(5 * charPerByte);
  }
  
  // Recalculate CRC: remove old CRC (last 4 hex chars = 2 bytes) and calculate new one
  const frameWithoutCrc = trama.slice(0, -4);
  const crc = calcularCRC(frameWithoutCrc);
  trama = frameWithoutCrc + crc;

  return trama.toLowerCase();
}

/**
 * Increments the frame ID (wraps around at 255)
 */
function incrementFrameId() {
  let num = parseInt(deviceState.frameId, 16);
  num = (num + 1) % 256; // Wrap at 255 (0xFF)
  deviceState.frameId = num.toString(16).toLowerCase().padStart(2, "0");
}

/**
 * Extracts and updates session ID and frame ID from ACK response
 * ACK response format: [idTrama(2)][ack(2)][idFrame(2)][sessionH(2)][sessionL(2)]...
 * @param {string} respuestaHex - ACK response in hex format
 */
function updateDeviceStateFromResponse(respuestaHex) {
  if (respuestaHex.length < 10) {
    console.warn("⚠️ Response too short to extract session info");
    return;
  }
  
  // Extract frame ID (byte 2, positions 4-5 in hex string)
  const frameId = respuestaHex.slice(4, 6);
  
  // Extract session H (byte 3, positions 6-7 in hex string)
  const sessionH = respuestaHex.slice(6, 8);
  
  // Extract session L (byte 4, positions 8-9 in hex string)
  const sessionL = respuestaHex.slice(8, 10);
  
  // Update device state
  deviceState.frameId = frameId;
  deviceState.sessionH = sessionH;
  deviceState.sessionL = sessionL;
  
  console.log(`📱 Device state updated: FrameID=${frameId}, Session=${sessionH}${sessionL}`);
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

// Initialize with authentication frame
let currentMessageType = "auth";
let hex = hexOpciones["auth"].toLowerCase();
// Will be modified when sending, not here
(async () => {
  let option = "";

  while (option !== "0") {
    console.clear();
    console.log("1 seleccionar dirección ip");
    console.log("2 seleccionar mensaje");
    console.log("3 modificar numero o id");
    console.log("4 Cambiar nombre de remitente");
    console.log("5 enviar");
    console.log("6 modo prueba out-of-order (sobrescribir Frame ID)");
    console.log("7 seleccionar puerto");
    console.log("0 salir");
    option = await ask("Selecciona una opción: ");

    switch (option) {
      case "1":
        console.clear();
        console.log("Escoge una dirección");
        HOST_LIST.forEach((dir, index) => {
          console.log(index + " " + dir);
        });
        console.log(HOST_LIST.length + " Introducción manual");
        option = await ask("Selecciona una opción: ");
        const optionNumber = Number(option);
        if (
          Number.isNaN(optionNumber) ||
          optionNumber < 0 ||
          optionNumber > HOST_LIST.length
        ) {
          console.log("Opción no válida.");
          await ask("Pulse enter para continuar ");
          option = "";
          break;
        }
        if (optionNumber === HOST_LIST.length)
          HOST = await ask("Introduzca la nueva IP/hostname: ");
        else HOST = HOST_LIST[optionNumber];
        
        console.log(`Configuración: ${HOST}:${PORT}`);
        await ask("Pulse enter para continuar ");
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
        currentMessageType = hexKey;
        hex = hexOpciones[hexKey].toLowerCase();
        
        // For authentication, reset frame ID to 00
        if (hexKey === "auth") {
          deviceState.frameId = "00";
          deviceState.authenticated = false;
          deviceState.sessionH = "00";
          deviceState.sessionL = "00";
        }
        
        console.log(`Seleccionado: ${hexKey}`);
        console.log(`   Frame ID actual: ${deviceState.frameId}`);
        console.log(`   Session actual: ${deviceState.sessionH}${deviceState.sessionL}`);
        console.log(`   (Se actualizará al enviar con los valores actuales del dispositivo)`);
        await ask("Pulse enter para continuar ");
        option = "";
        break;
      case "3":
        console.clear();
        console.log(`Estado actual del dispositivo:`);
        console.log(`   Frame ID: ${deviceState.frameId}`);
        console.log(`   Session: ${deviceState.sessionH}${deviceState.sessionL}`);
        console.log(`   Autenticado: ${deviceState.authenticated ? "Sí" : "No"}`);
        console.log(`   Modo out-of-order: ${outOfOrderTestingMode ? "✅ ACTIVO" : "❌ INACTIVO"}`);
        console.log(`\nNota: El Frame ID y Session se actualizan automáticamente desde las respuestas del servidor.`);
        console.log(`Solo modifique manualmente si es necesario para pruebas.`);
        if (outOfOrderTestingMode) {
          console.log(`\n⚠️  Modo out-of-order activo: El Frame ID NO se incrementará automáticamente.`);
          console.log(`   Use la opción 6 para gestionar el modo out-of-order.`);
        }
        
        let newFrameId = await ask(
          "Introduzca nuevo Frame ID (hex, 2 chars, vacío para mantener): "
        );
        let newSessionH = await ask(
          "Introduzca nuevo Session H (hex, 2 chars, vacío para mantener): "
        );
        let newSessionL = await ask(
          "Introduzca nuevo Session L (hex, 2 chars, vacío para mantener): "
        );
        
        if (newFrameId.length === 2) {
          deviceState.frameId = newFrameId.toLowerCase();
        }
        if (newSessionH.length === 2) {
          deviceState.sessionH = newSessionH.toLowerCase();
        }
        if (newSessionL.length === 2) {
          deviceState.sessionL = newSessionL.toLowerCase();
        }
        
        console.log(`Estado actualizado:`);
        console.log(`   Frame ID: ${deviceState.frameId}`);
        console.log(`   Session: ${deviceState.sessionH}${deviceState.sessionL}`);
        await ask("Pulse enter para continuar ");
        option = "";
        break;
      case "4":
        console.clear();
        name = await ask(`Introduzca nuevo nombre: `);
        console.log(`Recuerde mandar mensaje de auth para aplicar ${name}`);
        await ask("Pulse enter para continuar ");
        break;

      case "6":
        console.clear();
        console.log("═══════════════════════════════════════════════════════");
        console.log("  MODO PRUEBA OUT-OF-ORDER (Paquetes fuera de orden)");
        console.log("═══════════════════════════════════════════════════════");
        console.log("");
        console.log(`Estado actual:`);
        console.log(`   Frame ID actual: ${deviceState.frameId}`);
        console.log(`   Session: ${deviceState.sessionH}${deviceState.sessionL}`);
        console.log(`   Modo out-of-order: ${outOfOrderTestingMode ? "✅ ACTIVO" : "❌ INACTIVO"}`);
        console.log("");
        console.log("Este modo permite:");
        console.log("  • Sobrescribir el Frame ID manualmente");
        console.log("  • Enviar paquetes con Frame IDs fuera de secuencia");
        console.log("  • El Frame ID NO se incrementa automáticamente después de enviar");
        console.log("");
        console.log("Útil para probar:");
        console.log("  • Detección de paquetes fuera de orden");
        console.log("  • Manejo de Frame IDs duplicados");
        console.log("  • Validación de secuencia en el servidor");
        console.log("");
        
        const toggleMode = await ask(
          `¿Activar modo out-of-order? (s/n, actual: ${outOfOrderTestingMode ? "activo" : "inactivo"}): `
        );
        if (toggleMode.toLowerCase() === "s" || toggleMode.toLowerCase() === "si" || toggleMode.toLowerCase() === "y" || toggleMode.toLowerCase() === "yes") {
          outOfOrderTestingMode = true;
          console.log("✅ Modo out-of-order ACTIVADO");
        } else if (toggleMode.toLowerCase() === "n" || toggleMode.toLowerCase() === "no") {
          outOfOrderTestingMode = false;
          console.log("❌ Modo out-of-order DESACTIVADO");
        }
        
        if (outOfOrderTestingMode) {
          console.log("");
          const manualFrameId = await ask(
            `Introduzca Frame ID manual (hex, 2 chars, vacío para mantener ${deviceState.frameId}): `
          );
          if (manualFrameId.length === 2) {
            const oldFrameId = deviceState.frameId;
            deviceState.frameId = manualFrameId.toLowerCase();
            console.log(`✅ Frame ID cambiado: ${oldFrameId} → ${deviceState.frameId}`);
          }
          
          console.log("");
          console.log("⚠️  RECORDATORIO:");
          console.log("   • El Frame ID NO se incrementará automáticamente");
          console.log("   • Debe cambiar manualmente el Frame ID (opción 6) para cada envío");
          console.log("   • Use esto para enviar paquetes con Frame IDs fuera de secuencia");
        }
        
        await ask("Pulse enter para continuar ");
        option = "";
        break;

      case "7":
        console.clear();
        console.log("Seleccione el puerto:");
        console.log("1 -> 3005");
        console.log("2 -> 3006");
        console.log("3 -> introducir manualmente");
        option = await ask("Selecciona una opción: ");
        if (option === "1") {
          PORT = 3005;
          console.log(`Puerto configurado: ${PORT}`);
        } else if (option === "2") {
          PORT = 3006;
          console.log(`Puerto configurado: ${PORT}`);
        } else if (option === "3") {
          const portInput = await ask("Introduzca el puerto: ");
          const newPort = Number(portInput);
          if (!Number.isNaN(newPort) && newPort > 0 && newPort < 65536) {
            PORT = newPort;
            console.log(`Puerto configurado: ${PORT}`);
          } else {
            console.log("Puerto inválido. Se mantiene el puerto actual.");
          }
        } else {
          console.log("Opción no válida. Se mantiene el puerto actual.");
        }
        console.log(`Configuración actual: ${HOST}:${PORT}`);
        await ask("Pulse enter para continuar ");
        option = "";
        break;

      case "5":
        console.clear();
        
        // Update frame with current device state before sending
        const baseHex = hexOpciones[currentMessageType].toLowerCase();
        hex = modificarTrama(baseHex, currentMessageType === "auth" ? name : null);
        
        console.log(`📤 Enviando mensaje:`);
        console.log(`   Tipo: ${currentMessageType}`);
        console.log(`   Frame ID: ${deviceState.frameId}${outOfOrderTestingMode ? " (modo out-of-order)" : ""}`);
        console.log(`   Session: ${deviceState.sessionH}${deviceState.sessionL}`);
        if (outOfOrderTestingMode) {
          console.log(`   ⚠️  Modo out-of-order: Frame ID NO se incrementará automáticamente`);
        }
        console.log(`   Hex: ${hex}`);
        
        async function enviarHex() {
          return new Promise((resolve, reject) => {
            const client = dgram.createSocket("udp4");
            const message = Buffer.from(hex, "hex");
            let responseReceived = false;
            
            // Timeout para la respuesta (aumentado para NAT/firewalls)
            const timeout = setTimeout(() => {
              if (!responseReceived) {
                client.close();
                console.error("Timeout: No se recibió respuesta del servidor");
                console.log("Esto puede ocurrir si hay NAT/firewalls entre sender y server");
                resolve();
              }
            }, 10000); // 10 segundos para dar tiempo a NAT traversal
            
            // Escuchar respuesta
            client.on("message", (msg, rinfo) => {
              responseReceived = true;
              clearTimeout(timeout);
              const respuesta = msg.toString("hex");
              console.log(`\n📥 Respuesta recibida de ${rinfo.address}:${rinfo.port}`);
              console.log(`   Hex: ${respuesta}`);
              
              if (respuesta.slice(0, 2) !== "41") {
                console.log("⚠️ No es ACK/NACK (código: " + respuesta.slice(0, 2) + ")");
              } else if (respuesta.slice(2, 4) === "00") {
                console.log("✅ Es ACK");
                
                // Update device state from server response
                updateDeviceStateFromResponse(respuesta);
                
                // Increment frame ID for next message (unless in out-of-order testing mode)
                if (!outOfOrderTestingMode) {
                  incrementFrameId();
                  console.log(`📱 Próximo Frame ID: ${deviceState.frameId}`);
                } else {
                  console.log(`⚠️ Modo out-of-order activo: Frame ID NO se incrementó automáticamente`);
                  console.log(`   Frame ID actual: ${deviceState.frameId}`);
                  console.log(`   (Use opción 6 para cambiar el Frame ID manualmente)`);
                }
                
                // Mark as authenticated if this was auth response
                if (currentMessageType === "auth") {
                  deviceState.authenticated = true;
                  console.log("🔐 Dispositivo autenticado");
                }
              } else if (respuesta.slice(2, 4) === "01") {
                console.log("❌ Es NACK - El servidor rechazó el mensaje");
                console.log(`   Frame ID enviado: ${deviceState.frameId}`);
                console.log(`   Session: ${deviceState.sessionH}${deviceState.sessionL}`);
              } else {
                console.log(
                  `⚠️ Código desconocido: ${respuesta.slice(0, 2)} - ${respuesta.slice(2, 4)}`
                );
              }
              
              client.close();
              resolve();
            });
            
            // Manejar errores
            client.on("error", (err) => {
              if (!responseReceived) {
                clearTimeout(timeout);
                console.error("Error al enviar UDP:", err.message);
                client.close();
                reject(err);
              }
            });
            
            // Bind el socket primero para que NAT mantenga el mapping
            // Luego enviar el mensaje
            client.bind(() => {
              const address = client.address();
              console.log(`Socket UDP local: ${address.address}:${address.port}`);
              console.log(`Enviando a ${HOST}:${PORT}...`);
              
              client.send(message, PORT, HOST, (err) => {
                if (err) {
                  clearTimeout(timeout);
                  console.error("Error enviando mensaje:", err.message);
                  client.close();
                  reject(err);
                } else {
                  console.log(`Mensaje enviado. Esperando respuesta...`);
                }
              });
            });
          });
        }
        try {
          await enviarHex();
        } catch (err) {
          console.error("Error:", err.message);
        }
        await ask("Pulse enter para continuar ");
        option = "";
        break;
    }
  }
  console.log("Fin del programa.");
})();
