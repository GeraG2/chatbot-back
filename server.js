// File: server.js
// Description: Punto de entrada principal para el servidor Express que sirve la API para el panel de administración.

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises'; 

// --- Importaciones de Módulos Locales ---
// Asume que el cliente de Redis está centralizado. Si no, descomenta la inicialización de abajo.
import redisClient from './config/redisClient.js';
import { setSystemInstructionForWhatsapp, getTestResponse } from './services/geminiService.js'; // <-- Importar getTestResponse
import whatsappRoutes from './routes/whatsappRoutes.js';
import messengerRoutes from './routes/messengerRoutes.js'; // <-- AÑADIR ESTA LÍNEA
// import adminRoutes from './routes/adminRoutes.js'; // Aún no se usa, pero está listo para la refactorización

const app = express();
const PORT = process.env.PORT || 5001;

// --- Constantes de Rutas de Archivos ---
const PRODUCTS_PATH = './products.json';
const CONFIG_FILE_PATH = './config.json';

// --- Middleware ---
// Configuración de CORS flexible para permitir múltiples puertos de desarrollo
const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por la política de CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Permitir todos los métodos para el CRUD
}));

// Middleware para entender cuerpos de petición en formato JSON
app.use(express.json());

// --- MIDDLEWARE DE DIAGNÓSTICO TOTAL ---
// Este código se ejecutará para CADA petición que llegue a tu servidor,
// antes de que llegue a nuestras rutas específicas.
app.use((req, res, next) => {
  console.log('\n--- 🕵️ NUEVA PETICIÓN RECIBIDA 🕵️ ---');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Método HTTP:', req.method);
  console.log('URL Original:', req.originalUrl);
  
  // Imprimimos el cuerpo (body) para ver si express.json lo ha parseado bien
  console.log('Cuerpo (Body):', JSON.stringify(req.body, null, 2));
  console.log('---------------------------------\n');
  
  // MUY IMPORTANTE: Le decimos a Express que continúe con el siguiente middleware o ruta.
  next(); 
});


// --- Rutas Principales ---
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/messenger', messengerRoutes); // <-- AÑADIR ESTA LÍNEA
// app.use('/api/admin', adminRoutes); // Listo para cuando muevas la lógica



// ===================================================================
// --- ENDPOINTS DE API PARA EL PANEL DE ADMINISTRACIÓN ---
// ===================================================================

// --- Rutas para Módulo "Entrenador de IA" (Prueba de Prompts) ---
app.post('/api/test-prompt', async (req, res) => {
  console.log("-> Entrando al endpoint /api/test-prompt.");
  try {
    const { systemInstruction, history, userMessage } = req.body; // Asumimos que también podrías enviar userMessage

    if (!systemInstruction || typeof systemInstruction !== 'string') {
      return res.status(400).json({ message: 'La propiedad "systemInstruction" es requerida.' });
    }
    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ message: 'La propiedad "history" es requerida.' });
    }

    console.log("-> Llamando a getTestResponse desde el servidor...");
    // Asegúrate de pasar todos los parámetros necesarios
    const responseText = await getTestResponse(systemInstruction, history, userMessage || ""); 
    console.log("-> getTestResponse devolvió:", responseText);

    res.status(200).json({ responseText });

  } catch (error) {
    console.error("-> ERROR en el endpoint /api/test-prompt:", error);
    res.status(500).json({ message: 'Error interno del servidor.', error: error.message });
  }
});


// --- Rutas para Módulo 2: Monitor de Chats en Vivo ---

app.get('/api/sessions', async (req, res) => {
  try {
    const keys = await redisClient.keys('whatsapp_session:*');
    const senderIds = keys.map(key => key.replace('whatsapp_session:', ''));
    res.status(200).json(senderIds);
  } catch (error) {
    console.error('Error al obtener sesiones de Redis:', error);
    res.status(500).json({ message: 'Error al obtener la lista de sesiones.' });
  }
});

app.get('/api/sessions/:senderId', async (req, res) => {
  try {
    const { senderId } = req.params;
    const redisKey = `whatsapp_session:${senderId}`;
    const serializedSession = await redisClient.get(redisKey);
    if (!serializedSession) {
      return res.status(404).json({ message: `Sesión no encontrada para el senderId: ${senderId}` });
    }
    res.status(200).json(JSON.parse(serializedSession));
  } catch (error) {
    console.error('Error al obtener la sesión individual de Redis:', error);
    res.status(500).json({ message: 'Error al obtener la sesión del usuario.' });
  }
});

app.post('/api/sessions/:senderId/instruction', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { newInstruction } = req.body;
    if (typeof newInstruction !== 'string') {
      return res.status(400).json({ message: 'La propiedad "newInstruction" es requerida.' });
    }
    const success = await setSystemInstructionForWhatsapp(senderId, newInstruction);
    if (success) {
      res.status(200).json({ message: `Instrucción actualizada con éxito.` });
    } else {
      res.status(500).json({ message: `Error al actualizar la instrucción.` });
    }
  } catch (error) {
    console.error(`Error en POST /api/sessions/${req.params.senderId}/instruction:`, error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});


// --- Rutas para Módulo 4: Configuración Global ---

app.get('/api/config', async (req, res) => {
  try {
    const data = await fs.readFile(CONFIG_FILE_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la configuración.' });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({ message: 'Cuerpo de la solicitud inválido.' });
    }
    await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(newConfig, null, 2));
    console.log('✅ ¡Archivo config.json actualizado con éxito!');
    res.json({ message: '¡Configuración guardada con éxito!' });
  } catch (error) {
    console.error('❌ Error al intentar guardar en config.json:', error);
    res.status(500).json({ message: 'Error al guardar la configuración.' });
  }
});


// --- Rutas para Módulo 5: Catálogo de Productos ---

app.get('/api/products', async (req, res) => {
  try {
    const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    if (error.code === 'ENOENT') return res.json([]);
    res.status(500).json({ message: 'Error al obtener los productos.' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const newProduct = req.body;
    if (!newProduct || !newProduct.name || newProduct.price === undefined) {
      return res.status(400).json({ message: 'Se requiere al menos "name" y "price".' });
    }
    let products = [];
    try {
      const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
      products = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    newProduct.id = `prod_${Date.now()}`;
    products.push(newProduct);
    await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2));
    res.status(201).json({ message: 'Producto añadido con éxito.', product: newProduct });
  } catch (error) {
    res.status(500).json({ message: 'Error al añadir el producto.' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
    let products = JSON.parse(data);
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ message: 'Producto no encontrado.' });
    products[index] = { ...products[index], ...updatedData };
    await fs.writeFile(PRODUCTS_PATH, JSON.stringify(products, null, 2));
    res.json({ message: 'Producto actualizado con éxito.', product: products[index] });
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el producto.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fs.readFile(PRODUCTS_PATH, 'utf-8');
    let products = JSON.parse(data);
    const newProducts = products.filter(p => p.id !== id);
    if (products.length === newProducts.length) {
      return res.status(404).json({ message: 'Producto no encontrado.' });
    }
    await fs.writeFile(PRODUCTS_PATH, JSON.stringify(newProducts, null, 2));
    res.json({ message: 'Producto eliminado con éxito.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el producto.' });
  }
});


// --- Iniciar el servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});