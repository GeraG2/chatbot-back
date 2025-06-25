// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini, gestionando sesiones con Redis.

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";
import { createClient } from 'redis';

// --- INICIALIZACIÓN DE REDIS ---
const redisClient = createClient();

redisClient.on('error', (err) => {
console.error('Redis Client Error', err);
});

// Conectar a Redis al iniciar el módulo
(async () => {
try {
await redisClient.connect();
console.log('Conectado al servidor Redis con éxito.');
} catch (err) {
console.error('No se pudo conectar al servidor Redis:', err);
}
})();
// --- FIN DE INICIALIZACIÓN DE REDIS ---


// --- SECCIÓN PARA EL PANEL DE ADMIN (OBSOLETA - AHORA POR SESIÓN) ---
// let currentSystemInstruction = "Eres un asistente de IA conversacional y amigable.";

// export function getSystemInstruction() {
// return currentSystemInstruction;
// }

// export function setSystemInstruction(newInstruction) {
// console.log(`Cambiando la instrucción del sistema a: "${newInstruction}"`);
// currentSystemInstruction = newInstruction;
// }
// --- FIN DE LA SECCIÓN ---

/**
 * Función genérica para actualizar la instrucción del sistema para un usuario en Redis.
 * @param {string} userId - El ID del usuario (ej. senderId de WhatsApp, chatId de Telegram).
 * @param {string} platformPrefix - El prefijo de la clave de Redis para la plataforma (ej. 'whatsapp_session', 'telegram_session').
 * @param {string} newInstruction - La nueva instrucción del sistema.
 */
const setSystemInstructionForUser = async (userId, platformPrefix, newInstruction) => {
  const redisKey = `${platformPrefix}:${userId}`;
  try {
    const serializedSession = await redisClient.get(redisKey);
    let sessionData = {};

    if (serializedSession) {
      sessionData = JSON.parse(serializedSession);
    } else {
      // Si no hay sesión, creamos una nueva estructura básica
      sessionData.history = []; // Iniciar con historial vacío si no existe
    }

    sessionData.systemInstruction = newInstruction;

    await redisClient.set(redisKey, JSON.stringify(sessionData), { EX: 3600 }); // Mantener la misma expiración
    console.log(`Instrucción de sistema para ${platformPrefix} userId ${userId} actualizada en Redis a: "${newInstruction}"`);
    return true;
  } catch (error) {
    console.error(`Error al actualizar la instrucción de sistema para ${platformPrefix} userId ${userId} en Redis:`, error);
    return false;
  }
};

/**
 * Actualiza la instrucción del sistema para un usuario específico de WhatsApp en Redis.
 * @param {string} senderId - El ID del remitente de WhatsApp.
 * @param {string} newInstruction - La nueva instrucción del sistema.
 */
export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => {
  return setSystemInstructionForUser(senderId, 'whatsapp_session', newInstruction);
};

/**
 * Actualiza la instrucción del sistema para un usuario específico de Telegram en Redis.
 * @param {string} chatId - El ID del chat de Telegram.
 * @param {string} newInstruction - La nueva instrucción del sistema.
 */
export const setSystemInstructionForTelegram = async (chatId, newInstruction) => {
  return setSystemInstructionForUser(chatId, 'telegram_session', newInstruction);
};

// Cargar la API Key y configurar Gemini
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

console.log("GEMINI_API_KEY en service ANTES DE USAR:", process.env.GEMINI_API_KEY); // Using process.env.GEMINI_API_KEY for direct log
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); // Use process.env.GEMINI_API_KEY directly

// const model = genAI.getGenerativeModel(...); // Removed from module scope

