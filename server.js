// File: server.js
// Description: Punto de entrada principal para el servidor Express.
// dotenv se carga ahora a través del script de npm, por lo que ya no es necesario aquí.

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises'; // Importar fs.promises para usar async/await directamente
// import { createClient } from 'redis'; // Ya no se importa createClient aquí
import redisClient from './config/redisClient.js'; // Importar cliente Redis centralizado
import { setSystemInstructionForWhatsapp } from './services/geminiService.js'; // Importar función necesaria
// La importación de dotenv ya no es necesaria aquí.
// import chatRoutes from './routes/chatRoutes.js'; // No longer needed
import whatsappRoutes from './routes/whatsappRoutes.js';
import adminRoutes from './routes/adminRoutes.js'; // Importar las nuevas rutas de admin

const app = express();
const PORT = process.env.PORT || 5001;

const PRODUCTS_PATH = './products.json';

// --- INICIALIZACIÓN DE REDIS ---
// La inicialización de Redis ahora se maneja en config/redisClient.js
// const redisClient = createClient(); // Eliminado
// redisClient.on('error', (err) => { // Eliminado
// console.error('Redis Client Error en server.js', err); // Eliminado
// }); // Eliminado
// (async () => { // Eliminado
// try { // Eliminado
// await redisClient.connect(); // Eliminado
// console.log('Conectado al servidor Redis desde server.js con éxito.'); // Eliminado
// } catch (err) { // Eliminado
// console.error('No se pudo conectar al servidor Redis desde server.js:', err); // Eliminado
// } // Eliminado
// })(); // Eliminado

// --- Middleware ---
// Habilitar CORS para permitir peticiones desde tu frontend de React
app.use(cors({
  origin: 'http://localhost:5174', // ACTUALIZADO: Cambiado a 5174 según requisitos
  methods: ['GET', 'POST', 'PUT'], // Añadido PUT por si acaso, aunque no se pide explícitamente
}));

// Parsear cuerpos de petición en formato JSON
app.use(express.json());

// --- Rutas ---
// app.use('/api/chat', chatRoutes); // No longer needed
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes); // Añadir middleware para las rutas de admin

// --- NUEVOS ENDPOINTS DE API PARA MONITOR DE CHATS EN VIVO ---

// Endpoint: GET /api/sessions
// Propósito: Obtener una lista de todos los senderId de las sesiones activas de WhatsApp.
app.get('/api/sessions', async (req, res) => {
  try {
    const keys = await redisClient.keys('whatsapp_session:*');
    if (!keys || keys.length === 0) {
      return res.status(200).json([]); // Devuelve un array vacío si no hay sesiones
    }
    // Quitar el prefijo 'whatsapp_session:' de cada clave
    const senderIds = keys.map(key => key.replace('whatsapp_session:', ''));
    res.status(200).json(senderIds);
  } catch (error) {
    console.error('Error al obtener sesiones de Redis:', error);
    res.status(500).json({ message: 'Error al obtener la lista de sesiones.' });
  }
});

// Endpoint: GET /api/sessions/:senderId
// Propósito: Obtener el historial completo y la instrucción de sistema para un solo usuario.
app.get('/api/sessions/:senderId', async (req, res) => {
  try {
    const { senderId } = req.params;
    if (!senderId) {
      return res.status(400).json({ message: 'El senderId es requerido.' });
    }

    const redisKey = `whatsapp_session:${senderId}`;
    const serializedSession = await redisClient.get(redisKey);

    if (serializedSession === null) {
      return res.status(404).json({ message: `Sesión no encontrada para el senderId: ${senderId}` });
    }

    try {
      const sessionData = JSON.parse(serializedSession);
      res.status(200).json(sessionData);
    } catch (parseError) {
      console.error(`Error al parsear datos de sesión para ${senderId}:`, parseError);
      // Devuelve los datos crudos si no se pueden parsear, o un error específico
      // Considera si quieres devolver el string tal cual o un error.
      // Por ahora, devolvemos un error para ser consistentes con el manejo de JSON.
      res.status(500).json({ message: 'Error al procesar los datos de la sesión.' });
    }

  } catch (error) {
    console.error('Error al obtener la sesión individual de Redis:', error);
    res.status(500).json({ message: 'Error al obtener la sesión del usuario.' });
  }
});

