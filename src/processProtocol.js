import dotenv from "dotenv";
dotenv.config(); // Carga las variables de .env

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const configPath = process.env.CONFIG_PATH;

if (!configPath) {
  throw new Error("CONFIG_PATH no está definido en .env");
}

const config = require("." + configPath);
import {
  id,
  esTST,
  parseTrama,
  buildAutenticacion,
  getName,
  findName,
  getTramas,
  buildEnd,
  buildACK,
  buildNACK,
} from "./tst.js";

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
  // console.log('Attempting to insert:', topic, trama)

  var strSQL =
    "INSERT into trm_avant.prueba ( value, discriminator, status, topic, plot_date  ) VALUES($1, $2, $3, $4, now()) RETURNING id";
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

    fs.appendFile("./log", logEntry + "\n", function (err) {
      if (err) {
        console.log("❌ Failed to write to log file:", err.message);
      } else {
        console.log("📝 Log entry written to file");
      }
    });
  });
}

async function processTstProtocol(message) {
  //  console.log(message);

  let trama = parseTrama(message.toString("hex"));
  console.log(trama);
  if (!trama || !trama.idTrama) {
    console.log("Trama fallida");
    respuesta = buildNACK(trama);
    return Buffer.from(respuesta, "hex");
  }

  let insertTopic = findName(trama, callStack);
  //  console.log(`insertTopic: ${insertTopic}`);

  console.log(`topic: ${insertTopic}`);
  if (
    (!insertTopic || insertTopic.length < 1) &&
    trama.idTrama.toLowerCase() != id.Autenticacion
  ) {
    console.log("Origen no encontrado");
    respuesta = buildNACK(trama);
    return Buffer.from(respuesta, "hex");
  }

  let respuesta = "";
  switch (trama.idTrama ? trama.idTrama.toLowerCase() : undefined) {
    case id.Autenticacion:
      console.log("Es Autenticacion");
      trama.topic = getName(message.toString("hex"));
      console.log(trama.topic);

      respuesta = buildAutenticacion(trama, callStack);
      break;
    case id.ASK: // ask
      console.log("Es ASK");

      respuesta = buildACK(trama, callStack);
      break;
    case id.LecturaSimple:
      console.log("Es LecturaSimple");

      inserta(insertTopic, trama.value);
      respuesta = buildACK(trama, callStack);
      break;
    case id.LecturaAgrupada:
      console.log("Es LecturaAgrupada");

      let tramas = getTramas(trama);
      console.log(`tramas recibidas`);

      console.log(tramas);

      for (let element of tramas) {
        console.log(element);

        inserta(insertTopic, element.value);
      }
      console.log("acabó el for");

      respuesta = buildACK(trama, callStack);
      break;
    case id.End:
      console.log("Es Fin de transmisión");
      buildEnd(trama, callStack);
      break;
    default:
      console.log("Es default");

      respuesta = buildNACK(trama);
      break;
  }

  if (!respuesta) respuesta = buildNACK(trama);

  const buffer = Buffer.from(respuesta, "hex");
  //  console.log("respuesta " + respuesta);
  //  console.log("buffer " + buffer);
  //  console.log(`Enviada respuesta a ${topicRespuesta}, callstack:`);
  console.log("callStack");
  console.log(callStack);
  return buffer;
}

export { processTstProtocol };
