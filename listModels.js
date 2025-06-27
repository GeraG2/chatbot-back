// File: listModels.js
// Description: Script para listar todos los modelos de IA disponibles para tu API Key.

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from "@google/genai";

// Cargar la API Key desde el archivo .env
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("La variable de entorno GEMINI_API_KEY es requerida.");
}

// Inicializar el cliente de la API
const genAI = new GoogleGenAI({ apiKey });

async function listAvailableModels() {
  try {
    console.log("Obteniendo lista de modelos disponibles...");

    // Usamos el método correcto que descubrimos: genAI.models.list()
    const models = await genAI.models.list();

    console.log("\n--- Modelos Disponibles para tu API Key ---");

    let count = 0;
    for await (const model of models) {
      // Imprimimos la información más relevante de cada modelo
      count++;
      console.log(`- Nombre del Modelo (para config.json): ${model.name}`);
      console.log(`  Nombre para Mostrar: ${model.displayName}`);
      console.log(`  Descripción: ${model.description.substring(0, 100)}...`);
      console.log('-------------------------------------------------');
    }

    if (count === 0) {
        console.log("No se encontraron modelos. Esto puede indicar un problema con los permisos de tu API Key o la configuración de tu proyecto de Google Cloud.");
    }

  } catch (error) {
    console.error("Error al listar los modelos:", error);
  }
}

listAvailableModels();