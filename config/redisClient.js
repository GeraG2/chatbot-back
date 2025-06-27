// File: config/redisClient.js
// Description: Módulo centralizado para crear, conectar y exportar
//              una única instancia del cliente de Redis para toda la aplicación.

import { createClient } from 'redis';

console.log("Inicializando cliente de Redis centralizado...");

// Creamos la instancia del cliente
const redisClient = createClient();

// Añadimos un listener para manejar errores de conexión en un solo lugar
redisClient.on('error', (err) => {
  console.error('❌ Error en el Cliente Central de Redis:', err);
});

// Usamos una función autoejecutable para conectar al iniciar
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Cliente de Redis centralizado conectado con éxito.');
  } catch (err) {
    console.error('Initial Redis connection failed:', err);
  }
})();

// Exportamos la instancia del cliente para que otros archivos puedan usarla
export default redisClient;
