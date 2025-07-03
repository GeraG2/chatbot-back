// File: server.js
// Description: Punto de entrada principal para el servidor Express que sirve la API para el panel de administración.

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Importaciones de Módulos Locales ---
// Asume que el cliente de Redis está centralizado. Si no, descomenta la inicialización de abajo.
import redisClient from './config/redisClient.js';
import {
    setSystemInstructionForWhatsapp,
    setSystemInstructionForMessenger, // <-- Importarla aquí también
    getTestResponse
} from './services/geminiService.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import messengerRoutes from './routes/messengerRoutes.js'; // <-- AÑADIR ESTA LÍNEA
// import adminRoutes from './routes/adminRoutes.js'; // Aún no se usa, pero está listo para la refactorización

const app = express();
const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0:8080';

// --- CÁLCULO DE RUTAS ---
// Calculamos __dirname de la forma moderna para Módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Constantes de Rutas de Archivos ---
const PRODUCTS_PATH = './products.json';
const CONFIG_FILE_PATH = './config.json';
const CLIENTS_FILE_PATH = path.join(__dirname, 'clients.json');

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


// --- Rutas para Módulo 2: Monitor de Chats en Vivo (OMNICANAL COMPLETO) ---

// Esta ruta ya está perfecta y no necesita cambios.
app.get('/api/sessions', async (req, res) => {
  try {
    const [whatsappKeys, messengerKeys] = await Promise.all([
      redisClient.keys('whatsapp_session:*'),
      redisClient.keys('messenger_session:*')
    ]);

    const whatsappSessions = whatsappKeys.map(key => ({
      id: key.replace('whatsapp_session:', ''),
      platform: 'whatsapp'
    }));
    const messengerSessions = messengerKeys.map(key => ({
      id: key.replace('messenger_session:', ''),
      platform: 'messenger'
    }));

    const allSessions = [...whatsappSessions, ...messengerSessions];
    res.status(200).json(allSessions);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la lista de sesiones.' });
  }
});


// --- INICIO DE LA MODIFICACIÓN ---

// GET /api/sessions/:platform/:userId - Ruta genérica para obtener detalles de CUALQUIER sesión
app.get('/api/sessions/:platform/:userId', async (req, res) => {
  try {
    const { platform, userId } = req.params;

    // Validación para asegurar que la plataforma es una de las soportadas
    if (!['whatsapp', 'messenger'].includes(platform)) {
        return res.status(400).json({ message: 'Plataforma no soportada.' });
    }

    const redisKey = `${platform}_session:${userId}`;
    const serializedSession = await redisClient.get(redisKey);

    if (!serializedSession) {
      return res.status(404).json({ message: `Sesión no encontrada para ${platform}:${userId}` });
    }
    res.status(200).json(JSON.parse(serializedSession));
  } catch (error) {
    console.error('Error al obtener la sesión individual de Redis:', error);
    res.status(500).json({ message: 'Error al obtener la sesión del usuario.' });
  }
});


