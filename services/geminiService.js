// File: services/geminiService.js
// Description: Encapsula la interacción con la API de Gemini, gestionando sesiones con Redis.

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

const genAI = new GoogleGenAI(apiKey); // Corrected line
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
* Obtiene una respuesta de Gemini para usuarios de WhatsApp.
* Ahora usa Redis para almacenar y recuperar el historial de chat.
*/
export const getGeminiResponseForWhatsapp = async (senderId, userMessage) => {
try {
const redisKey = `whatsapp_session:${senderId}`;
const serializedSession = await redisClient.get(redisKey);

let history = [];
if (serializedSession) {
// Si hay una sesión guardada, la cargamos.
const sessionData = JSON.parse(serializedSession);
history = sessionData.history || [];
console.log(`Sesión para ${senderId} cargada desde Redis.`);
}

// Iniciar el chat con el historial existente o uno nuevo, y con el contexto del admin.
const chat = model.startChat({
history: history,
systemInstruction: {
parts: [{ text: getSystemInstruction() }]
}
});

const result = await chat.sendMessage(userMessage);
const response = await result.response;
const responseText = response.text();

// --- PERSISTENCIA DEL HISTORIAL ---
// Obtener el historial actualizado después de la nueva respuesta.
const updatedHistory = await chat.getHistory();
const newSessionData = { history: updatedHistory };

// Guardar el historial actualizado en Redis con un tiempo de expiración de 1 hora.
await redisClient.set(redisKey, JSON.stringify(newSessionData), { EX: 3600 });
console.log(`Historial de sesión para ${senderId} actualizado en Redis.`);
// --- FIN DE PERSISTENCIA ---

return responseText;

} catch (error) {
console.error(`Error al obtener respuesta de Gemini para WhatsApp senderId ${senderId}:`, error);
return "Lo siento, no pude procesar tu solicitud en este momento.";
}
};

// Nota: Las siguientes funciones no han sido adaptadas para usar Redis.
// Si planeas usarlas, necesitarán una lógica similar a la de getGeminiResponseForWhatsapp
// para leer y escribir el historial en Redis.
