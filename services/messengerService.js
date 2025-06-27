// File: services/messengerService.js
// Description: Contiene la lógica para enviar mensajes a la API de Messenger.

import fetch from 'node-fetch'; // O usa el fetch nativo si tu versión de Node lo soporta

const MESSENGER_API_URL = `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.MESSENGER_ACCESS_TOKEN}`;

/**
 * Envía un mensaje de texto a un usuario de Messenger.
 * @param {string} recipientId - El ID del destinatario (proporcionado por Messenger).
 * @param {string} messageText - El texto del mensaje a enviar.
 */
export const sendMessengerMessage = async (recipientId, messageText) => {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: messageText },
    messaging_type: "RESPONSE" // Necesario para responder a mensajes de usuario
  };

  try {
    const response = await fetch(MESSENGER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Error al enviar mensaje a Messenger API:', errorData);
    } else {
        console.log(`Mensaje enviado con éxito a Messenger senderId ${recipientId}`);
    }

  } catch (error) {
    console.error('Error de red al intentar enviar mensaje a Messenger:', error);
  }
};
