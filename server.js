// Initialize console logging first (before any other imports that might use console)
import "./src/logger.js";

import dgram from "dgram";
import dotenv from "dotenv";
import { processTstProtocol } from "./src/processProtocol.js";
import { buildNACK } from "./src/tst.js";
import { initDatabase, deviceConfigsDB } from "./src/device-config/db.js";
import { buildTrama, calcularCRC } from "./src/tst.js";
import { updateSessionFrameId, getSession } from "./src/sessionManager.js";
import * as tConst from "./src/const.js";

dotenv.config(); // Carga las variables de .env
//la versión actual de node no permite hacer imports de json tan directos, así que lo puenteo
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const configPath = process.env.CONFIG_PATH;

if (!configPath) {
  throw new Error("CONFIG_PATH no está definido en .env");
}

const config = require(configPath);

// Initialize device configuration database
initDatabase();

// Crear socket UDP
const server = dgram.createSocket("udp4");

// Manejar mensajes UDP entrantes
server.on("message", async (msg, rinfo) => {
  try {
    console.log(`[${new Date().toISOString()}] Mensaje recibido de IP: ${rinfo.address}:${rinfo.port}`);
    console.log(`Datos recibidos: ${msg.toString("hex")}`);

    let response = await processTstProtocol(msg);
    
    // If response is null, either:
    // 1. Frame was discarded (no active session for non-auth frame)
    // 2. END frame (doesn't require response)
    // Don't send any response
    if (response === null) {
      // Check if it's an END frame by looking at the message
      const msgHex = msg.toString("hex");
      const frameType = msgHex.slice(0, 2).toLowerCase();
      if (frameType === "c2") {
        console.log("✅ End of Transmission frame processed - no response sent");
      } else {
        console.log("⚠️ Frame discarded: No response sent");
      }
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
    
    // If there are pending configurations, send them after the ASK ACK
    console.log(`🔍 Checking for pending configs: ${response.pendingConfigs ? response.pendingConfigs.length : 'undefined'} configs found`);
    
    if (response.pendingConfigs && response.pendingConfigs.length > 0) {
      console.log(`📤 Sending ${response.pendingConfigs.length} pending configuration(s)...`);
      
      // Helper function to convert number to little-endian hex
      function numberToLittleEndianHex(num, bytes) {
        let hex = num.toString(16).padStart(bytes * 2, "0");
        let result = "";
        for (let i = bytes - 1; i >= 0; i--) {
          result += hex.slice(i * 2, (i + 1) * 2);
        }
        return result;
      }
      
      // Send each pending configuration
      for (let i = 0; i < response.pendingConfigs.length; i++) {
        const config = response.pendingConfigs[i];
        try {
          // Get current session to get the latest frame ID (fresh each iteration)
          const session = getSession(response.sessionH, response.sessionL);
          if (!session) {
            console.warn(`⚠️ Session not found, skipping config ${config.id}`);
            continue;
          }
          
          // Get current frame ID from session and increment it
          let currentFrameId = session.lastFrameId || "00";
          const frameIdNum = parseInt(currentFrameId, 16);
          const nextFrameId = ((frameIdNum + 1) % 256).toString(16).padStart(2, "0");
          
          console.log(`📤 Sending config ${i + 1}/${response.pendingConfigs.length}: ${config.config_type} (${config.config_code}) with Frame ID: ${nextFrameId} (was: ${currentFrameId})`);
          
          // Rebuild the config frame with current session IDs and incremented frame ID
          // Use the stored config_code and config_value from database
          const valueBytes = config.config_value.length / 2;
          const sizeHex = numberToLittleEndianHex(valueBytes, 2);
          
          // Build new config frame with current session and incremented frame ID
          const configFrame = {
            idTrama: tConst.CODE_S_CONF,
            ack: config.config_code,
            idFrame: nextFrameId,
            idSessionH: response.sessionH,
            idSessionL: response.sessionL,
            size: sizeHex,
            value: config.config_value
          };
          
          const frameHex = buildTrama(configFrame, false);
          const crc = calcularCRC(frameHex);
          const completeFrame = frameHex + crc;
          const configBuffer = Buffer.from(completeFrame, "hex");
          
          // Send configuration frame
          server.send(configBuffer, rinfo.port, rinfo.address, (err) => {
            if (err) {
              console.error(`Error enviando configuración ${config.config_type}:`, err.message);
            } else {
              console.log(`✅ Configuración enviada: ${config.config_type} (${config.config_code}) - Frame ID: ${nextFrameId}`);
              
              // Mark as sent in database
              deviceConfigsDB.markAsSent(config.id, "Sent via ASK response");
            }
          });
          
          // Update session frame ID BEFORE next iteration (so next config gets the incremented value)
          updateSessionFrameId(response.sessionH, response.sessionL, nextFrameId);
          
          // Small delay between configs to avoid overwhelming the device
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`Error procesando configuración ${config.id}:`, error.message);
        }
      }
      
      console.log(`✅ Finished sending ${response.pendingConfigs.length} configuration(s)`);
    }
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
