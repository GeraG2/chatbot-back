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
// Esto se eliminará ya que las herramientas vendrán del clientProfile

// --- FUNCIONES DE GESTIÓN DE SESIÓN ---
async function _updateSessionInstruction(redisKey, newInstruction) {
    // Tu lógica correcta para actualizar la instrucción en Redis
    // Esta función podría necesitar acceso al clientProfile si la instrucción por defecto
    // también se guarda en la sesión, o si se quiere validar contra las tools del cliente.
    // Por ahora, la dejamos como está, asumiendo que solo actualiza la instrucción.
    const sessionData = JSON.parse(await redisClient.get(redisKey) || '{}');
    sessionData.systemInstruction = newInstruction;
    await redisClient.set(redisKey, JSON.stringify(sessionData), { EX: 3600 }); // Asumiendo TTL de 1 hora
    console.log(`Instrucción de sistema actualizada para ${redisKey}`);
}
export const setSystemInstructionForWhatsapp = async (senderId, newInstruction) => {
    // Aquí necesitaríamos el clientProfile para pasar a _updateSessionInstruction si fuera necesario
    // Por ahora, mantenemos la firma simple. La lógica de identificación del cliente
    // debería ocurrir antes de llamar a esta función si se necesita el clientProfile.
    return _updateSessionInstruction(`whatsapp_session:${senderId}`, newInstruction);
};
export const setSystemInstructionForMessenger = async (senderId, newInstruction) => {
    return _updateSessionInstruction(`messenger_session:${senderId}`, newInstruction);
};

