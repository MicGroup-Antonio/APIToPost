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
import { logMessage } from "./src/messageLogger.js";

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

    // Extract session IDs from received message for logging
    const msgHex = msg.toString("hex");
    const sessionH = msgHex.length >= 8 ? msgHex.slice(6, 8) : null;
    const sessionL = msgHex.length >= 10 ? msgHex.slice(8, 10) : null;
    
    // Log received message
    logMessage(msg, "received", sessionH, sessionL);

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
    
    // Check if we should send a config message or ACK
    // If nextPendingConfig exists, send that config instead of ACK
    // The device will send another ASK after receiving the config
    if (response.nextPendingConfig) {
      // There's a pending config to send - send it instead of ACK
      const config = response.nextPendingConfig;
      console.log(`📤 Sending pending config: ${config.config_type} (${config.config_code})`);
      
      // Helper function to convert number to little-endian hex
      function numberToLittleEndianHex(num, bytes) {
        let hex = num.toString(16).padStart(bytes * 2, "0");
        let result = "";
        for (let i = bytes - 1; i >= 0; i--) {
          result += hex.slice(i * 2, (i + 1) * 2);
        }
        return result;
      }
      
      try {
        // Get current session to get the latest frame ID
        const session = getSession(response.sessionH, response.sessionL);
        if (!session) {
          console.warn(`⚠️ Session not found, cannot send config ${config.id}`);
          // Fall back to sending ACK if session not found
          if (response.respuesta) {
            const responseHex = response.respuesta;
            const responseSessionH = responseHex.length >= 8 ? responseHex.slice(6, 8) : null;
            const responseSessionL = responseHex.length >= 10 ? responseHex.slice(8, 10) : null;
            const ackBuffer = Buffer.from(response.respuesta, "hex");
            server.send(ackBuffer, rinfo.port, rinfo.address, (err) => {
              if (err) {
                console.error("Error enviando respuesta:", err.message);
              } else {
                console.log(`Respuesta enviada a ${rinfo.address}:${rinfo.port}`);
                logMessage(ackBuffer, "sent", responseSessionH, responseSessionL);
              }
            });
          }
          return;
        }
        
        // Use the idFrame from the incoming request (echo it back)
        // This is critical: the device needs to receive the same idFrame it sent
        const requestFrameId = response.idFrame || "00";
        
        console.log(`📤 Sending config: ${config.config_type} (${config.config_code}) with Frame ID: ${requestFrameId} (echoing back from request)`);
        
        // Rebuild the config frame with current session IDs and the same frame ID from request
        const valueBytes = config.config_value.length / 2;
        const sizeHex = numberToLittleEndianHex(valueBytes, 2);
        
        // Build new config frame with current session and same frame ID from request
        const configFrame = {
          idTrama: tConst.CODE_S_CONF,
          ack: config.config_code,
          idFrame: requestFrameId,
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
            console.log(`✅ Configuración enviada: ${config.config_type} (${config.config_code}) - Frame ID: ${requestFrameId}`);
            
            // Log sent configuration message
            logMessage(configBuffer, "sent", response.sessionH, response.sessionL);
            
            // Mark as sent in database
            deviceConfigsDB.markAsSent(config.id, "Sent via ASK response");
            
            // Update session frame ID after sending (use the frame ID we sent)
            updateSessionFrameId(response.sessionH, response.sessionL, requestFrameId);
          }
        });
      } catch (error) {
        console.error(`Error procesando configuración ${config.id}:`, error.message);
        // Fall back to sending ACK on error
        if (response.respuesta) {
          const responseHex = response.respuesta;
          const responseSessionH = responseHex.length >= 8 ? responseHex.slice(6, 8) : null;
          const responseSessionL = responseHex.length >= 10 ? responseHex.slice(8, 10) : null;
          const ackBuffer = Buffer.from(response.respuesta, "hex");
          server.send(ackBuffer, rinfo.port, rinfo.address, (err) => {
            if (err) {
              console.error("Error enviando respuesta:", err.message);
            } else {
              console.log(`Respuesta enviada a ${rinfo.address}:${rinfo.port}`);
              logMessage(ackBuffer, "sent", responseSessionH, responseSessionL);
            }
          });
        }
      }
    } else {
      // No pending configs, send ACK immediately
      if (!response.respuesta) {
        console.warn("⚠️ No response and no pending config - this shouldn't happen");
        return;
      }
      
      console.log(`respondiendo ${response.respuesta}`);
      
      // Extract session IDs from response for logging
      const responseHex = response.respuesta;
      const responseSessionH = responseHex.length >= 8 ? responseHex.slice(6, 8) : null;
      const responseSessionL = responseHex.length >= 10 ? responseHex.slice(8, 10) : null;
      
      const ackBuffer = Buffer.from(response.respuesta, "hex");
      server.send(ackBuffer, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error("Error enviando respuesta:", err.message);
        } else {
          console.log(`Respuesta enviada a ${rinfo.address}:${rinfo.port}`);
          // Log sent message
          logMessage(ackBuffer, "sent", responseSessionH, responseSessionL);
        }
      });
    }
  } catch (error) {
    console.error("Error procesando el mensaje:", error.message);
    try {
      // Intentar extraer información de la trama para construir NACK
      const msgHex = msg.toString("hex");
      const nackSessionH = msgHex.slice(3 * 2, 4 * 2);
      const nackSessionL = msgHex.slice(4 * 2, 5 * 2);
      let nack = buildNACK({
        idFrame: msgHex.slice(2 * 2, 3 * 2),
        idSessionH: nackSessionH,
        idSessionL: nackSessionL,
      });
      const buffer = Buffer.from(nack, "hex");
      server.send(buffer, rinfo.port, rinfo.address, (err) => {
        if (err) {
          console.error("Error enviando NACK:", err.message);
        } else {
          // Log sent NACK message
          logMessage(buffer, "sent", nackSessionH, nackSessionL);
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
