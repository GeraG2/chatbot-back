// File: config/redisClient.js
// Description: Centralized Redis client configuration and instance.

import { createClient } from 'redis';

const redisClient = createClient();

redisClient.on('error', (err) => {
  console.error('Redis Client Error (Centralized)', err);
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Conectado al servidor Redis desde el cliente centralizado con éxito.');
  } catch (err) {
    console.error('No se pudo conectar al servidor Redis desde el cliente centralizado:', err);
  }
})();

export default redisClient;
