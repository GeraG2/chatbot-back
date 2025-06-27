// File: services/geminiService.js
// VERSIÓN FINAL - ADAPTADA A LA LIBRERÍA @google/genai

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import { createClient } from 'redis';

// --- LEER CONFIGURACIÓN EXTERNA ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config.json'); 
const productsPath = path.join(__dirname, '..', 'products.json'); 

let CONFIG = {};
try {
  const configFile = fs.readFileSync(configPath, 'utf-8');
  CONFIG = JSON.parse(configFile);
} catch (error) {
  console.error(`Error al leer o parsear config.json: ${error.message}`);
  CONFIG = {
    DEFAULT_SYSTEM_INSTRUCTION: "Eres un asistente de IA conversacional y amigable.",
    GEMINI_MODEL: "gemini-1.5-flash",
    MAX_HISTORY_TURNS: 10
  };
  console.warn("Se usarán valores de configuración por defecto.");
}
console.log('✅ Configuración cargada al iniciar el servicio.');


// --- INICIALIZACIÓN DE DEPENDENCIAS ---
const redisClient = createClient();
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { throw new Error("GEMINI_API_KEY es requerida."); }
const genAI = new GoogleGenAI({ apiKey });
(async () => {
  try {
    await redisClient.connect();
    console.log('Conectado al servidor Redis con éxito.');
  } catch (err) {
    console.error('No se pudo conectar al servidor Redis:', err);
  }
})();

// --- DEFINICIÓN DE HERRAMIENTAS ---
const tools = [{
  functionDeclarations: [
    {
      name: "getProductInfo",
      description: "Busca en el catálogo para ver el menú, obtener detalles de un producto, o dar recomendaciones. Se debe usar siempre que el cliente pregunte 'qué tienes', 'cuál es el menú', o 'qué recomiendas'.",
      parameters: {
        type: "OBJECT",
        properties: {
          productName: {
            type: "STRING",
            description: "El nombre del producto específico que el cliente menciona. Omitir para obtener el menú completo."
          }
        },
      }
    }
  ]
}];

// --- FUNCIONES DE GESTIÓN DE SESIÓN ---
// ... (Tus funciones setSystemInstructionForWhatsapp, etc. se quedan como estaban)
export async function _updateSessionInstruction(redisKey, newInstruction) { /* ... */ }
export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => { /* ... */ };


// --- FUNCIÓN PRINCIPAL DEL CHATBOT ---
export const getGeminiResponseForWhatsapp = async (senderId, userMessage) => {
  try {
    const redisKey = `whatsapp_session:${senderId}`;
    const serializedSession = await redisClient.get(redisKey);

    let conversationHistory = [];
    let systemInstructionText = CONFIG.DEFAULT_SYSTEM_INSTRUCTION;

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      conversationHistory = sessionData.history || [];
      systemInstructionText = sessionData.systemInstruction || CONFIG.DEFAULT_SYSTEM_INSTRUCTION;
    }
    
    // ... (La lógica para construir apiContents con el pacto y el ejemplo se mantiene)
    let apiContents = [];
    apiContents.push({ role: "user", parts: [{ text: `INSTRUCCIONES...: ${systemInstructionText}` }] });
    apiContents.push({ role: "model", parts: [{ text: "Entendido..." }] });
    apiContents.push({ role: "user", parts: [{ text: "¿Cuál es su menú?" }] });
    apiContents.push({ role: "model", parts: [{ functionCall: { name: "getProductInfo" } }] });
    apiContents.push(...conversationHistory);
    apiContents.push({ role: "user", parts: [{ text: userMessage }] });

    const result = await genAI.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: apiContents,
        tools: tools
    });

    // --- LA CORRECCIÓN DEFINITIVA DEL BUG ---
    // Leemos directamente de `result`, no de un `result.response` que no existe.
    const call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    let functionCallPart = null;
    let toolResponsePart = null;
    
    if (call) {
      // ... (El resto de la lógica de function call es idéntica y correcta)
      // ...
    }

    if (!responseText) {
      console.error("Respuesta inesperada o vacía. Objeto completo:", JSON.stringify(result, null, 2));
      throw new Error("La respuesta final de la API no contenía texto.");
    }
    
    // ... (El resto de la lógica para guardar en Redis es idéntica y correcta)
    // ...
    
    return responseText;

  } catch (error) {
    console.error(`Error en getGeminiResponseForWhatsapp para ${senderId}:`, error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
  }
};


// --- FUNCIÓN PARA PRUEBAS DE PROMPT ---
export const getTestResponse = async (systemInstruction, history) => {
    // ... (la implementación de esta función que ya tienes es correcta)
};