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

// --- FUNCIÓN MOTOR GENÉRICA (LÓGICA CENTRAL REFACTORIZADA Y CORREGIDA) ---
async function _getGenericGeminiResponse(userId, userMessage, platformPrefix, clientProfile) {
  const redisKey = `${platformPrefix}:${userId}`;
  // Declare conversationHistory and systemInstructionText here to ensure they are in scope for finally block
  let conversationHistory = [];
  // Initialize systemInstructionText with clientProfile default, may be overwritten by session data
  let systemInstructionText = clientProfile.systemInstruction;
  let finalResponseText = "Lo siento, no pude procesar tu solicitud en este momento."; // Default error message

  try {
    const serializedSession = await redisClient.get(redisKey);

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      conversationHistory = sessionData.history || []; // Load history or default to empty
      systemInstructionText = sessionData.systemInstruction || clientProfile.systemInstruction; // Load instruction or use clientProfile
    }
    
    const modelName = clientProfile.geminiModel || process.env.GEMINI_MODEL || "gemini-1.5-flash";

    // --- FIRST CALL: Determine intent and identify potential function calls using genAI.models.generateContent ---
    // Frame the system instruction as the first turn of the conversation for maximum reliability.
    // This is more effective than the 'system' role or a separate parameter for some models/setups.
    const contentsForFirstCall = [
      { role: "user", parts: [{ text: `Please follow these instructions for our entire conversation: ${systemInstructionText}` }] },
      { role: "model", parts: [{ text: "Understood. I will follow those instructions carefully." }] },
      ...conversationHistory,
      { role: "user", parts: [{ text: userMessage }] }
    ];

    console.log(`[${redisKey}] Making first call to Gemini with genAI.models.generateContent. Model: ${modelName}. History length: ${contentsForFirstCall.length}`);
    const firstCallResult = await genAI.models.generateContent({
      model: modelName,
      contents: contentsForFirstCall,
      // systemInstruction parameter removed in favor of placing it in 'contents'
      tools: clientProfile.tools ? [{ functionDeclarations: clientProfile.tools }] : undefined,
      toolConfig: clientProfile.tools ? { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } : undefined,
    });

    // The response structure from generateContent has `candidates` directly on the result object.
    const firstCallResponse = firstCallResult;

    // Ensure firstCallResponse and its candidates are valid
    if (!firstCallResponse || !firstCallResponse.candidates || firstCallResponse.candidates.length === 0) {
      console.error(`[${redisKey}] Invalid response structure or no candidates in firstCallResult:`, JSON.stringify(firstCallResponse, null, 2));
      conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });
      conversationHistory.push({ role: "model", parts: [{ text: "Sorry, I received an invalid or empty response from the AI." }] });
      finalResponseText = "Lo siento, tuve un problema al procesar tu solicitud (respuesta inválida de IA).";
      return finalResponseText;
    }

    const firstCandidate = firstCallResponse.candidates[0];

    if (!firstCandidate || !firstCandidate.content || !firstCandidate.content.parts || firstCandidate.content.parts.length === 0) {
      console.error(`[${redisKey}] Invalid response structure from first call:`, JSON.stringify(firstCallResponse));
      conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });
      conversationHistory.push({ role: "model", parts: [{ text: "Sorry, I received an unexpected response from the AI." }] });
      finalResponseText = "Lo siento, tuve un problema al procesar tu solicitud (respuesta inesperada de IA).";
      return finalResponseText;
    }

    const firstPart = firstCandidate.content.parts[0];
    const functionCall = firstPart.functionCall;

    conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });

    if (functionCall) {
      console.log(`[${redisKey}] Function call detected: ${functionCall.name}. Args:`, functionCall.args);
      conversationHistory.push({ role: "model", parts: [{ functionCall }] });

      const functionToCall = availableTools[functionCall.name];
      let toolExecutionResult;

      if (functionToCall) {
        try {
          console.log(`[${redisKey}] Executing tool: ${functionCall.name}`);
          const toolArgs = { ...functionCall.args };
          if (clientProfile.knowledgeBasePath) {
             toolArgs.knowledgeBasePath = path.join(__dirname, '..', clientProfile.knowledgeBasePath);
          }
          toolExecutionResult = await functionToCall(toolArgs);
        } catch (e) {
          console.error(`[${redisKey}] Error executing tool ${functionCall.name}:`, e);
          toolExecutionResult = { error: `Error executing tool ${functionCall.name}: ${e.message}` };
        }
      } else {
        console.error(`[${redisKey}] Unknown function requested: ${functionCall.name}`);
        toolExecutionResult = { error: `Unknown function: ${functionCall.name}` };
      }

      const functionResponsePart = {
        role: "function",
        parts: [{ functionResponse: { name: functionCall.name, response: toolExecutionResult } }]
      };
      
      conversationHistory.push(functionResponsePart);

      // --- SECOND CALL: With tool response to get final text summary ---
      // System instruction is typically not needed for the second call if it's just summarizing tool output based on history.
      // Tools are also not needed for the second call.
      console.log(`[${redisKey}] Making second call to Gemini with genAI.models.generateContent. History length: ${conversationHistory.length}`);
      const secondCallResult = await genAI.models.generateContent({
        model: modelName, // Still need to specify the model for the second call
        contents: conversationHistory
      });

      // The response structure from generateContent is directly result.response
      const secondCallResponse = secondCallResult.response;
      const secondCandidate = secondCallResponse.candidates?.[0];
      finalResponseText = secondCandidate?.content?.parts?.[0]?.text;

      if (finalResponseText) {
        conversationHistory.push({ role: "model", parts: [{ text: finalResponseText }] });
      } else {
        console.warn(`[${redisKey}] Second call to Gemini did not return text. Storing placeholder.`);
        conversationHistory.push({ role: "model", parts: [{ text: "Action processed. No further text response from AI." }] });
        finalResponseText = "Action processed.";
      }
    } else {
      finalResponseText = firstPart.text;
      if (finalResponseText) {
        conversationHistory.push({ role: "model", parts: [{ text: finalResponseText }] });
      } else {
        console.warn(`[${redisKey}] First call did not return text and no function call. Response:`, JSON.stringify(firstCallResponse));
        finalResponseText = "I received your message, but I don't have a specific text response for you right now.";
        conversationHistory.push({ role: "model", parts: [{ text: finalResponseText }] });
      }
    }
    return finalResponseText;

  } catch (error) {
    console.error(`Error in _getGenericGeminiResponse for ${platformPrefix}:${userId}:`, error);
    // Ensure conversationHistory is an array before pushing, even if an early error occurred.
    if (!Array.isArray(conversationHistory)) {
        conversationHistory = [];
    }
    // Check if user message was already added to prevent duplicates if error occurred late.
    if (!conversationHistory.find(entry => entry.role === "user" && entry.parts.some(p => p.text === userMessage))) {
        conversationHistory.push({ role: "user", parts: [{ text: userMessage }] });
    }
    // Add the current error message as the model's response to store this turn's outcome.
    conversationHistory.push({ role: "model", parts: [{ text: finalResponseText }] });
    return finalResponseText;
  } finally {
    try {
      // Ensure conversationHistory is an array before stringifying, for safety.
      if (!Array.isArray(conversationHistory)) {
          conversationHistory = [];
          console.warn(`[${redisKey}] conversationHistory was not an array in finally block. Resetting to empty for save.`);
      }
      await redisClient.set(redisKey, JSON.stringify({ history: conversationHistory, systemInstruction: systemInstructionText }), { EX: 3600 });
      console.log(`[${redisKey}] Conversation history saved to Redis. Length: ${conversationHistory.length}`);
    } catch (redisError) {
      console.error(`[${redisKey}] CRITICAL: Failed to save conversation history to Redis:`, redisError);
    }
  }
}

