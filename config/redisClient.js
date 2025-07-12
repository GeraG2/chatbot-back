// File: config/redisClient.js
// Description: Módulo centralizado para crear, conectar y exportar
//              una única instancia del cliente de Redis para toda la aplicación.

import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;
console.log("Inicializando cliente de Redis centralizado...");
console.log(redisUrl ? "Usando URL de producción de Redis." : "No se encontró REDIS_URL, usando localhost.");
// Creamos la instancia del cliente
const redisClient = createClient({
  url: redisUrl 
});

// Añadimos un listener para manejar errores de conexión en un solo lugar
redisClient.on('error', (err) => {
  console.error('❌ Error en el Cliente Central de Redis:', err);
});

// Usamos una función autoejecutable para conectar al iniciar
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Cliente de Redis centralizado conectado con éxito.');
    console.log("\n🤖 ===== BOT LISTO PARA RECIBIR CONVERSACIONES ===== 🤖\n");
  } catch (err) {
    console.error('Initial Redis connection failed:', err);
  }
})();

// Exportamos la instancia del cliente para que otros archivos puedan usarla
export default redisClient;
