// File: inspectAI.js
import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

// Creamos la instancia del objeto que queremos explorar
const genAI = new GoogleGenAI({ apiKey });

console.log("--- Inspeccionando el objeto 'genAI' ---");

// console.dir es ideal para explorar objetos en la consola de Node.js
// { depth: 2 } le dice que muestre hasta 2 niveles de "subcarpetas".
console.dir(genAI, { depth: 2 });