// --- FUNCIONES PÚBLICAS "ADAPTADORAS" ---
export const getGeminiResponseForWhatsapp = (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'whatsapp_session', clientProfile);
};
export const getGeminiResponseForMessenger = (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session', clientProfile);
};

// --- FUNCIÓN PARA PRUEBAS DE PROMPT (REFACTORIZADA Y CORREGIDA) ---
export const getTestResponse = async (systemInstruction, history, userMessage) => {
  try {
    const effectiveSystemInstruction = systemInstruction || CONFIG.DEFAULT_SYSTEM_INSTRUCTION;
    const modelName = CONFIG.GEMINI_MODEL; // Use a globally defined test model

    // Frame the system instruction as the first turn of the conversation for getTestResponse as well.
    let contentsForCall = [
      { role: "user", parts: [{ text: `Please follow these instructions for our entire conversation: ${effectiveSystemInstruction}` }] },
      { role: "model", parts: [{ text: "Understood. I will follow those instructions carefully." }] }
    ];
    if (history && Array.isArray(history)) {
      contentsForCall.push(...history);
    }
    if (userMessage) {
      contentsForCall.push({ role: "user", parts: [{ text: userMessage }] });
    }

    console.log(`[getTestResponse] Making API call with genAI.models.generateContent. Model: ${modelName}. History length: ${contentsForCall.length}`);
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: contentsForCall,
      // systemInstruction parameter removed in favor of placing it in 'contents'
      tools: tools ? [{ functionDeclarations: tools[0].functionDeclarations }] : undefined,
      toolConfig: tools ? { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } : undefined,
    });

    // The response structure from generateContent has candidates directly on the result object.
    const response = result; // The whole result is what we need to check for candidates
    
    if (!response || !response.candidates || response.candidates.length === 0) {
      console.error('[getTestResponse] Invalid response structure or no candidates in API result:', JSON.stringify(response, null, 2));
      return "Error: Respuesta inesperada o vacía de la API de prueba (sin candidatos).";
    }

    const candidate = response.candidates[0];

    if (!candidate || !candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
      console.error('[getTestResponse] Invalid response structure from API:', JSON.stringify(response));
      return "Error: Respuesta inesperada o vacía de la API de prueba.";
    }

    const part = candidate.content.parts[0];
    const functionCall = part.functionCall;

    if (functionCall) {
      const functionName = functionCall.name;
      const args = JSON.stringify(functionCall.args);
      const diagnosticMessage = `[Llamada a la función detectada: ${functionName} con los argumentos: ${args}]`;
      console.log(`[getTestResponse] ${diagnosticMessage}`);
      return diagnosticMessage;
    }

    const responseText = part.text;
    if (responseText) {
      console.log(`[getTestResponse] Text response received: "${responseText}"`);
      return responseText;
    }

    console.warn("[getTestResponse] No function call and no text returned from API.");
    return "Respuesta de prueba no contenía ni llamada a función ni texto.";

  } catch (error) {
    console.error(`Error en getTestResponse:`, error);
    return `Lo siento, ocurrió un error en la prueba: ${error.message}`;
  }
};