// POST /api/sessions/:platform/:userId/instruction - Ruta genérica para actualizar la personalidad
app.post('/api/sessions/:platform/:userId/instruction', async (req, res) => {
  try {
    const { platform, userId } = req.params;
    const { newInstruction } = req.body;

    if (!['whatsapp', 'messenger'].includes(platform)) {
        return res.status(400).json({ message: 'Plataforma no soportada.' });
    }
    if (typeof newInstruction !== 'string') {
      return res.status(400).json({ message: 'La propiedad "newInstruction" es requerida.' });
    }

    // Llamamos a la función correcta basándonos en la plataforma
    let success = false;
    if (platform === 'whatsapp') {
        success = await setSystemInstructionForWhatsapp(userId, newInstruction);
    } else if (platform === 'messenger') {
        // Ya no necesitas el import dinámico aquí
        success = await setSystemInstructionForMessenger(userId, newInstruction);
    }

    if (success) {
      res.status(200).json({ message: `Instrucción actualizada con éxito.` });
    } else {
      res.status(500).json({ message: `Error al actualizar la instrucción.` });
    }
  } catch (error) {
    console.error(`Error en POST /api/sessions/:platform/:userId/instruction:`, error);
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


// --- Rutas para Módulo de Clientes ---
// --- Módulo: Gestor de Clientes (Multi-Cliente) ---

// GET /api/clients - Obtiene todos los clientes
app.get('/api/clients', async (req, res) => {
    try {
        const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
        res.json(JSON.parse(data)); // Simplemente devuelve el array completo
    } catch (error) {
        if (error.code === 'ENOENT') return res.json([]); // Si no existe, devuelve un array vacío
        res.status(500).json({ message: 'Error al obtener los clientes.' });
    }
});

// PUT /api/clients/:clientId - Edita un cliente existente
app.put('/api/clients/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const updatedClientData = req.body;
        
        const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
        let clients = JSON.parse(data);

        const clientIndex = clients.findIndex(c => c.clientId === clientId);

        if (clientIndex === -1) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }

        // Actualizamos el objeto en el array
        clients[clientIndex] = { ...clients[clientIndex], ...updatedClientData };

        await fs.writeFile(CLIENTS_FILE_PATH, JSON.stringify(clients, null, 2));
        res.json({ message: 'Cliente actualizado con éxito.', client: clients[clientIndex] });
    } catch (error) {
        console.error('Error al actualizar el cliente:', error);
        res.status(500).json({ message: 'Error al actualizar el cliente.' });
    }
});

// POST /api/clients - Añade un nuevo cliente
app.post('/api/clients', async (req, res) => {
    try {
        const newClient = req.body;
        if (!newClient.clientId || !newClient.clientName) {
            return res.status(400).json({ message: 'Se requieren clientId y clientName.' });
        }
        
        let clients = [];
        try {
            const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
            clients = JSON.parse(data);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        if (clients.find(c => c.clientId === newClient.clientId)) {
            return res.status(409).json({ message: 'Un cliente con este ID ya existe.' });
        }

        // Añadimos el nuevo cliente al array
        clients.push(newClient);
        
        const newKnowledgePath = path.join(__dirname, newClient.knowledgeBasePath);
        await fs.writeFile(newKnowledgePath, '[]', 'utf-8');

        await fs.writeFile(CLIENTS_FILE_PATH, JSON.stringify(clients, null, 2));
        
        res.status(201).json({ message: 'Cliente creado con éxito.', client: newClient });
    } catch (error) {
        console.error('Error al añadir cliente:', error);
        res.status(500).json({ message: 'Error al añadir el cliente.' });
    }
});

// DELETE /api/clients/:clientId - Elimina un cliente
app.delete('/api/clients/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
        let clients = JSON.parse(data);

        const newClients = clients.filter(c => c.clientId !== clientId);

        if (clients.length === newClients.length) {
            return res.status(404).json({ message: 'Cliente no encontrado para eliminar.' });
        }

        // Escribimos el nuevo array (sin el cliente borrado) de vuelta al archivo
        await fs.writeFile(CLIENTS_FILE_PATH, JSON.stringify(newClients, null, 2));
        
        console.log(`✅ Cliente con ID ${clientId} eliminado con éxito.`);
        res.status(200).json({ message: 'Cliente eliminado con éxito.' });

    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ message: 'Error al eliminar el cliente.' });
    }
});

// --- Rutas para Módulo 5: Catálogo de Productos ---

// --- Módulo: Gestor de Conocimiento Dinámico (Multi-Cliente y con Lógica de Array) ---

// GET /api/clients/:clientId/products - Obtiene el catálogo de un cliente específico
app.get('/api/clients/:clientId/products', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // 1. Lee el array de clientes
    const clientsData = JSON.parse(await fs.readFile(CLIENTS_FILE_PATH, 'utf-8'));
    
    // 2. USA .find() PARA BUSCAR EN EL ARRAY
    const client = clientsData.find(c => c.clientId === clientId);

    if (!client || !client.knowledgeBasePath) {
      return res.status(404).json({ message: 'Cliente o su base de conocimiento no encontrada.' });
    }

    const productsFilePath = path.join(__dirname, client.knowledgeBasePath);
    const productsData = JSON.parse(await fs.readFile(productsFilePath, 'utf-8'));
    
    res.json(productsData);

  } catch (error) {
    if (error.code === 'ENOENT') return res.json([]);
    console.error('Error al obtener los productos del cliente:', error);
    res.status(500).json({ message: 'Error interno al obtener los productos del cliente.' });
  }
});

