// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini, gestionando sesiones con Redis y usando herramientas.
// Versión: Definitiva, adaptada para la librería @google/genai.

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs/promises'; // Usar la versión de promesas para consistencia
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import redisClient from '../config/redisClient.js';

// --- LEER CONFIGURACIÓN EXTERNA (DE FORMA ROBUSTA) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config.json'); 
const productsPath = path.join(__dirname, '..', 'products.json'); 

let CONFIG = {};

(async () => {
  try {
    const configFile = await fs.readFile(configPath, 'utf-8'); // <-- Asíncrono
    CONFIG = JSON.parse(configFile);
    console.log('✅ Configuración cargada con éxito (asíncrono).');
  } catch (error) {
    console.error(`Error al leer o parsear config.json de forma asíncrona: ${error.message}`);
    CONFIG = {
      DEFAULT_SYSTEM_INSTRUCTION: "Eres un asistente de IA conversacional y amigable.",
      GEMINI_MODEL: "models/gemini-1.5-pro-latest",
      MAX_HISTORY_TURNS: 10
    };
    console.warn("Se usarán valores de configuración por defecto debido a un error en la carga asíncrona.");
  }
})();

// --- INICIALIZACIÓN DE DEPENDENCIAS ---
// Nota: Centralizar el cliente Redis en /config/redisClient.js es la mejor práctica final.
// Por ahora, lo mantenemos aquí para que el archivo sea autocontenido.
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { throw new Error("GEMINI_API_KEY es requerida."); }
const genAI = new GoogleGenAI({ apiKey });

