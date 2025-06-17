// File: test-gemini.js
// Description: Un script de prueba final que hardcodea la API key para un diagnóstico definitivo.

const { GoogleGenerativeAI } = require("@google/genai");

// Función principal asíncrona para poder usar await
async function runTest() {
  try {
    console.log("Iniciando prueba de conexión con Gemini...");

    // --- PRUEBA DEFINITIVA: HARDCODEAR LA API KEY ---
    // Clave de API insertada directamente para la prueba.
    const hardcodedApiKey = "AIzaSyD6OMRxmcVh72epXetkYREUFdYFZvu-jls";
    // --------------------------------------------------
    
    console.log("Usando la API Key hardcodeada directamente.");

    // 2. Inicializar el cliente de Gemini con la clave hardcodeada
    const genAI = new GoogleGenerativeAI(hardcodedApiKey);
    console.log("Cliente de Gemini inicializado correctamente.");

    // 3. Enviar un mensaje de prueba
    console.log("Enviando un mensaje de prueba a Gemini...");
    const prompt = "Escribe un saludo corto y amigable.";

    const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash-preview-0514",
        contents: [{ role: "user", parts: [{text: prompt}] }],
    });

    const response = await result.response;
    const text = response.text();

    // 4. Mostrar el resultado
    console.log("-----------------------------------------");
    console.log("✅ ¡PRUEBA EXITOSA! ✅");
    console.log("Respuesta recibida de Gemini:");
    console.log(text);
    console.log("-----------------------------------------");
    console.log("\nEsto confirma que la librería y tu clave funcionan. El problema está en dotenv/process.env.");

  } catch (error) {
    console.error("-----------------------------------------");
    console.error("❌ ¡PRUEBA FALLIDA! ❌");
    console.error("Ocurrió un error al intentar conectar con Gemini:");
    console.error(error);
    console.error("\nSi esta prueba falla con la clave hardcodeada, el problema está en la librería @google/genai o en tu entorno de Node.js.");
    console.error("-----------------------------------------");
  }
}

// Ejecutar la función de prueba
runTest();
