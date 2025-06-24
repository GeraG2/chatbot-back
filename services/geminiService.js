// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini y la gestión de sesiones.

import { createClient } from 'redis';
import { GoogleGenAI } from "@google/genai"; // Correct: GoogleGenerativeAI
import { v4 as uuidv4 } from 'uuid';
import { getCurrentContext } from '../controllers/adminController.js'; // Importar para obtener el contexto dinámico

// Initialize Redis client
const redisClient = createClient();

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis server successfully.');
  } catch (err) {
    console.error('Could not connect to Redis server:', err);
  }
})();

// Cargar la API Key desde las variables de entorno
const apiKey = process.env.GEMINI_API_KEY; // Correct: Define apiKey
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

const genAI = new GoogleGenAI(apiKey); // Corrected instantiation

// Define Default System Instruction for WhatsApp users
// const DEFAULT_SYSTEM_INSTRUCTION = "Eres un asistente de IA útil y amigable."; // Ya no es necesario aquí, se obtiene de adminController

/**
 * Inicializa una nueva sesión de chat de Gemini.
 * @param {string} [systemInstructionParam] - El contexto de entrenamiento inicial (opcional, prioriza el de adminController).
 * @returns {{sessionId: string, chat: object}} - El ID de la sesión y el objeto de chat.
 */
export const initializeChatSession = async (systemInstructionParam) => {
  const sessionId = uuidv4();
  const dynamicSystemInstruction = getCurrentContext(); // Obtener contexto dinámico
  const chatConfig = {
    history: [], // El historial se gestionará aquí si es necesario
    systemInstruction: systemInstructionParam || dynamicSystemInstruction // Usar parámetro si se provee, sino el dinámico
  };

  // modelName could be a parameter or from config
  const modelName = "gemini-1.5-flash";
  // Asegurarse de que systemInstruction siempre tenga un valor
  const instructionToUse = chatConfig.systemInstruction || "Eres un asistente de IA útil y amigable por defecto.";
  const chat = genAI.chats.create({ model: modelName, history: chatConfig.history || [], config: { systemInstruction: { parts: [{text: instructionToUse}] } } });

  const sessionData = {
    modelName,
    history: chatConfig.history || [],
    systemInstruction: instructionToUse,
  };

  try {
    await redisClient.set(sessionId, JSON.stringify(sessionData), { EX: 3600 });
    console.log(`Session ${sessionId} stored in Redis.`);
  } catch (err) {
    console.error(`Error storing session ${sessionId} in Redis:`, err);
    // Fallback or error handling if Redis fails
    // For now, we'll just log the error. Depending on requirements,
    // we might want to throw the error or use an in-memory cache as a backup.
  }

  return { sessionId, chat };
};

/**
 * Obtiene una respuesta de Gemini para usuarios de WhatsApp (sin streaming).
 * Gestiona sesiones de chat para cada senderId.
 * @param {string} senderId - El ID del remitente de WhatsApp (usado como ID de sesión).
 * @param {string} userMessage - El mensaje del usuario.
 * @returns {Promise<string>} - La respuesta de texto de Gemini.
 */
export const getGeminiResponseForWhatsapp = async (senderId, userMessage) => {
  let chat = null;
  const modelName = "gemini-1.5-flash"; // Consistent model name
  const systemInstructionToUse = getCurrentContext() || "Eres un asistente de IA útil y amigable por defecto para WhatsApp."; // Obtener contexto dinámico

  try {
    const serializedSession = await redisClient.get(senderId);

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      chat = genAI.chats.create({
        model: sessionData.modelName,
        history: sessionData.history,
        config: { systemInstruction: { parts: [{text: sessionData.systemInstruction}] } }
      });
      await redisClient.expire(senderId, 3600); // Refresh TTL
      console.log(`Usando sesión de chat existente para WhatsApp senderId: ${senderId} desde Redis`);
    }

    if (!chat) {
      console.log(`Creando nueva sesión de chat para WhatsApp senderId: ${senderId} con instrucción: "${systemInstructionToUse}"`);
      chat = genAI.chats.create({ model: modelName, history: [], config: { systemInstruction: { parts: [{text: systemInstructionToUse}] } } });

      const sessionDataToStore = {
        modelName,
        history: [],
        systemInstruction: systemInstructionToUse,
      };
      await redisClient.set(senderId, JSON.stringify(sessionDataToStore), { EX: 3600 });
      console.log(`Nueva sesión de WhatsApp para ${senderId} almacenada en Redis.`);
    }

    const result = await chat.sendMessage({ message: userMessage });
    // The result itself is GenerateContentResponse, text is accessed via a getter
    if (result && result.text !== undefined) { 
      const responseText = result.text;
      return responseText;
    } else {
      console.error("Respuesta inesperada de la API de Gemini o sin texto:", result);
      // It's possible a valid response might not have text if it's a function call or safety block
      // For now, we'll treat it as an error if no text is found for WhatsApp.
      throw new Error("Respuesta inesperada de la API de Gemini o sin contenido de texto.");
    }
  } catch (error) {
    console.error(`Error al obtener respuesta de Gemini para WhatsApp senderId ${senderId}:`, error);
    // Puedes decidir si lanzar el error o devolver un mensaje de error específico
    // throw error; // Re-lanzar si quieres que el llamador maneje el error completo
    return "Lo siento, no pude procesar tu solicitud en este momento."; // O un mensaje amigable
  }
};

/**
 * Envía un mensaje a Gemini y transmite la respuesta al cliente.
 * @param {string} sessionId - El ID de la sesión a la que se envía el mensaje.
 * @param {string} userMessage - El mensaje del usuario.
 * @param {function} sendEventCallback - Callback para enviar eventos SSE al cliente.
 */
export const streamMessageToGemini = async (sessionId, userMessage, sendEventCallback) => {
  let chat = null;
  try {
    const serializedSession = await redisClient.get(sessionId);

    if (!serializedSession) {
      sendEventCallback({ type: 'error', message: 'Sesión de chat no válida o expirada.' });
      throw new Error('Sesión de chat no válida o expirada.');
    }

    const sessionData = JSON.parse(serializedSession);
    chat = genAI.chats.create({
      model: sessionData.modelName,
      history: sessionData.history,
      config: { systemInstruction: { parts: [{text: sessionData.systemInstruction}] } }
    });
    await redisClient.expire(sessionId, 3600); // Refresh TTL
    console.log(`Chat session ${sessionId} retrieved from Redis and TTL refreshed.`);

    // Proceed with sending message
    console.log("Chat object before sendMessageStream:", chat);
    const result = await chat.sendMessageStream({ message: userMessage });
    console.log("Result from sendMessageStream:", result);
    for await (const chunk of result) {
      const chunkText = chunk.text;
      // Enviar cada fragmento al cliente a través del callback
      sendEventCallback({ type: 'chunk', text: chunkText });
    }

  } catch (error) {
    console.error("Error al hacer streaming desde Gemini:", error);
    // Enviar un evento de error al cliente
    sendEventCallback({ type: 'error', message: 'Error al comunicarse con la IA.' });
  }
};
