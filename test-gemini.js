// File: test-gemini.js (Versión corregida para @google/genai)

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("❌ No se encontró la GEMINI_API_KEY en el archivo .env");
    process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function runTest() {
    try {
        console.log("Iniciando prueba de conexión con Gemini...");
        const modelName = "gemini-1.5-flash"; // Usamos un modelo simple para una prueba rápida
        const prompt = "Dime 'hola mundo' en español.";
        console.log("Enviando prompt a:", modelName);

        // --- LA CORRECCIÓN ESTÁ AQUÍ ---
        // Usamos el método correcto para tu librería: genAI.models.generateContent
        const result = await genAI.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // El resto del código asume la estructura de respuesta que ya conocemos
        const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (responseText) {
            console.log("✅ ¡Éxito! Respuesta de Gemini recibida:");
            console.log(responseText);
        } else {
            console.error("❌ ¡FALLO! La respuesta no contenía texto. Objeto completo:", JSON.stringify(result, null, 2));
        }

    } catch (error) {
        console.error("❌ ¡FALLO! Error al contactar con la API de Gemini:");
        console.error(error);
    }
}

runTest();