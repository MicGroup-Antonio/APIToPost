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

Para enviar pruebas usa. He puesto un menú simple, pero completo, lo ideal sería recorrerlo de principio a fin
```
npm run send
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
