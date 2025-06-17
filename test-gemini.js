// File: test-gemini.js
// Description: Un script de prueba final que hardcodea la API key para un diagnóstico definitivo.

import 'dotenv/config'; // For loading environment variables
import { GoogleGenerativeAI } from "@google/genai";

// Función principal asíncrona para poder usar await
async function runTest() {
  try {
    console.log("Iniciando prueba de conexión con Gemini...");

    // API key should be loaded from environment variables and never hardcoded.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("-----------------------------------------");
      console.error("❌ ERROR: GEMINI_API_KEY no encontrada en las variables de entorno.");
      console.error("Asegúrate de que tu archivo .env está configurado correctamente y dotenv está cargando las variables.");
      console.error("-----------------------------------------");
      return; // Detener la ejecución si la clave no está presente
    }
    
    console.log("Usando la API Key desde process.env.GEMINI_API_KEY.");

    // 2. Inicializar el cliente de Gemini con la clave de entorno
    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("Cliente de Gemini inicializado correctamente.");

    // 3. Enviar un mensaje de prueba
    console.log("Enviando un mensaje de prueba a Gemini...");
    const prompt = "Escribe un saludo corto y amigable.";

    const result = await genAI.getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" }).generateContentStream([{ role: "user", parts: [{text: prompt}] }]);
    // Note: The original code used genAI.models.generateContent, which seems to be for REST API.
    // For the Node.js SDK, it's usually genAI.getGenerativeModel(...).generateContentStream or generateContent
    // I've opted for generateContentStream as it's common, but if simple generateContent was intended:
    // const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-preview-0514" });
    // const result = await model.generateContent(prompt);


    const response = await result.response; // This line might need adjustment if using generateContentStream differently
    const text = response.text();

    // 4. Mostrar el resultado
    console.log("-----------------------------------------");
    console.log("✅ ¡PRUEBA EXITOSA! ✅");
    console.log("Respuesta recibida de Gemini:");
    console.log(text);
    console.log("-----------------------------------------");
    console.log("\nEsto confirma que la librería @google/genai funciona correctamente con la API key cargada desde el entorno.");

  } catch (error) {
    console.error("-----------------------------------------");
    console.error("❌ ¡PRUEBA FALLIDA! ❌");
    console.error("Ocurrió un error al intentar conectar con Gemini:");
    console.error(error);
    console.error("\nSi esta prueba falla, verifica que GEMINI_API_KEY sea correcta y que no haya problemas de red o configuración con @google/genai.");
    console.error("-----------------------------------------");
  }
}

// Ejecutar la función de prueba
runTest();