// Endpoint: POST /api/sessions/:senderId/instruction
// Propósito: Actualizar la instrucción de sistema (la personalidad) de un usuario específico.
app.post('/api/sessions/:senderId/instruction', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { newInstruction } = req.body;

    if (!senderId) {
      return res.status(400).json({ message: 'El senderId es requerido en los parámetros de la ruta.' });
    }
    if (typeof newInstruction !== 'string' || newInstruction.trim() === '') {
      return res.status(400).json({ message: 'La propiedad "newInstruction" es requerida en el cuerpo de la solicitud y no puede estar vacía.' });
    }

    // Llamar a la función importada de geminiService.js
    const success = await setSystemInstructionForWhatsapp(senderId, newInstruction);

    if (success) {
      res.status(200).json({ message: `Instrucción de sistema para ${senderId} actualizada con éxito.` });
    } else {
      // Asumimos que si setSystemInstructionForWhatsapp devuelve false, es un error interno del servicio.
      res.status(500).json({ message: `Error al actualizar la instrucción de sistema para ${senderId}.` });
    }

  } catch (error) {
    console.error(`Error en POST /api/sessions/${req.params.senderId}/instruction:`, error);
    res.status(500).json({ message: 'Error interno del servidor al intentar actualizar la instrucción.' });
  }
});

// --- Rutas para la configuración ---
const CONFIG_FILE_PATH = './config.json';

// GET /api/config - Devuelve la configuración actual
app.get('/api/config', async (req, res) => { // Cambiado a async para consistencia, aunque fs.readFile síncrono abajo
  try {
    const data = await fs.readFile(CONFIG_FILE_PATH, 'utf-8'); // fs.promises.readFile
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error al leer config.json:', error);
    if (error.code === 'ENOENT') {
      return res.status(404).json({ message: 'Archivo de configuración no encontrado.' });
    }
    res.status(500).json({ message: 'Error al obtener la configuración.' });
  }
});

// POST /api/config - Actualiza la configuración
app.post('/api/config', async (req, res) => {
  try {
    // Log #1: Para saber que la petición llegó correctamente.
    console.log('-------------------------------------------');
    console.log(`[${new Date().toISOString()}] Petición POST recibida en /api/config`);

    const newConfig = req.body;

    // Log #2: Para ver exactamente qué datos recibiste del frontend. ¡Muy útil para depurar!
    console.log('Datos recibidos para guardar:', newConfig);

    // Validación básica (mantenida de la versión anterior, puedes ajustarla si es necesario)
    if (!newConfig || typeof newConfig !== 'object') {
      // Log de error específico para validación
      console.warn('⚠️ Petición POST a /api/config rechazada por cuerpo inválido:', newConfig);
      console.log('-------------------------------------------');
      return res.status(400).json({ message: 'Cuerpo de la solicitud inválido.' });
    }
    // Puedes añadir más validaciones específicas aquí si es necesario, por ejemplo:
    // if (typeof newConfig.DEFAULT_SYSTEM_INSTRUCTION !== 'string' ||
    //     typeof newConfig.GEMINI_MODEL !== 'string' ||
    //     typeof newConfig.MAX_HISTORY_TURNS !== 'number') {
    //   console.warn('⚠️ Petición POST a /api/config rechazada por campos faltantes o tipos incorrectos:', newConfig);
    //   console.log('-------------------------------------------');
    //   return res.status(400).json({ message: 'Faltan campos de configuración o tienen tipos incorrectos.' });
    // }

    await fs.promises.writeFile(CONFIG_FILE_PATH, JSON.stringify(newConfig, null, 2));

    // Log #3: La confirmación final de que todo salió bien.
    console.log('✅ ¡Archivo config.json actualizado con éxito!');
    console.log('-------------------------------------------');

    res.json({ message: '¡Configuración guardada con éxito!' });

  } catch (error) {
    // También es buena idea mejorar el log de errores.
    console.error('❌ Error al intentar guardar en config.json:', error);
    console.log('-------------------------------------------'); // Para separar logs en caso de errores consecutivos
    res.status(500).json({ message: 'Error al guardar la configuración.' });
  }
});

// --- NUEVAS RUTAS para Catálogo de Productos (Módulo 5) ---

