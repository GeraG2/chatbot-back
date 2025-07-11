// File: services/geminiService.js
// VERSIÓN FINAL Y UNIFICADA

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import redisClient from '../config/redisClient.js';
import { availableTools } from './toolShed.js';

// --- LEER CONFIGURACIÓN ---
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
      GEMINI_MODEL: "gemini-1.5-flash",
      MAX_HISTORY_TURNS: 10
    };
    console.warn("Se usarán valores de configuración por defecto.");
  }
})();

// --- INICIALIZACIÓN DE GEMINI ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { throw new Error("GEMINI_API_KEY es requerida."); }
const genAI = new GoogleGenAI({ apiKey });

// --- DEFINICIÓN DE HERRAMIENTAS SIMPLIFICADA ---
const tools = [{
  functionDeclarations: [
    {
      name: "getTheMenu",
      description: "Consulta y devuelve la lista completa de todos los productos disponibles en el menú.",
      parameters: { type: "OBJECT", properties: {} }
    }
  ]
}];

// --- FUNCIONES DE GESTIÓN DE SESIÓN ---
async function _updateSessionInstruction(redisKey, newInstruction) {
  try {
    const sessionData = JSON.parse(await redisClient.get(redisKey) || '{"history":[]}');
    sessionData.systemInstruction = newInstruction;
    await redisClient.set(redisKey, JSON.stringify(sessionData), { EX: 3600 });
    return true;
    } catch (error) {
    console.error(`Error al actualizar la instrucción para ${redisKey}:`, error);
    return false;
  }
}
export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => {
    return _updateSessionInstruction(`whatsapp_session:${senderId}`, newInstruction);
};
export const setSystemInstructionForMessenger = async (senderId, newInstruction) => {
    return _updateSessionInstruction(`messenger_session:${senderId}`, newInstruction);
};

// --- FUNCIÓN MOTOR GENÉRICA (LÓGICA CENTRAL) ---
async function _getGenericGeminiResponse(userId, userMessage, platformPrefix, clientProfile) {
  try {
    const redisKey = `${platformPrefix}:${userId}`;
    const serializedSession = await redisClient.get(redisKey);

    let conversationHistory = [];
    let systemInstructionText = clientProfile.systemInstruction;
    let tools = clientProfile.tools;

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      conversationHistory = sessionData.history || [];
      systemInstructionText = sessionData.systemInstruction || clientProfile.systemInstruction;
    }
    
    let apiContents = [
        { role: "user", parts: [{ text: `INSTRUCCIONES: ${systemInstructionText}` }] },
        { role: "model", parts: [{ text: "Entendido." }] },
        ...conversationHistory,
        { role: "user", parts: [{ text: userMessage }] }
    ];

    const result = await genAI.models.generateContent({
        model: clientProfile.gemini || process.env.GEMINI_MODEL || "gemini-1.5-flash",
        contents: apiContents,
        tools: tools,
        toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
        },
    });

    let call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // --- PARCHE DE COMPORTAMIENTO FINAL ---
    const functionName = tools[0]?.functionDeclarations?.[0]?.name; // Obtiene el nombre de la herramienta dinámicamente
    if (functionName && !call && responseText && responseText.includes(functionName)) {
      console.log(`Llamada a función '${functionName}' detectada en el texto. Procesando localmente.`);
      call = { name: functionName, args: {} };
    }
    
    if (call) {
      const knowledgeBasePath = path.join(__dirname, '..', clientProfile.knowledgeBasePath);
      const data = JSON.parse(await fs.readFile(knowledgeBasePath, 'utf-8'));
      
      if (data && data.length > 0) {
        let menuText = "¡Claro! Aquí tienes nuestro delicioso menú:\n\n";
        data.forEach(p => {
          menuText += `* ${p.name} - $${p.price}\n`;
        });
        menuText += "\n¿Qué se te antoja ordenar?";
        responseText = menuText;
      } else {
        responseText = "Lo siento, parece que estamos actualizando nuestro menú en este momento.";
      }
      
      let newHistoryForRedis = [...conversationHistory];
      newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
      newHistoryForRedis.push({ role: 'model', parts: [{ functionCall: call }] }); 
      newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });

      await redisClient.set(redisKey, JSON.stringify({ history: newHistoryForRedis, systemInstruction: systemInstructionText }), { EX: 3600 });
      return responseText;
    }

    if (!responseText) { throw new Error("La respuesta inicial de la API no contenía texto."); }
    
    // Flujo normal para conversaciones que no usan herramientas
    let newHistoryForRedis = [...conversationHistory];
    newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
    newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });
    
    await redisClient.set(redisKey, JSON.stringify({ history: newHistoryForRedis, systemInstruction: systemInstructionText }), { EX: 3600 });
    return responseText;

  } catch (error) {
    console.error(`Error en _getGenericGeminiResponse para ${platformPrefix}:${userId}:`, error);
    return "Lo siento, no pude procesar tu solicitud.";
  }
}

// --- FUNCIONES PÚBLICAS "ADAPTADORAS" ---
export const getGeminiResponseForWhatsapp = (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'whatsapp_session', clientProfile);
};
export const getGeminiResponseForMessenger = (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session', clientProfile);
};

// --- FUNCIÓN PARA PRUEBAS DE PROMPT ---
export const getTestResponse = async (systemInstruction, history, userMessage) => {
  try {
    let apiContents = [];
    apiContents.push({ 
        role: "user", 
        parts: [{ text: `INSTRUCCIONES IMPORTANTES...: ${systemInstruction || CONFIG.DEFAULT_SYSTEM_INSTRUCTION}` }] 
    });
    apiContents.push({ 
        role: "model", 
        parts: [{ text: "Entendido." }] 
    });
    
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
    
    // APLICANDO EL PARCHE DE COMPORTAMIENTO TAMBIÉN AQUÍ
    const functionCallRegex = /getTheMenu/i; 
    const match = responseText?.match(functionCallRegex);
    
    if (!call && match) {
        console.log("¡Llamada a función 'pensada en voz alta' detectada en SANDBOX! Forzando el flujo.");
        call = { name: "getTheMenu", args: {} };
        responseText = null; 
    }
    
    // Si se detecta una llamada (real o forzada), devolvemos el mensaje de diagnóstico
    if (call) {
      const functionName = call.name;
      const args = JSON.stringify(call.args);
      const diagnosticMessage = `[Llamada a la función detectada: ${functionName} con los argumentos: ${args}]`;
      return diagnosticMessage;
    }

    if (!responseText) {
      throw new Error("La respuesta de prueba de la API no contenía texto.");
    }
    
    return responseText;

  } catch (error) {
    console.error(`Error en getTestResponse:`, error);
    return `Lo siento, ocurrió un error en la prueba: ${error.message}`;
  }
};