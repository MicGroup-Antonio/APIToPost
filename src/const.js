export const CODE_R_AUTH = "d0"; // Trama de autenticación
export const CODE_R_ASK = "c0"; // Trama de petición de configuración
export const CODE_R_RACK = "c1"; // Trama de petición de reenvío
export const CODE_R_READ = "a2"; // Trama de lectura sin agrupar
export const CODE_R_GROUP = "e0"; // Trama de lecturas agrupadas
export const CODE_R_INFO = "b2"; // Trama de información
export const CODE_R_FOTA = "f0"; // Petición de tramas en modo FOTA
export const CODE_R_ENDS = "c2"; // Trama de Fin de Sesión

export const CODE_S_ACK = "41"; // Trama de respuesta a un envío
export const CODE_S_CLEAN = "51"; // Trama para limpiar la memoria interna del dispositivo
export const CODE_S_ASK = "21"; // Trama para solicitar información al dispositivo
export const CODE_S_FOTA = "31"; // Trama de FOTA
export const CODE_S_CONF = "11"; // Trama de configuración

export const CODE_OK = "00";
export const CODE_NOK = "01";
export const CODE_PPLOT = "00"; // Trama periódica.
export const CODE_FPLOT = "01"; // Medida forzada
export const CODE_FOTA = "02"; // Por FOTA.

export const CODE_C_MEME = "01"; // CLEAN - Memoria (Tramas WMBUS) y Estadísticas
export const CODE_C_MEMO = "02"; // CLEAN - Memoria (Tramas WMBUS)
export const CODE_C_STAT = "03"; // CLEAN - Estadísticas

export const CODE_C_PSM = "01"; // CONFIGURACIÓN - PSM.
export const CODE_C_WEV = "02"; // CONFIGURACIÓN - Configuración de red.
export const CODE_C_SERV = "03"; // CONFIGURACIÓN - Parámetros del Servidor.
export const CODE_C_SEND = "04"; // CONFIGURACIÓN - Ventanas de transmisión.
export const CODE_C_RECV = "05"; // CONFIGURACIÓN - Ventanas de Lectura.
export const CODE_C_DNS = "06"; // CONFIGURACIÓN - Configuración DNS.
export const CODE_C_AUTH = "07"; // CONFIGURACIÓN - Parámetros de Autorización.
export const CODE_C_MAGN = "08"; // CONFIGURACIÓN - Activación/Desactivación del imán.
export const CODE_C_RTC = "09"; // CONFIGURACIÓN - Ajustar el RTC a la hora de la red.
export const CODE_C_NTP = "10"; // CONFIGURACIÓN - NTP
export const CODE_C_RSER = "11"; // CONFIGURACIÓN - Parámetros Servidor Remoto
export const CODE_C_TRSER = "11"; // CONFIGURACIÓN - Parámetros Servidor Remoto Temporal
export const CODE_C_TMAX = "13"; // CONFIGURACIÓN - Tiempo Máximo Conexión
export const CODE_C_TTMAX = "14"; // CONFIGURACIÓN - Tiempo Máximo Conexión Temporal
export const CODE_C_WMBUS = "15"; // CONFIGURACIÓN - Tiempo de Lectura WMBUS

export const CODE_F_MCU = "00"; // FOTA - MCU FW
export const CODE_F_NBI = "01"; // FOTA - NB-IoT FW