// --- DEFINICIÓN DE HERRAMIENTAS ---
const tools = [{
  functionDeclarations: [
    {
      name: "getProductInfo",
      description: "Busca en el catálogo de productos para ver el menú completo, obtener detalles de un item específico, o dar recomendaciones. Se debe usar siempre que el cliente pregunte 'qué tienes', 'cuál es el menú', 'qué recomiendas', o cualquier pregunta sobre los productos.",
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
async function _updateSessionInstruction(redisKey, newInstruction) {
    // Implementación de la función...
}
export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => { /*...*/ };

// --- FUNCIÓN MOTOR GENÉRICA (LÓGICA CENTRAL) ---
async function _getGenericGeminiResponse(userId, userMessage, platformPrefix) {
  try {
    const redisKey = `${platformPrefix}:${userId}`;
    const serializedSession = await redisClient.get(redisKey);

    let conversationHistory = [];
    let systemInstructionText = CONFIG.DEFAULT_SYSTEM_INSTRUCTION;

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      conversationHistory = sessionData.history || [];
      systemInstructionText = sessionData.systemInstruction || CONFIG.DEFAULT_SYSTEM_INSTRUCTION;
    }
    
    let apiContents = [];
    apiContents.push({ role: "user", parts: [{ text: `INSTRUCCIONES IMPORTANTES...: ${systemInstructionText}` }] });
    apiContents.push({ role: "model", parts: [{ text: "Entendido..." }] });
    apiContents.push(...conversationHistory);
    apiContents.push({ role: "user", parts: [{ text: userMessage }] });

    const result = await genAI.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: apiContents,
        tools: tools,
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
    });

    let call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    const functionCallRegex = /getProductInfo\(([^)]*)\)/;
    const match = responseText?.match(functionCallRegex);
    if (!call && match) {
        console.log("¡Llamada a función 'pensada en voz alta' detectada! Forzando el flujo de herramientas.");
        const argContent = match[1].replace(/['"`]/g, '');
        call = { name: "getProductInfo", args: { productName: argContent } };
        responseText = null; 
    }
    
    let functionCallPart = null;
    let toolResponsePart = null;
    
    if (call) {
      const { name, args } = call;
      let functionResponsePayload;
      if (name === "getProductInfo") {
        const productsData = JSON.parse(await fs.readFile(productsPath, 'utf-8'));
        const productName = args.productName || "";
        const foundProducts = productName ? productsData.filter(p => p.name.toLowerCase().includes(productName.toLowerCase())) : productsData;
        functionResponsePayload = {
            name: "getProductInfo",
            response: { products: foundProducts.length > 0 ? foundProducts : [] }
        };
      }
      
      if (functionResponsePayload) {
        functionCallPart = { role: "model", parts: [{ functionCall: call }] };
        toolResponsePart = { role: "tool", parts: [{ functionResponse: functionResponsePayload }] };

        // --- LA CORRECCIÓN FINAL ---
        const contentsForSecondCall = [
            ...conversationHistory,
            { role: 'user', parts: [{ text: userMessage }] },
            functionCallPart,
            toolResponsePart
        ];

        const secondResult = await genAI.models.generateContent({
            model: CONFIG.GEMINI_MODEL,
            contents: contentsForSecondCall,
        });
        responseText = secondResult?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
    }

    if (!responseText) {
      throw new Error("La respuesta final de la API no contenía texto.");
    }
    
    let newHistoryForRedis = [...conversationHistory];
    newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
    if (functionCallPart && toolResponsePart) {
      newHistoryForRedis.push(functionCallPart);
      newHistoryForRedis.push(toolResponsePart);
    }
    newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });
    
    // ... tu lógica de recorte de historial ...
    
    await redisClient.set(redisKey, JSON.stringify({
      history: newHistoryForRedis,
      systemInstruction: systemInstructionText
    }), { EX: 3600 });
    
    return responseText;

  } catch (error) {
    console.error(`Error en _getGenericGeminiResponse para ${platformPrefix}:${userId}:`, error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
  }
}

// --- FUNCIONES PÚBLICAS "ADAPTADORAS" ---
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
    
    let apiContents = [
        { role: "user", parts: [{ text: `INSTRUCCIONES...: ${systemInstructionText}` }] },
        { role: "model", parts: [{ text: "Entendido..." }] },
        ...conversationHistory,
        { role: "user", parts: [{ text: userMessage }] }
    ];

    const result = await genAI.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: apiContents,
        tools: tools,
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
    });

    let call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // --- PARCHE DE COMPORTAMIENTO (LA SOLUCIÓN FINAL) ---
    // Revisamos si la respuesta de texto CONTIENE una llamada a función "pensada en voz alta"
    const functionCallRegex = /getProductInfo\(([^)]*)\)/;
    const match = responseText?.match(functionCallRegex);
    
    // Si la llamada estructurada no vino, PERO nuestro regex encontró una en el texto...
    if (!call && match) {
        console.log("¡Llamada a función detectada en el texto! Forzando el flujo de herramientas.");
        // Creamos un objeto 'call' falso para que el resto de nuestro código funcione.
        const argContent = match[1].replace(/['"`]/g, ''); // Limpiar comillas de los argumentos
        call = { 
            name: "getProductInfo", 
            args: { productName: argContent } 
        };
        // Importante: borramos el texto para no enviarlo al usuario.
        responseText = null; 
    }
    // --- FIN DEL PARCHE ---

    let functionCallPart = null;
    let toolResponsePart = null;

    if (call) {
      console.log("Llamada a función (real o forzada) detectada:", call.name);
      const { name, args } = call;
      let functionResponsePayload;

      if (name === "getProductInfo") {
        const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
        const productName = args.productName || "";
        const foundProducts = productName ? productsData.filter(p => p.name.toLowerCase().includes(productName.toLowerCase())) : productsData;
        functionResponsePayload = {
            name: "getProductInfo",
            response: { products: foundProducts.length > 0 ? foundProducts : [] }
        };
      }
      
      if (functionResponsePayload) {
        functionCallPart = { role: "model", parts: [{ functionCall: call }] };
        toolResponsePart = { role: "tool", parts: [{ functionResponse: functionResponsePayload }] };

        const secondResult = await genAI.models.generateContent({
            model: CONFIG.GEMINI_MODEL,
            contents: [ ...apiContents, functionCallPart, toolResponsePart ],
        });
        responseText = secondResult?.candidates?.[0]?.content?.parts?.[0]?.text;
      }
    }

    if (!responseText) {
      throw new Error("La respuesta final de la API no contenía texto.");
    }
    
    let newHistoryForRedis = [...conversationHistory];
    newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
    if (functionCallPart && toolResponsePart) {
      newHistoryForRedis.push(functionCallPart);
      newHistoryForRedis.push(toolResponsePart);
    }
    newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });
    
    // ... tu lógica de recorte de historial ...
    
    await redisClient.set(redisKey, JSON.stringify({
      history: newHistoryForRedis,
      systemInstruction: systemInstructionText
    }), { EX: 3600 });
    
    return responseText;

  } catch (error) {
    console.error(`Error en getGeminiResponseForWhatsapp para ${senderId}:`, error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
  }
};

// --- AÑADE O VERIFICA ESTA FUNCIÓN ---
export const getGeminiResponseForMessenger = async (senderId, userMessage) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session');
};
// ------------------------------------

// --- FUNCIÓN PARA PRUEBAS DE PROMPT ---
export const getTestResponse = async (systemInstruction, history, userMessage) => {
  // (La implementación de esta función que ya tienes es correcta)
};