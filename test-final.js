import { GoogleGenAI, FunctionCallingConfigMode } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const tools = [{
    functionDeclarations: [{
        name: "get_menu",
        description: "Obtener la lista de comida del menú.",
        parameters: { type: "OBJECT", properties: {} }
    }]
}];

async function runTest() {
  try {
    const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ role: "user", parts: [{ text: "¿Cuál es el menú?" }] }],
        tools: tools,
        toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
        },
    });
    
    // Imprime la respuesta completa para analizarla
    console.dir(result, { depth: null });

  } catch (error) {
    console.error("Error:", error);
  }
}

runTest();