// File: services/geminiService.js
// VERSIÓN FINAL Y UNIFICADA

import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import redisClient from '../config/redisClient.js';

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
        { role: "user", parts: [{ text: `INSTRUCCIONES: ${systemInstructionText}` }] },
        { role: "model", parts: [{ text: "Entendido." }] },
        ...conversationHistory,
        { role: "user", parts: [{ text: userMessage }] }
    ];

    const result = await genAI.models.generateContent({
        model: CONFIG.GEMINI_MODEL,
        contents: apiContents,
        tools: tools,
    });

    let call = result?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    let responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    const functionCallRegex = /getTheMenu/i;
    const match = responseText?.match(functionCallRegex);
    if (!call && match) {
      call = { name: "getTheMenu", args: {} };
    }
    
    if (call && call.name === "getTheMenu") {
      console.log(`Función '${call.name}' detectada para ${platformPrefix}:${userId}. Procesando localmente.`);
      const productsData = JSON.parse(await fs.readFile(productsPath, 'utf-8'));
      
      if (productsData && productsData.length > 0) {
        let menuText = "¡Claro! Aquí tienes nuestro delicioso menú:\n\n";
        productsData.forEach(p => {
          menuText += `* ${p.name} - $${p.price}\n`;
        });
        menuText += "\n¿Qué se te antoja ordenar?";
        responseText = menuText;
      } else {
        responseText = "Lo siento, parece que estamos actualizando nuestro menú. Intenta de nuevo más tarde.";
      }
      
      let newHistoryForRedis = [...conversationHistory];
      newHistoryForRedis.push({ role: 'user', parts: [{ text: userMessage }] });
      newHistoryForRedis.push({ role: 'model', parts: [{ functionCall: call }] }); 
      newHistoryForRedis.push({ role: 'model', parts: [{ text: responseText }] });

      await redisClient.set(redisKey, JSON.stringify({ history: newHistoryForRedis, systemInstruction: systemInstructionText }), { EX: 3600 });
      return responseText;
    }

    if (!responseText) { throw new Error("La respuesta inicial de la API no contenía texto."); }
    
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
export const getGeminiResponseForWhatsapp = (senderId, userMessage) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'whatsapp_session');
};
export const getGeminiResponseForMessenger = (senderId, userMessage) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session');
};

// --- FUNCIÓN PARA PRUEBAS DE PROMPT ---
export const getTestResponse = async (systemInstruction, history, userMessage) => {
    // La función de prueba ahora puede ser mucho más simple,
    // ya que la lógica principal está en la función genérica.
    // O podemos mantener la versión con el parche para asegurar consistencia en las pruebas.
    // Por ahora, la dejamos como un placeholder a la espera de su implementación final si es necesaria.
    console.warn("getTestResponse necesita ser re-evaluada con la nueva arquitectura.");
    return "Función de prueba no implementada con la lógica final.";
};