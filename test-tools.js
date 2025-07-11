// File: test-tools.js

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ No se encontró la GEMINI_API_KEY.");
    process.exit(1);
}
const genAI = new GoogleGenAI({ apiKey });

// 1. Definimos una herramienta simple para la prueba
const testTools = [{
    functionDeclarations: [
        {
            name: "get_menu",
            description: "Obtener la lista de comida del menú.",
            parameters: { type: "OBJECT", properties: {} }
        }
    ]
}];

async function runToolTest() {
  try {
    console.log("Iniciando prueba de 'Function Calling'...");
    const modelName = "gemini-1.5-flash";

    // 2. Creamos un historial simple que incita a usar la herramienta
    const contents = [
        { role: "user", parts: [{ text: "Hola" }] },
        { role: "model", parts: [{ text: "¡Hola! ¿Qué tal?" }] },
        { role: "user", parts: [{ text: "¿Cuál es el menú?" }] }
    ];

    console.log("Enviando petición con 'tools' a Gemini...");

    // 3. Hacemos la llamada a la API
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: contents,
      tools: testTools, // <-- El parámetro que estamos investigando
    });

    console.log("✅ ¡Respuesta recibida de la API!");

    // 4. Imprimimos la respuesta COMPLETA Y SIN PROCESAR
    // Esto nos mostrará la estructura exacta que nos devuelve la librería
    console.log("--- RESPUESTA COMPLETA (RAW) ---");
    console.dir(result, { depth: null });
    console.log("---------------------------------");


  } catch (error) {
    console.error("❌ ¡FALLO! La petición con 'tools' generó un error:");
    console.error(error);
  }
}

runToolTest();