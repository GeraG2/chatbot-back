// File: services/toolShed.js
// Description: Contiene la lógica de todas las herramientas disponibles para la IA.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Herramienta genérica para buscar en cualquier base de conocimiento JSON.
 * @param {object} args - Argumentos proporcionados por la IA.
 * @returns {object} - Un objeto con los resultados de la búsqueda.
 */
async function searchKnowledgeBase(args) {
  // The 'knowledgeBasePath' argument is now expected to be an absolute path passed from geminiService.js
  const { knowledgeBasePath, itemName } = args;

  if (!knowledgeBasePath) {
    return { error: "knowledgeBasePath was not provided." };
  }

  try {
    const data = JSON.parse(await fs.readFile(knowledgeBasePath, 'utf-8'));
    
    // El argumento 'itemName' es el que definimos en la herramienta en clients.json
    const searchTerm = args.itemName || "";

    if (searchTerm) {
      const foundItems = data.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return { results: foundItems.length > 0 ? foundItems : [] };
    } else {
      // Si no se especifica un término de búsqueda, devuelve todo.
      return { results: data };
    }
  } catch (error) {
    console.error(`Error buscando en ${args.knowledgeBasePath}:`, error);
    return { error: "No se pudo acceder a la base de conocimiento." };
  }
}

// --- REGISTRO DE HERRAMIENTAS DISPONIBLES ---
// Mapea el nombre de la función (el que usa Gemini) con la función real.
export const availableTools = {
  searchKnowledgeBase,
  // Si en el futuro creas una herramienta 'scheduleAppointment', la añadirías aquí.
};