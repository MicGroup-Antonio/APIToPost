# API To Post Avant

Preparar el Programa
Variables de entorno
Ejecutar el servidor
Pruebas


## Preparar el Programa
Para instalar todo ejecuta npm install

## Variables de entorno
en .env se especifica cual de los archivos de config se usa para la configuración, posteriormente donde se necesite puede cargarse:

```javascript
const configPath = process.env.CONFIG_PATH;
if (!configPath) {
  throw new Error("CONFIG_PATH no está definido en .env");
}
const config = require(configPath);
```

## Ejecutar el servidor
Para ejecutar el servidor basta poner

```
npm run serve
```

## Pruebas

Para enviar pruebas. El archivo sender.js tiene harcodeada la ip, en una variable en el mismo. hay que cambiarla ahí
```
npm run send
```

se han establecido varios parámetros para enviar mensajes (por defecto manda auth)
auth, ask, trama, grupo, fallo

```
npm run send
```
es igual a 
```
npm run send auth
```
y a su vez es igual a 
```
npm run send auth "000000"
```


Cada vez que se hace una llamada, se imprime la respuesta
```
Respuesta recibida en tu/response:
4100007f150000d4f1
Responder a 007f15
```
esa ultima línea, indica el id de trama en los 2 primeros caracteres (habría que sumar 1, pero el programa no lo comprueba), y el identificador de sesión en los 4 siguientes, los siguientes mensajes que se manden deben incluirlos. Así, siguiendo el ejemplo anterior, habría que poner 017f15, como en 
```
npm run send ask 017f15
```

## Despliegue
Para desplegar el programa, ha de subirse a la sección de Front de pre, o de pro, a la carpeta /etc/node/
hay que editar el archivo ecosystem.config.cjs, poniendo el mismo CONFIG_PATH que en .env
Posteriormente:
`pm2 list` permite ver si el servicio ya está corriendo
`pm2 stop` para el proceso con el id, ej. `pm2 stop 4`
`pm2 start` arranca el proceso con el id, ej. `pm2 start 4`
`pm2 delete` elimina el proceso con el id, ej. `pm2 delete 4`
`pm2 start ecosystem.config.cjs` arranca el proceso
