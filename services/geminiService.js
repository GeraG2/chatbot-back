// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini, gestionando sesiones con Redis y usando herramientas.
// Versión: Definitiva, Refactorizada y Completa

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import redisClient from '../config/redisClient.js';

// --- LEER CONFIGURACIÓN EXTERNA ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, '..', 'config.json'); 
const productsPath = path.join(__dirname, '..', 'products.json'); 

let CONFIG = {};
(async () => {
  try {
    const configFile = await fs.readFile(configPath, 'utf-8');
    CONFIG = JSON.parse(configFile);
    console.log('✅ Configuración cargada con éxito (asíncrono).');
  } catch (error) {
    console.error(`Error al leer o parsear config.json: ${error.message}`);
    CONFIG = {
      DEFAULT_SYSTEM_INSTRUCTION: "Eres un asistente de IA conversacional.",
      GEMINI_MODEL: "models/gemini-1.5-pro-latest",
      MAX_HISTORY_TURNS: 10
    };
    console.warn("Se usarán valores de configuración por defecto.");
  }
})();

// --- INICIALIZACIÓN DE GEMINI ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { throw new Error("GEMINI_API_KEY es requerida."); }
const genAI = new GoogleGenAI({ apiKey });

// --- DEFINICIÓN DE HERRAMIENTAS ---
const tools = [{
  functionDeclarations: [
    {
      name: "getTheMenu", // Un nombre más específico y sin ambigüedad
      description: "Consulta y devuelve la lista completa de todos los productos disponibles en el menú.",
      // SIN PARÁMETROS. La herramienta no acepta argumentos. Solo tiene una función.
      parameters: {
        type: "OBJECT",
        properties: {}
      }
    }
  ]
}];

// --- FUNCIONES DE GESTIÓN DE SESIÓN ---
async function _updateSessionInstruction(redisKey, newInstruction) {
  try {
    const serializedSession = await redisClient.get(redisKey);
    let sessionData = { history: [] }; // Iniciar con un historial vacío por si no existe
    if (serializedSession) {
      sessionData = JSON.parse(serializedSession);
    }
    sessionData.systemInstruction = newInstruction;
    await redisClient.set(redisKey, JSON.stringify(sessionData), { EX: 3600 });
    console.log(`Instrucción de sistema para la clave ${redisKey} actualizada.`);
    return true;
  } catch (error) {
    console.error(`Error al actualizar la instrucción para la clave ${redisKey} en Redis:`, error);
    return false;
  }
}

export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => {
  const redisKey = `whatsapp_session:${senderId}`;
  return _updateSessionInstruction(redisKey, newInstruction);
};

export const setSystemInstructionForMessenger = async (senderId, newInstruction) => {
    const redisKey = `messenger_session:${senderId}`;
    return _updateSessionInstruction(redisKey, newInstruction);
};

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
    
    let apiContents = [
        { role: "user", parts: [{ text: `INSTRUCCIONES IMPORTANTES...: ${systemInstructionText}` }] },
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
    
    const functionCallRegex = /getTheMenu/i; // Busca 'getTheMenu' sin importar mayúsculas
    const match = responseText?.match(functionCallRegex);
    
    if (!call && match) {
      console.log("¡Llamada a 'getTheMenu' detectada en el texto! Procesando localmente.");
      call = { name: "getTheMenu", args: {} };
    }
    
    if (call && call.name === "getTheMenu") {
      // --- LÓGICA SIMPLIFICADA Y A PRUEBA DE FALLOS ---
      // 1. Ejecutamos la herramienta para obtener los datos de los productos
      const productsData = JSON.parse(await fs.readFile(productsPath, 'utf-8'));
      
      // 2. FORMATEAMOS LA RESPUESTA NOSOTROS MISMOS
      if (productsData && productsData.length > 0) {
        let menuText = "¡Claro! Aquí tienes nuestro delicioso menú:\n\n";
        productsData.forEach(p => {
          menuText += `* ${p.name} - $${p.price}\n`;
        });
        menuText += "\n¿Qué se te antoja ordenar?";
        responseText = menuText;
      } else {
        responseText = "Lo siento, parece que estamos actualizando nuestro menú en este momento. Inténtalo de nuevo más tarde.";
      }
      
      // 3. ¡NO HAY SEGUNDA LLAMADA A LA API! Guardamos la interacción y terminamos.
      let functionCallPart = { role: "model", parts: [{ functionCall: call }] };
      // Ya no necesitamos 'toolResponsePart' para el historial porque la respuesta final es la importante.
      
      let newHistoryForRedis = [...conversationHistory];
      newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
      newHistoryForRedis.push(functionCallPart); // Guardamos que el bot intentó llamar
      newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] }); // Guardamos la respuesta que construimos

      await redisClient.set(redisKey, JSON.stringify({
          history: newHistoryForRedis,
          systemInstruction: systemInstructionText
      }), { EX: 3600 });
      
      return responseText;
    }


    if (!responseText) { throw new Error("La respuesta inicial de la API no contenía texto."); }
    
    // Flujo normal para conversaciones que no usan herramientas
    let newHistoryForRedis = [...conversationHistory];
    newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
    newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });
    
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
  return _getGenericGeminiResponse(senderId, userMessage, 'whatsapp_session');
};
export const getGeminiResponseForMessenger = async (senderId, userMessage) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session');
};

// --- FUNCIÓN PARA PRUEBAS DE PROMPT ---
export const getTestResponse = async (systemInstruction, history, userMessage) => {
  try {
    let apiContents = [];
    apiContents.push({ 
        role: "user", 
        parts: [{ text: `INSTRUCCIONES IMPORTANTES SOBRE TU PERSONA...: ${systemInstruction || CONFIG.DEFAULT_SYSTEM_INSTRUCTION}` }] 
    });
    apiContents.push({ 
        role: "model", 
        parts: [{ text: "Entendido. He asimilado mis instrucciones y actuaré como se me ha indicado." }] 
    });
    
    // El historial del sandbox SÍ debe incluir el mensaje del usuario
    if (history && Array.isArray(history)) {
      apiContents.push(...history);
    }
    if (userMessage) {
        apiContents.push({ role: "user", parts: [{text: userMessage}] });
    }

    const result = await genAI.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: apiContents,
        tools: tools,
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
    });

    let call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // --- AÑADIENDO EL PARCHE DE COMPORTAMIENTO A LA FUNCIÓN DE PRUEBA ---
    const functionCallRegex = /getTheMenu/i; 
    const match = responseText?.match(functionCallRegex);
    
    if (!call && match) {
        console.log("¡Llamada a función 'pensada en voz alta' detectada en SANDBOX! Forzando el flujo.");
        call = { name: "getTheMenu", args: {} };
        responseText = null; 
    }
    // --- FIN DEL PARCHE ---

    if (call) {
      // Para las pruebas, no necesitamos ejecutar la lógica de la segunda llamada,
      // solo confirmar que la intención fue correcta.
      const functionName = call.name;
      const args = JSON.stringify(call.args);
      return `[Llamada a la función detectada: ${functionName} con los argumentos: ${args}]`;
    }

    if (!responseText) {
      console.error("Respuesta final vacía en getTestResponse. Objeto completo:", JSON.stringify(result, null, 2));
      throw new Error("La respuesta final de la API no contenía texto.");
    }
    
    return responseText;

  } catch (error) {
    console.error(`Error en getTestResponse:`, error);
    return `Lo siento, ocurrió un error en la prueba: ${error.message}`;
  }
};