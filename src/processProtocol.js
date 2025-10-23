import dotenv from "dotenv";
dotenv.config(); // Carga las variables de .env

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const configPath = process.env.CONFIG_PATH;

const fs = require("fs/promises");

if (!configPath) {
  throw new Error("CONFIG_PATH no esta definido en .env");
}

const config = require("." + configPath);
import {
  id,
  parseTrama,
  buildAutenticacion,
  getName,
  findName,
  getTramas,
  buildEnd,
  buildACK,
  buildNACK,
} from "./tst.js";

async function escribirLog(logEntry) {
  try {
    await fs.appendFile("./log", logEntry);
    await fs.appendFile("./log", "\n");
    console.log("📝 Log entry written to file");
  } catch (err) {
    console.log("❌ Failed to write to log file:", err.message);
  }
}

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

escribirLog("DB Config:");
escribirLog({
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  password: dbConfig.password ? "***SET***" : "NOT SET",
});

var pool = new pg.Pool(dbConfig);

pool.connect((err, client, release) => {
  if (err) {
    escribirLog("? Error conectando al pool: " + err.message);
  } else {
    escribirLog("? Conexion exitosa al pool!");
    release();
  }
});
/* ------------------- DB -------------------- */

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

const callStack = [];

/* ------------------- TST ------------------- */

function inserta(topic, trama) {
  // escribirLog('Attempting to insert:', topic, trama)

  var strSQL =
    "INSERT into trm_avant.prueba ( value, discriminator, status, topic, plot_date  ) VALUES($1, $2, $3, $4, now()) RETURNING id";
  var valores = [trama, config.discriminator, "N", topic];
  // escribirLog(strSQL)
  //escribirLog(valores)

  escribirLog("Executing query...");

  pool.query(strSQL, valores, (err, res) => {
    escribirLog("Query completed!");
    var logEntry =
      topic + ";" + trama + ";" + config.discriminator + ";" + Date.now() + ";";

    if (!err) {
      escribirLog("✅ inserción correcta - ID: " + res.rows[0].id);
      logEntry += "SUCCESS";
    } else {
      escribirLog("❌ inserción Incorrecta");
      escribirLog("Error message: " + err.message);
      escribirLog("Error code: " + err.code);
      escribirLog("Error detail: " + err.detail);
      escribirLog("Error hint: " + err.hint);
      escribirLog(err);
      logEntry += err.code || "UNKNOWN_ERROR";
    }

    fs.appendFile("./log", logEntry + "\n", function (err) {
      if (err) {
        escribirLog("❌ Failed to write to log file: " + err.message);
      } else {
        escribirLog("📝 Log entry written to file");
      }
    });
  });
}

async function processTstProtocol(message) {
  //  escribirLog(message);

  let trama = parseTrama(message.toString("hex"));
  escribirLog(trama);
  if (!trama || !trama.idTrama) {
    escribirLog("Trama fallida");
    respuesta = buildNACK(trama);
    return Buffer.from(respuesta, "hex");
  }

  let insertTopic = findName(trama, callStack);
  //  escribirLog(`insertTopic: ${insertTopic}`);

  escribirLog(`topic: ${insertTopic}`);
  if (
    (!insertTopic || insertTopic.length < 1) &&
    trama.idTrama.toLowerCase() != id.Autenticacion
  ) {
    escribirLog("Origen no encontrado");
    respuesta = buildNACK(trama);
    return Buffer.from(respuesta, "hex");
  }

  let respuesta = "";
  switch (trama.idTrama ? trama.idTrama.toLowerCase() : undefined) {
    case id.Autenticacion:
      escribirLog("Es Autenticacion");
      trama.topic = getName(message.toString("hex"));
      escribirLog(trama.topic);

      respuesta = buildAutenticacion(trama, callStack);
      break;
    case id.ASK: // ask
      escribirLog("Es ASK");

      respuesta = buildACK(trama, callStack);
      break;
    case id.LecturaSimple:
      escribirLog("Es LecturaSimple");

      inserta(insertTopic, trama.value);
      respuesta = buildACK(trama, callStack);
      break;
    case id.LecturaAgrupada:
      escribirLog("Es LecturaAgrupada");

      let tramas = getTramas(trama);
      escribirLog(`tramas recibidas`);

      escribirLog(tramas);

      for (let element of tramas) {
        escribirLog(element);

        inserta(insertTopic, element.value);
      }
      escribirLog("acabó el for");

      respuesta = buildACK(trama, callStack);
      break;
    case id.End:
      escribirLog("Es Fin de transmisión");
      buildEnd(trama, callStack);
      break;
    default:
      escribirLog("Es default");

      respuesta = buildNACK(trama);
      break;
  }

  if (!respuesta) respuesta = buildNACK(trama);

  const buffer = Buffer.from(respuesta, "hex");
  //  escribirLog("respuesta " + respuesta);
  //  escribirLog("buffer " + buffer);
  //  escribirLog(`Enviada respuesta a ${topicRespuesta}, callstack:`);
  escribirLog("callStack");
  escribirLog(callStack);
  return buffer;
}

export { processTstProtocol };
