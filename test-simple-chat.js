import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("No se encontró la GEMINI_API_KEY en el archivo .env");
}
const genAI = new GoogleGenAI({ apiKey });

async function runSimpleTest() {
  try {
    console.log("Iniciando prueba de chat simple...");
    const modelName = "gemini-1.5-flash";
    const prompt = "Hola, solo responde 'OK' si me escuchas.";

    // CORRECCIÓN: Usamos el método compatible con tu librería
    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("✅ ¡Éxito! Respuesta recibida:", responseText);

  } catch (error) {
    console.error("❌ ¡FALLO! Error en la prueba:", error);
  }
}

runSimpleTest();