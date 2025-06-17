// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini y la gestión de sesiones.

import { GoogleGenAI } from "@google/genai"; // Correct: GoogleGenAI
import { v4 as uuidv4 } from 'uuid';

// Cargar la API Key desde las variables de entorno
const apiKey = process.env.GEMINI_API_KEY; // Correct: Define apiKey
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

const genAI = new GoogleGenAI({ apiKey: apiKey }); // Corrected instantiation

// Almacén en memoria para las sesiones de chat activas.
// En un entorno de producción, esto debería ser reemplazado por una base de datos (Redis, MongoDB, etc.)
const activeSessions = new Map();

/**
 * Inicializa una nueva sesión de chat de Gemini.
 * @param {string} systemInstruction - El contexto de entrenamiento inicial.
 * @returns {{sessionId: string, chat: object}} - El ID de la sesión y el objeto de chat.
 */
export const initializeChatSession = (systemInstruction) => {
  const sessionId = uuidv4();
  const chatConfig = {
    history: [], // El historial se gestionará aquí si es necesario
    systemInstruction: systemInstruction || "Eres un asistente de IA útil y amigable."
  };

  // modelName could be a parameter or from config
  const modelName = "gemini-1.5-flash-preview-0514";
  const chat = genAI.startChat({ // Assuming genAI.startChat based on some SDK patterns
    ...chatConfig,
    model: modelName, // Specify model here
  });
  
  activeSessions.set(sessionId, chat);

  // Opcional: Limpiar sesiones antiguas para evitar fugas de memoria
  setTimeout(() => {
    if (activeSessions.has(sessionId)) {
      activeSessions.delete(sessionId);
      console.log(`Sesión ${sessionId} expirada y eliminada.`);
    }
  }, 3600 * 1000); // Expira en 1 hora

  return { sessionId, chat };
};

/**
 * Envía un mensaje a Gemini y transmite la respuesta al cliente.
 * @param {string} sessionId - El ID de la sesión a la que se envía el mensaje.
 * @param {string} userMessage - El mensaje del usuario.
 * @param {function} sendEventCallback - Callback para enviar eventos SSE al cliente.
 */
export const streamMessageToGemini = async (sessionId, userMessage, sendEventCallback) => {
  const chat = activeSessions.get(sessionId);

  if (!chat) {
    throw new Error('Sesión de chat no válida o expirada.');
  }

  try {
    const result = await chat.sendMessageStream(userMessage);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      // Enviar cada fragmento al cliente a través del callback
      sendEventCallback({ type: 'chunk', text: chunkText });
    }

  } catch (error) {
    console.error("Error al hacer streaming desde Gemini:", error);
    // Enviar un evento de error al cliente
    sendEventCallback({ type: 'error', message: 'Error al comunicarse con la IA.' });
  }
};
