// File: services/messengerService.js
// Description: Contiene la lógica para enviar mensajes a la API de Messenger.

import fetch from 'node-fetch'; // O usa el fetch nativo si tu versión de Node lo soporta

const MESSENGER_API_URL = `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.MESSENGER_ACCESS_TOKEN}`;

/**
 * Envía un mensaje de texto a un usuario de Messenger.
 * @param {string} recipientId - El ID del destinatario (proporcionado por Messenger).
 * @param {string} messageText - El texto del mensaje a enviar.
 */

// Límite de caracteres de Messenger
const MAX_TEXT_LENGTH = 2000;

// Nueva función para dividir mensajes
function splitMessage(text) {
  if (text.length <= MAX_TEXT_LENGTH) {
    return [text];
  }
  
  const chunks = [];
  let currentChunk = '';
  const sentences = text.split(/(?<=[.!?])\s+/); // Divide por frases

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > MAX_TEXT_LENGTH) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += `${sentence} `;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

export const sendMessengerMessage = async (recipientId, messageText, accessToken) => {
  // Usamos la nueva función para dividir el mensaje en partes
  const messageChunks = splitMessage(messageText);

  // Enviamos cada parte como un mensaje separado
  for (const chunk of messageChunks) {
    const body = {
      recipient: { id: recipientId },
      message: { text: chunk },
      messaging_type: 'RESPONSE'
    };

    try {
      await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      // Esperamos un poco entre mensajes para que lleguen en orden
      await new Promise(resolve => setTimeout(resolve, 500)); 
    } catch (error) {
      console.error("Error al enviar un trozo de mensaje a Messenger:", error);
    }
  }
};