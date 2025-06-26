// File: server.js
// Description: Punto de entrada principal para el servidor Express.
// dotenv se carga ahora a través del script de npm, por lo que ya no es necesario aquí.

import express from 'express';
import cors from 'cors';
import fs from 'fs'; // Importar fs
// La importación de dotenv ya no es necesaria aquí.
// import chatRoutes from './routes/chatRoutes.js'; // No longer needed
import whatsappRoutes from './routes/whatsappRoutes.js';
import adminRoutes from './routes/adminRoutes.js'; // Importar las nuevas rutas de admin

const app = express();
const PORT = process.env.PORT || 5001;

// --- Middleware ---
// Habilitar CORS para permitir peticiones desde tu frontend de React
app.use(cors({
  origin: 'http://localhost:5174', // Reemplaza con la URL de tu frontend si es diferente
  methods: ['GET', 'POST'],
}));

// Parsear cuerpos de petición en formato JSON
app.use(express.json());

// --- Rutas ---
// app.use('/api/chat', chatRoutes); // No longer needed
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes); // Añadir middleware para las rutas de admin

// --- Rutas para la configuración ---
const CONFIG_FILE_PATH = './config.json';

// GET /api/config - Devuelve la configuración actual
app.get('/api/config', (req, res) => {
  fs.readFile(CONFIG_FILE_PATH, 'utf8', (err, data) => {
    if (err) {
      console.error('Error al leer config.json:', err);
      return res.status(500).json({ error: 'No se pudo leer la configuración.' });
    }
    try {
      const config = JSON.parse(data);
      res.json(config);
    } catch (parseErr) {
      console.error('Error al parsear config.json:', parseErr);
      return res.status(500).json({ error: 'El formato de la configuración es inválido.' });
    }
  });
});

// POST /api/config - Actualiza la configuración
app.post('/api/config', (req, res) => {
  const newConfig = req.body;

  // Validación básica
  if (!newConfig || typeof newConfig !== 'object') {
    return res.status(400).json({ error: 'Cuerpo de la solicitud inválido.' });
  }
  if (typeof newConfig.DEFAULT_SYSTEM_INSTRUCTION !== 'string' ||
      typeof newConfig.GEMINI_MODEL !== 'string' ||
      typeof newConfig.MAX_HISTORY_TURNS !== 'number') {
    return res.status(400).json({ error: 'Faltan campos de configuración o tienen tipos incorrectos.' });
  }

  fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(newConfig, null, 2), 'utf8', (err) => {
    if (err) {
      console.error('Error al escribir en config.json:', err);
      return res.status(500).json({ error: 'No se pudo guardar la configuración.' });
    }
    res.json({ message: 'Configuración actualizada con éxito. Recuerda reiniciar el servidor para aplicar los cambios.' });
  });
});

// --- Manejador de errores global (básico) ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal en el servidor.' });
});

// --- Iniciar el servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  // La advertencia sigue siendo útil para confirmar que la variable se cargó correctamente.
  if (!process.env.GEMINI_API_KEY) {
      console.warn('ADVERTENCIA: La variable de entorno GEMINI_API_KEY no está configurada. Revisa tu archivo .env y el script de inicio en package.json.');
  }
});