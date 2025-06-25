// test-gemini-minimal.js
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config(); // Para cargar .env

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Error: La variable de entorno GEMINI_API_KEY no está configurada o no es accesible.");
  console.log("Valor de process.env.GEMINI_API_KEY:", process.env.GEMINI_API_KEY);
  process.exit(1);
}
console.log("API Key encontrada en .env:", apiKey ? "Sí" : "No");

try {
  console.log("Instanciando GoogleGenAI con new GoogleGenAI({ apiKey: apiKey })...");
  const genAI = new GoogleGenAI({ apiKey: apiKey });
  console.log("Instancia de genAI creada:", genAI ? "Objeto" : "Null/Undefined");

  if (genAI && typeof genAI.getGenerativeModel === 'function') {
    console.log("genAI.getGenerativeModel SÍ es una función. Intentando obtener modelo...");
    const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // o gemini-1.5-flash
    console.log("Modelo obtenido:", model ? "Objeto" : "Null/Undefined");
    console.log("¡Prueba de código mínimo para obtener modelo EXITOSA!");
  } else {
    console.error("Error: genAI.getGenerativeModel NO es una función.");
    console.log("Tipo de genAI.getGenerativeModel:", typeof genAI.getGenerativeModel);
    console.log("Keys del objeto genAI:", genAI ? Object.keys(genAI) : "genAI es null/undefined");
    if (genAI) {
      // Inspect prototype if genAI itself is an object but lacks the method directly
      const prototype = Object.getPrototypeOf(genAI);
      console.log("Prototipo de genAI:", prototype);
      console.log("Métodos del prototipo de genAI:", prototype ? Object.getOwnPropertyNames(prototype) : "Prototipo es null/undefined");
    }
  }
} catch (e) {
  console.error("Error durante la prueba de código mínimo:", e);
}
