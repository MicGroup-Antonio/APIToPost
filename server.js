import dgram from "dgram";
import dotenv from "dotenv";
import { processTstProtocol } from "./src/processProtocol.js";
import { buildNACK } from "./src/tst.js";

dotenv.config(); // Carga las variables de .env
//la versión actual de node no permite hacer imports de json tan directos, así que lo puenteo
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const configPath = process.env.CONFIG_PATH;

if (!configPath) {
  throw new Error("CONFIG_PATH no está definido en .env");
}

const config = require(configPath);

// Crear socket UDP
const server = dgram.createSocket("udp4");

// Manejar mensajes UDP entrantes
server.on("message", async (msg, rinfo) => {
  try {
    console.log(`[${new Date().toISOString()}] Mensaje recibido de IP: ${rinfo.address}:${rinfo.port}`);
    console.log(`Datos recibidos: ${msg.toString("hex")}`);

    let response = await processTstProtocol(msg);
    
    // If response is null, frame was discarded (no active session for non-auth frame)
    // Don't send any response
    if (response === null) {
      console.log("Frame discarded: No response sent");
      return;
    }
    
    console.log(`respondiendo ${response.toString("hex")}`);

    // Enviar respuesta al cliente
    server.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error("Error enviando respuesta:", err.message);
      } else {
        console.log(`Respuesta enviada a ${rinfo.address}:${rinfo.port}`);
      }
    });
  } catch (error) {
    console.error("Error procesando el mensaje:", error.message);
    try {
      // Intentar extraer información de la trama para construir NACK
      const msgHex = msg.toString("hex");
      let nack = buildNACK({
        idFrame: msgHex.slice(2 * 2, 3 * 2),
        idSessionH: msgHex.slice(3 * 2, 4 * 2),
        idSessionL: msgHex.slice(4 * 2, 5 * 2),
      });
      const buffer = Buffer.from(nack, "hex");
      server.send(buffer, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error("Error enviando NACK:", err.message);
        }
      });
    } catch (nackError) {
      console.error("Error construyendo NACK:", nackError.message);
    }
  }
});

// Manejar errores del socket
server.on("error", (err) => {
  console.error(`Error del servidor UDP: ${err.message}`);
  server.close();
});

// Escuchar en el puerto configurado
const PORT = config.puerto || 3005;
server.bind(PORT, () => {
  console.log(`Servidor UDP escuchando en puerto ${PORT}`);
});