/**
* Obtiene una respuesta de Gemini para usuarios de WhatsApp usando generateContent.
* Gestiona el historial de conversación en Redis.
*/
export const getGeminiResponseForWhatsapp = async (senderId, userMessage) => {
try {
    const redisKey = `whatsapp_session:${senderId}`;
    const serializedSession = await redisClient.get(redisKey);

    console.log(`Valor de redisKey que se buscó: ${redisKey}`);
    console.log(`Contenido de serializedSession para ${redisKey}:`, serializedSession);
    if (serializedSession) {
        console.log("serializedSession NO es null, se intentará parsear para obtener historial.");
    } else {
        console.log("serializedSession ES null. Esto debería tratarse como una nueva conversación.");
    }

    let conversationHistory = [];
    // Cada usuario empieza con la instrucción por defecto
    let systemInstructionText = "Eres un asistente de IA conversacional y amigable.";

    if (serializedSession) {
        const sessionData = JSON.parse(serializedSession);
        conversationHistory = sessionData.history || [];
        // Si el usuario tiene una instrucción guardada, úsala. Si no, usa la por defecto.
        systemInstructionText = sessionData.systemInstruction || systemInstructionText;
        console.log(`Historial de conversación para ${senderId} cargado desde Redis:`, JSON.stringify(conversationHistory, null, 2));
        console.log(`Instrucción de sistema para ${senderId} cargada desde Redis: "${systemInstructionText}"`);
    } else {
        console.log(`No hay sesión previa en Redis para ${senderId}. Usando instrucción por defecto: "${systemInstructionText}"`);
    }

    // Construct 'contents' for the API call
    let apiContents = [];

    if (conversationHistory.length === 0 && systemInstructionText) {
        console.log("Inyectando systemInstruction para nueva conversación en apiContents.");
        apiContents.push({ role: "user", parts: [{ text: "SOBRE TU PERSONA: " + systemInstructionText }] });
        apiContents.push({ role: "model", parts: [{ text: "Entendido." }] });
    }

    // Concatenate the actual conversation history
    apiContents = [...apiContents, ...conversationHistory];

    // Add current user message
    apiContents.push({ role: "user", parts: [{ text: userMessage }] });

    console.log("Contents a ENVIAR a generateContent:", JSON.stringify(apiContents, null, 2));

    const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash", // Or "gemini-pro"
        contents: apiContents
    });
    console.log("Objeto 'result' COMPLETO de generateContent:", JSON.stringify(result, null, 2));

    if (!result || !result.candidates || result.candidates.length === 0 ||
        !result.candidates[0].content || !result.candidates[0].content.parts ||
        result.candidates[0].content.parts.length === 0 ||
        typeof result.candidates[0].content.parts[0].text !== 'string') {
        console.error("Respuesta inesperada de la API de Gemini (estructura de result):", JSON.stringify(result, null, 2));
        throw new Error("Respuesta inesperada de la API de Gemini o sin contenido de texto.");
    }
    const responseText = result.candidates[0].content.parts[0].text;

    // Update history and system instruction for Redis
    let newHistoryForRedis = [...conversationHistory];
    newHistoryForRedis.push({ role: "user", parts: [{ text: userMessage }] });
    newHistoryForRedis.push({ role: "model", parts: [{ text: responseText }] });

    // --- INICIO DE LA LÓGICA DE RECORTE DEL HISTORIAL ---
    const maxHistoryTurns = 10; // Un "turno" es un par: (1 mensaje de usuario + 1 respuesta del bot)

    // La longitud del array de historial será el número de turnos por 2
    if (newHistoryForRedis.length > maxHistoryTurns * 2) {
      console.log(`El historial tiene ${newHistoryForRedis.length} mensajes. Recortando a los últimos ${maxHistoryTurns * 2}...`);
      // Aquí está la magia:
      newHistoryForRedis = newHistoryForRedis.slice(newHistoryForRedis.length - maxHistoryTurns * 2);
    }
    // --- FIN DE LA LÓGICA DE RECORTE DEL HISTORIAL ---

    console.log("Historial ACTUALIZADO para guardar en Redis:", JSON.stringify(newHistoryForRedis, null, 2));
    console.log(`Instrucción de sistema para ${senderId} A GUARDAR en Redis: "${systemInstructionText}"`);
    await redisClient.set(redisKey, JSON.stringify({
        history: newHistoryForRedis,
        systemInstruction: systemInstructionText // <-- Guardar la instrucción usada
    }), { EX: 3600 });
    console.log(`Sesión (historial e instrucción) para ${senderId} actualizada en Redis.`);

    return responseText;

} catch (error) {
    console.error(`Error al obtener respuesta de Gemini para WhatsApp senderId ${senderId}:`, error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
}
};

// Nota: Las siguientes funciones no han sido adaptadas para usar Redis.
// Si planeas usarlas, necesitarán una lógica similar a la de getGeminiResponseForWhatsapp
// para leer y escribir el historial en Redis.
// (Placeholders as per user's current file structure)
export const initializeChatSession = (systemInstruction) => {
    // ... tu código existente para esta función ...
    };

export const streamMessageToGemini = async (sessionId, userMessage, sendEventCallback) => {
// ... tu código existente para esta función ...
};
