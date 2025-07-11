import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
async function runTest() {
  try {
    
    const prompt = "Hola, dime un dato curioso sobre la tecnología.";
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("Respuesta de Gemini:", text);

  } catch (error) {
    console.error("Error:", error);
  }
}

runTest();