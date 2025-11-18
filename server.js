import express from "express";
import axios from "axios";
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
const app = express();
app.use(express.json());

// Escucha todas las rutas y métodos
app.all("*", async (req, res) => {
  try {
    const path = req.path.slice(1);
    // const query = req.originalUrl;
    // const body = req.body;
    // console.log(path);

    let response = await processTstProtocol(path);
    console.log(`respondiendo ${response.toString("hex")}`);

    res.status(200).send(response);
  } catch (error) {
    console.error("Error reenviando la solicitud:", error.message);
    let nack = buildNACK({
      idFrame: path.slice(2 * 2, 3 * 2),
      idSessionH: path.slice(3 * 2, 4 * 2),
      idSessionL: path.slice(4 * 2, 5 * 2),
    });
    const buffer = Buffer.from(nack, "hex");
    res.status(error.response ? error.response.status : 500).send(buffer);
  }
});

const PORT = config.puerto || 3005;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