// --- FUNCIÓN MOTOR GENÉRICA (LÓGICA CENTRAL) ---
// La firma ahora acepta el perfil del cliente
async function _getGenericGeminiResponse(userId, userMessage, platformPrefix, clientProfile) {
  try {
    const redisKey = `${platformPrefix}:${userId}`;
    const serializedSession = await redisClient.get(redisKey);

    let conversationHistory = [];
    // La instrucción ahora viene del perfil del cliente, no de un CONFIG global
    let systemInstructionText = clientProfile.systemInstruction;

    if (serializedSession) {
      const sessionData = JSON.parse(serializedSession);
      conversationHistory = sessionData.history || [];
      // La instrucción específica de la sesión sigue teniendo prioridad
      systemInstructionText = sessionData.systemInstruction || clientProfile.systemInstruction;
    }
    
    let apiContents = [
        // Ya no se antepone "INSTRUCCIONES:" aquí si Gemini lo maneja bien con system_instruction
        // o si se incluye directamente en el historial como un turno de sistema.
        // Por simplicidad y alineación con la API de Gemini,
        // la systemInstruction se pasa fuera de `contents` si la API lo soporta,
        // o como un primer mensaje de rol 'system' o 'user' (preferiblemente 'system').
        // Sin embargo, el ejemplo original lo incluye en el primer mensaje de usuario.
        // Mantendremos esa estructura por ahora.
        { role: "user", parts: [{ text: `INSTRUCCIONES: ${systemInstructionText}` }] },
        { role: "model", parts: [{ text: "Entendido." }] }, // Asumiendo que Gemini responde "Entendido."
        ...conversationHistory,
        { role: "user", parts: [{ text: userMessage }] }
    ];

    // La llamada a la API ahora usa las herramientas del perfil del cliente
    const result = await genAI.generativeModel({ // Corregido: genAI.models.generateContent -> genAI.generativeModel
        model: CONFIG.GEMINI_MODEL, // El modelo puede seguir siendo global
        // systemInstruction: { parts: [{ text: systemInstructionText }] }, // Alternativa para pasar instrucción de sistema
    }).generateContent({ // Corregido: generateContent es un método del modelo
        contents: apiContents,
        tools: clientProfile.tools, // <-- Usando las herramientas del cliente
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
    });
    
    // Acceso a la respuesta y llamada a función puede variar ligeramente con la nueva API de @google/genai
    const response = result.response; // Usar result.response
    const call = response.candidates?.[0]?.content?.parts?.find(part => part.functionCall)?.functionCall;
    let responseText = response.candidates?.[0]?.content?.parts?.find(part => part.text)?.text;

    if (call) {
      console.log(`Función '${call.name}' detectada para ${platformPrefix}:${userId}. Procesando localmente.`);
      // La lógica aquí dentro ahora debe leer del knowledgeBasePath del cliente
      if (call.name === "getProductInfo" || call.name === "getVehicleStock") {
          // Asegurarse que knowledgeBasePath es un path relativo al proyecto o absoluto
          // El ejemplo usa './products.json', lo que es relativo a donde se ejecuta el script.
          // Es más robusto construir un path absoluto o relativo a un punto fijo (ej: __dirname de este archivo)
          const knowledgeBaseFullPath = path.join(__dirname, '..', clientProfile.knowledgeBasePath);
          const productsData = JSON.parse(await fs.readFile(knowledgeBaseFullPath, 'utf-8'));

          // Esta lógica de manejo de la función debería ser más genérica
          // o específica para cada función. Aquí simulamos una búsqueda simple.
          const searchTerm = call.args.productName || call.args.modelName || null;
          let foundItem = null;

          if (searchTerm && productsData) {
            if (Array.isArray(productsData)) { // Para listas como TacoBot
                foundItem = productsData.find(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
            } else if (typeof productsData === 'object' && productsData !== null) { // Para objetos como CarBot (si fuera un objeto de modelos)
                // Asumimos que productsData es un objeto donde las claves son nombres de modelos
                // o que tiene una estructura que se puede buscar.
                // Esta parte necesitaría adaptarse a la estructura real de vehicles.json
                // Por ahora, simulamos una búsqueda simple si es un objeto de productos/vehículos
                for (const key in productsData) {
                    if (key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (productsData[key].name && productsData[key].name.toLowerCase().includes(searchTerm.toLowerCase()))) {
                        foundItem = productsData[key];
                        if (typeof foundItem === 'object' && !foundItem.name) foundItem.name = key; // Añadir nombre si es la clave
                        break;
                    }
                }
            }
          }


          if (foundItem) {
            responseText = `Aquí tienes la información sobre ${foundItem.name || searchTerm}: ${JSON.stringify(foundItem, null, 2)}`;
            if (call.name === "getProductInfo" && foundItem.price) {
                 responseText = `El producto '${foundItem.name}' cuesta $${foundItem.price}. ${foundItem.description || ''}`;
            } else if (call.name === "getVehicleStock" && foundItem.details) {
                 responseText = `Vehículo: ${foundItem.name}. Detalles: ${foundItem.details}. Precio: ${foundItem.price || 'Consultar'}. Stock: ${foundItem.stock || 'Consultar'}`;
            }
          } else if (call.name === "getProductInfo" && !searchTerm && Array.isArray(productsData)) { // Listar todo el menú para TacoBot
            let menuText = "¡Claro! Aquí tienes nuestro delicioso menú:\n\n";
            productsData.forEach(p => {
              menuText += `* ${p.name} - $${p.price}\n`;
            });
            menuText += "\n¿Qué se te antoja ordenar?";
            responseText = menuText;
          }
          else {
            responseText = `Lo siento, no pude encontrar información sobre '${searchTerm || 'eso'}'.`;
          }
      } else {
        // Si es otra función no definida aquí, podría necesitarse una lógica diferente
        // o simplemente indicar que la función fue llamada pero no manejada por esta parte del código.
        responseText = `Función ${call.name} llamada, pero no hay un manejador específico aquí.`;
      }
      
      // Actualizar historial con la llamada a función y la respuesta de la función
      conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
      // El historial de la API debe reflejar la llamada a la función y la respuesta de la función.
      conversationHistory.push({ role: 'model', parts: [{ functionCall: call }] });
      conversationHistory.push({ role: 'tool', parts: [{ functionResponse: { name: call.name, response: { content: responseText } } }] });
      // No guardamos la respuesta de la función directamente como un turno de 'model' si no es la respuesta final al usuario.
      // La respuesta final al usuario vendrá de una nueva llamada a Gemini con este historial actualizado,
      // o si la respuesta de la función es la respuesta final, entonces sí se guarda.
      // El flujo original implica que la respuesta de la función ES la respuesta al usuario.

    } else if (!responseText) {
      // Si no hay llamada a función y no hay texto, es un error o respuesta vacía.
      console.warn(`Respuesta vacía o sin texto de Gemini para ${platformPrefix}:${userId}`);
      responseText = "Lo siento, no pude procesar tu solicitud en este momento.";
    }

    // Guardar el historial actualizado en Redis
    // Si hubo una llamada a función, el historial ya se actualizó.
    // Si no hubo llamada a función, actualizamos con el mensaje del usuario y la respuesta del modelo.
    if (!call) {
        conversationHistory.push({ role: 'user', parts: [{ text: userMessage }] });
        conversationHistory.push({ role: 'model', parts: [{ text: responseText }] });
    }
    
    // Limitar el historial
    if (conversationHistory.length > (CONFIG.MAX_HISTORY_TURNS * 2)) { // *2 porque cada turno tiene user y model
        conversationHistory = conversationHistory.slice(-(CONFIG.MAX_HISTORY_TURNS * 2));
    }

    await redisClient.set(redisKey, JSON.stringify({ history: conversationHistory, systemInstruction: systemInstructionText }), { EX: 3600 });
    return responseText;

  } catch (error) {
    console.error(`Error en _getGenericGeminiResponse para ${platformPrefix}:${userId}:`, error);
    // Asegurarse de que clientProfile exista antes de intentar acceder a clientProfile.clientName
    const clientName = clientProfile ? clientProfile.clientName : "Cliente Desconocido";
    return `Lo siento, cliente '${clientName}', no pude procesar tu solicitud. Error: ${error.message}`;
  }
}

// --- FUNCIONES PÚBLICAS "ADAPTADORAS" ---
// Los adaptadores ahora pasan el perfil del cliente
export const getGeminiResponseForWhatsapp = async (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'whatsapp_session', clientProfile);
};
export const getGeminiResponseForMessenger = async (senderId, userMessage, clientProfile) => {
  return _getGenericGeminiResponse(senderId, userMessage, 'messenger_session', clientProfile);
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