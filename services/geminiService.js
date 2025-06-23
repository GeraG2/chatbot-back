// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini y la gestión de sesiones.

import { GoogleGenAI } from "@google/genai"; // Correct: GoogleGenerativeAI
import { v4 as uuidv4 } from 'uuid';
import { getCurrentContext } from '../controllers/adminController.js'; // Importar para obtener el contexto dinámico

// Cargar la API Key desde las variables de entorno
const apiKey = process.env.GEMINI_API_KEY; // Correct: Define apiKey
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

const genAI = new GoogleGenAI(apiKey); // Corrected instantiation

// Almacén en memoria para las sesiones de chat activas.
// En un entorno de producción, esto debería ser reemplazado por una base de datos (Redis, MongoDB, etc.)
const activeSessions = new Map();

// Define Default System Instruction for WhatsApp users
// const DEFAULT_SYSTEM_INSTRUCTION = "Eres un asistente de IA útil y amigable."; // Ya no es necesario aquí, se obtiene de adminController

/**
 * Inicializa una nueva sesión de chat de Gemini.
 * @param {string} [systemInstructionParam] - El contexto de entrenamiento inicial (opcional, prioriza el de adminController).
 * @returns {{sessionId: string, chat: object}} - El ID de la sesión y el objeto de chat.
 */
export const initializeChatSession = (systemInstructionParam) => {
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
 * Obtiene una respuesta de Gemini para usuarios de WhatsApp (sin streaming).
 * Gestiona sesiones de chat para cada senderId.
 * @param {string} senderId - El ID del remitente de WhatsApp (usado como ID de sesión).
 * @param {string} userMessage - El mensaje del usuario.
 * @returns {Promise<string>} - La respuesta de texto de Gemini.
 */
export const getGeminiResponseForWhatsapp = async (senderId, userMessage) => {
  try {
    let chat = activeSessions.get(senderId);
    const modelName = "gemini-1.5-flash"; // Consistent model name
    const systemInstructionToUse = getCurrentContext() || "Eres un asistente de IA útil y amigable por defecto para WhatsApp."; // Obtener contexto dinámico

    if (!chat) {
      console.log(`Creando nueva sesión de chat para WhatsApp senderId: ${senderId} con instrucción: "${systemInstructionToUse}"`);
      // System instruction can be customized or made dynamic if needed
      chat = genAI.chats.create({ model: modelName, history: [], config: { systemInstruction: { parts: [{text: systemInstructionToUse}] } } });
      activeSessions.set(senderId, chat);

      // Configurar un temporizador para limpiar la sesión después de un período de inactividad
      // Similar al de initializeChatSession pero usando senderId
      setTimeout(() => {
        if (activeSessions.has(senderId)) {
          activeSessions.delete(senderId);
          console.log(`Sesión de WhatsApp para ${senderId} expirada y eliminada.`);
        }
      }, 3600 * 1000); // Expira en 1 hora (ajustar según sea necesario)
    } else {
      console.log(`Usando sesión de chat existente para WhatsApp senderId: ${senderId}`);
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
  const chat = activeSessions.get(sessionId);

  if (!chat) {
    throw new Error('Sesión de chat no válida o expirada.');
  }

  try {
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
