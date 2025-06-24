// File: server.js
// Description: Punto de entrada principal para el servidor Express.
// dotenv se carga ahora a través del script de npm, por lo que ya no es necesario aquí.

import express from 'express';
import cors from 'cors';
// La importación de dotenv ya no es necesaria aquí.
// import chatRoutes from './routes/chatRoutes.js'; // No longer needed
import whatsappRoutes from './routes/whatsappRoutes.js';
import adminRoutes from './routes/adminRoutes.js'; // Importar las nuevas rutas de admin

const app = express();
const PORT = process.env.PORT || 5001;

// --- Middleware ---
// Habilitar CORS para permitir peticiones desde tu frontend de React
app.use(cors({
  origin: 'http://localhost:5173', // Reemplaza con la URL de tu frontend si es diferente
  methods: ['GET', 'POST'],
}));

// Parsear cuerpos de petición en formato JSON
app.use(express.json());

// --- Rutas ---
// app.use('/api/chat', chatRoutes); // No longer needed
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes); // Añadir middleware para las rutas de admin

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