// POST /api/clients/:clientId/products - Añade un producto al catálogo de un cliente
app.post('/api/clients/:clientId/products', async (req, res) => {
  try {
    const { clientId } = req.params;
    const newProduct = req.body;

    const clientsData = JSON.parse(await fs.readFile(CLIENTS_FILE_PATH, 'utf-8'));
    const client = clientsData.find(c => c.clientId === clientId);
    if (!client || !client.knowledgeBasePath) {
      return res.status(404).json({ message: 'Cliente o base de conocimiento no encontrada.' });
    }

    const knowledgePath = path.join(__dirname, client.knowledgeBasePath);
    const productsData = JSON.parse(await fs.readFile(knowledgePath, 'utf-8'));

    newProduct.id = `prod_${Date.now()}`;
    productsData.push(newProduct);

    await fs.writeFile(knowledgePath, JSON.stringify(productsData, null, 2));
    res.status(201).json({ message: 'Producto añadido con éxito.', product: newProduct });

  } catch (error) {
    res.status(500).json({ message: 'Error al añadir el producto.' });
  }
});

// PUT /api/clients/:clientId/products/:productId - Edita un producto de un cliente
app.put('/api/clients/:clientId/products/:productId', async (req, res) => {
    try {
        const { clientId, productId } = req.params;
        const updatedData = req.body;

        const clientsData = JSON.parse(await fs.readFile(CLIENTS_FILE_PATH, 'utf-8'));
        const client = clientsData.find(c => c.clientId === clientId);
        if (!client || !client.knowledgeBasePath) {
            return res.status(404).json({ message: 'Cliente o su base de conocimiento no encontrada.' });
        }

        const knowledgePath = path.join(__dirname, client.knowledgeBasePath);
        const productsData = JSON.parse(await fs.readFile(knowledgePath, 'utf-8'));

        const productIndex = productsData.findIndex(p => p.id === productId);
        if (productIndex === -1) {
            return res.status(404).json({ message: 'Producto no encontrado en la base de conocimiento de este cliente.' });
        }

        // Actualizamos el producto con los nuevos datos, manteniendo el ID original
        productsData[productIndex] = { ...productsData[productIndex], ...updatedData };
        
        await fs.writeFile(knowledgePath, JSON.stringify(productsData, null, 2));
        res.json({ message: 'Producto actualizado con éxito.', product: productsData[productIndex] });

    } catch (error) {
        console.error(`Error al actualizar el producto ${productId} para el cliente ${clientId}:`, error);
        res.status(500).json({ message: 'Error al actualizar el producto.' });
    }
});

// DELETE /api/clients/:clientId/products/:productId - Elimina un producto de un cliente
app.delete('/api/clients/:clientId/products/:productId', async (req, res) => {
    try {
        const { clientId, productId } = req.params;

        const clientsData = JSON.parse(await fs.readFile(CLIENTS_FILE_PATH, 'utf-8'));
        const client = clientsData.find(c => c.clientId === clientId);
        if (!client || !client.knowledgeBasePath) {
            return res.status(404).json({ message: 'Cliente o su base de conocimiento no encontrada.' });
        }

        const knowledgePath = path.join(__dirname, client.knowledgeBasePath);
        const productsData = JSON.parse(await fs.readFile(knowledgePath, 'utf-8'));
        
        const newProducts = productsData.filter(p => p.id !== productId);

        if (productsData.length === newProducts.length) {
            return res.status(404).json({ message: 'Producto no encontrado para eliminar.' });
        }

        await fs.writeFile(knowledgePath, JSON.stringify(newProducts, null, 2));
        res.json({ message: 'Producto eliminado con éxito.' });

    } catch (error) {
        console.error(`Error al eliminar el producto ${productId} para el cliente ${clientId}:`, error);
        res.status(500).json({ message: 'Error al eliminar el producto.' });
    }
});


// --- Iniciar el servidor ---
app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST}:${PORT}`);
});