// GET /api/products - Para OBTENER todos los productos
app.get('/api/products', async (req, res) => {
  console.log('Petición GET recibida en /api/products');
  try {
    const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error al leer products.json:', error);
    if (error.code === 'ENOENT') { // Manejo específico si el archivo no existe
      return res.status(404).json({ message: 'Archivo de productos no encontrado.' });
    }
    res.status(500).json({ message: 'Error al obtener los productos.' });
  }
});

// POST /api/products - Para AÑADIR un nuevo producto
app.post('/api/products', async (req, res) => {
  console.log('Petición POST recibida en /api/products', req.body);
  try {
    const newProduct = req.body;

    // Validación básica del producto recibido
    if (!newProduct || typeof newProduct !== 'object' || !newProduct.nombre || !newProduct.precio) {
        console.warn('Petición POST a /api/products rechazada por cuerpo inválido:', newProduct);
        return res.status(400).json({ message: 'Cuerpo de la solicitud de producto inválido. Se requiere al menos nombre y precio.' });
    }

    let products = [];
    try {
        const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
        products = JSON.parse(data);
    } catch (error) {
        // Si el archivo no existe o hay un error al leerlo/parsearlo, empezamos con un array vacío.
        // Esto hace que la API sea más robusta si products.json se borra o corrompe.
        console.warn('products.json no encontrado o corrupto, se creará uno nuevo:', error.message);
        products = [];
    }

    newProduct.id = `prod_${Date.now()}`;
    products.push(newProduct);

    await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2));
    console.log('Producto añadido con éxito:', newProduct);
    res.status(201).json({ message: 'Producto añadido con éxito.', product: newProduct });
  } catch (error) {
    console.error('Error al añadir producto:', error);
    res.status(500).json({ message: 'Error al añadir el producto.' });
  }
});

// PUT /api/products/:id - Para EDITAR un producto existente
app.put('/api/products/:id', async (req, res) => {
    console.log(`Petición PUT recibida en /api/products/${req.params.id}`, req.body);
    try {
        const productId = req.params.id;
        const updatedProductData = req.body;

        if (!updatedProductData || typeof updatedProductData !== 'object') {
            console.warn(`Petición PUT a /api/products/${productId} rechazada por cuerpo inválido:`, updatedProductData);
            return res.status(400).json({ message: 'Cuerpo de la solicitud de producto inválido.' });
        }

        let products = [];
        try {
            const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
            products = JSON.parse(data);
        } catch (error) {
            console.error('Error al leer products.json antes de actualizar, producto no encontrado:', error);
            return res.status(404).json({ message: 'Archivo de productos no encontrado, no se puede actualizar.' });
        }

        const productIndex = products.findIndex(p => p.id === productId);

        if (productIndex === -1) {
            console.warn(`Producto con ID ${productId} no encontrado para actualizar.`);
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        // Actualizar solo los campos proporcionados, manteniendo los existentes si no se proporcionan nuevos valores
        products[productIndex] = { ...products[productIndex], ...updatedProductData };

        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2));
        console.log('Producto actualizado con éxito:', products[productIndex]);
        res.json({ message: 'Producto actualizado con éxito.', product: products[productIndex] });

    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({ message: 'Error al actualizar el producto.' });
    }
});

// DELETE /api/products/:id - Para ELIMINAR un producto
app.delete('/api/products/:id', async (req, res) => {
    console.log(`Petición DELETE recibida en /api/products/${req.params.id}`);
    try {
        const productId = req.params.id;
        let products = [];
        try {
            const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
            products = JSON.parse(data);
        } catch (error) {
            console.error('Error al leer products.json antes de eliminar, producto no encontrado:', error);
            return res.status(404).json({ message: 'Archivo de productos no encontrado, no se puede eliminar.' });
        }

        const filteredProducts = products.filter(p => p.id !== productId);

        if (products.length === filteredProducts.length) {
            console.warn(`Producto con ID ${productId} no encontrado para eliminar.`);
            return res.status(404).json({ message: 'Producto no encontrado.' });
        }

        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(filteredProducts, null, 2));
        console.log(`Producto con ID ${productId} eliminado con éxito.`);
        res.json({ message: 'Producto eliminado con éxito.' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        res.status(500).json({ message: 'Error al eliminar el producto.' });
    }
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