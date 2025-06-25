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


// --- SECCIÓN PARA EL PANEL DE ADMIN ---
let currentSystemInstruction = "Eres un asistente de IA conversacional y amigable.";

export function getSystemInstruction() {
return currentSystemInstruction;
}

export function setSystemInstruction(newInstruction) {
console.log(`Cambiando la instrucción del sistema a: "${newInstruction}"`);
currentSystemInstruction = newInstruction;
}
// --- FIN DE LA SECCIÓN ---


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

    let conversationHistory = []; // This will be the history stored in Redis
    if (serializedSession) {
        const sessionData = JSON.parse(serializedSession);
        conversationHistory = sessionData.history || [];
        console.log(`Historial de conversación para ${senderId} cargado desde Redis:`, JSON.stringify(conversationHistory, null, 2));
    }

    // Construct 'contents' for the API call
    let apiContents = [];
    const systemInstructionText = getSystemInstruction();

    if (conversationHistory.length === 0 && systemInstructionText) {
        console.log("Inyectando systemInstruction para nueva conversación en apiContents.");
        apiContents.push({ role: "user", parts: [{ text: "SOBRE TU PERSONA: " + systemInstructionText }] });
        apiContents.push({ role: "model", parts: [{ text: "Entendido." }] });
    }

    // Concatenate the actual conversation history
    apiContents = [...apiContents, ...conversationHistory];

    // Add current user message
    apiContents.push({ role: "user", parts: [{ text: userMessage }] });

    // console.log("SystemInstruction (manejado arriba si es nueva conversación):", systemInstructionText); // Removed
    console.log("Contents a ENVIAR a generateContent:", JSON.stringify(apiContents, null, 2));

    const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash", // Or "gemini-pro"
        // generationConfig: { candidateCount: 1 }, // Optional
        // systemInstruction: { parts: [{ text: systemInstructionText }] }, // For models that support it this way
        contents: apiContents
    });
    console.log("Objeto 'result' COMPLETO de generateContent:", JSON.stringify(result, null, 2));

    // If using a model that requires system_instruction at the top level,
    // the call might look like:
    // const result = await genAI.models.generateContent({
    //    model: "gemini-model-name",
    //    systemInstruction: { parts: [{ text: systemInstructionText }] },
    //    contents: apiContents // contents would not include the system instruction part then
    // });

    // const response = result.response; // Remove this line
    // const responseText = response.text(); // Remove this line

    // New validation and extraction logic:
    if (!result || !result.candidates || result.candidates.length === 0 ||
        !result.candidates[0].content || !result.candidates[0].content.parts ||
        result.candidates[0].content.parts.length === 0 ||
        typeof result.candidates[0].content.parts[0].text !== 'string') {
        // Keep the console.log for the full 'result' object for debugging if this condition is met
        console.error("Respuesta inesperada de la API de Gemini (estructura de result):", JSON.stringify(result, null, 2));
        throw new Error("Respuesta inesperada de la API de Gemini o sin contenido de texto.");
    }
    const responseText = result.candidates[0].content.parts[0].text;

    // Update history for Redis
    // Correctly build newHistoryForRedis (SHOULD NOT include the artificial system instruction turns)
    let newHistoryForRedis = [...conversationHistory]; // Start with history loaded from Redis
    newHistoryForRedis.push({ role: "user", parts: [{ text: userMessage }] });
    newHistoryForRedis.push({ role: "model", parts: [{ text: responseText }] });

    // Optional: Trim history
    // const maxHistoryTurns = 10;
    // if (newHistoryForRedis.length > maxHistoryTurns * 2) {
    //   newHistoryForRedis = newHistoryForRedis.slice(newHistoryForRedis.length - maxHistoryTurns * 2);
    // }

    console.log("Historial ACTUALIZADO para guardar en Redis:", JSON.stringify(newHistoryForRedis, null, 2));
    await redisClient.set(redisKey, JSON.stringify({ history: newHistoryForRedis }), { EX: 3600 });
    console.log(`Historial de sesión para ${senderId} actualizado en Redis.`);

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
