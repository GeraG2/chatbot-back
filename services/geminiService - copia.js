// File: services/geminiService.js
// VERSIÓN FINAL Y UNIFICADA

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
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
    // Tu lógica correcta para actualizar la instrucción en Redis
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

    if (serializedSession) {
      conversationHistory = JSON.parse(serializedSession).history || [];
    }

    // --- PRIMERA LLAMADA: Entender la intención del usuario ---
    const modelForFirstCall = genAI.getGenerativeModel({
        model: clientProfile.geminiModel,
        systemInstruction: { parts: [{ text: systemInstructionText }] },
        tools: clientProfile.tools
    });
    
    const chat = modelForFirstCall.startChat({ history: conversationHistory });
    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    const call = response.candidates?.[0]?.content?.parts?.find(part => part.functionCall)?.functionCall;

    // --- SI LA IA PIDE USAR UNA HERRAMIENTA ---
    if (call && availableTools[call.name]) {
      console.log(`Función '${call.name}' detectada. Ejecutando localmente...`);
      
      const toolResult = await availableTools[call.name]({
          ...call.args,
          knowledgeBasePath: clientProfile.knowledgeBasePath
      });

      // --- SEGUNDA LLAMADA: Darle a la IA el resultado para que formule una respuesta ---
      const resultWithFunctionResponse = await chat.sendMessage([
        {
          functionResponse: {
            name: call.name,
            response: toolResult,
          },
        },
      ]);
      
      const finalResponseText = resultWithFunctionResponse.response.text();
      const newHistory = await chat.getHistory();
      
      await redisClient.set(redisKey, JSON.stringify({ history: newHistory, systemInstruction: systemInstructionText }), { EX: 3600 });
      return finalResponseText;
    }

    // --- SI LA IA RESPONDE CON TEXTO DIRECTAMENTE ---
    const responseText = response.text();
    if (!responseText) {
      throw new Error("La API de Gemini no devolvió texto ni una llamada a función.");
    }
    
    const newHistory = await chat.getHistory();
    await redisClient.set(redisKey, JSON.stringify({ history: newHistory, systemInstruction: systemInstructionText }), { EX: 3600 });
    
    return responseText;

  } catch (error) {
    console.error(`Error en _getGenericGeminiResponse para ${platformPrefix}:${userId}:`, error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
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