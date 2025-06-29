// File: controllers/messengerController.js
// Description: Maneja los webhooks y mensajes entrantes de Facebook Messenger.

import { getGeminiResponseForMessenger } from '../services/geminiService.js';
import { sendMessengerMessage } from '../services/messengerService.js';
import fs from 'fs/promises';

const clientsConfig = JSON.parse(await fs.readFile('./clients.json', 'utf-8'));

// Función para la verificación inicial del webhook (GET)
export const handleVerification = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    console.log("✅ Webhook de Messenger verificado con éxito.");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️ Falló la verificación del webhook de Messenger. Tokens no coinciden.");
    res.sendStatus(403);
  }
};

// Función para manejar los mensajes entrantes (POST)
export const handleIncomingMessage = (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      entry.messaging.forEach(async event => {
        // Envolvemos toda la lógica en un try...catch
        try {
          if (event.message && event.message.text) {
            const senderId = event.sender.id;
            const recipientId = event.recipient.id; // <-- El ID de tu Página
            const messageText = event.message.text;

            // --- LÓGICA DE IDENTIFICACIÓN DE CLIENTE ---
            const clientProfile = clientsConfig[recipientId];
            if (!clientProfile) {
              console.warn(`Mensaje recibido para una página no configurada: ${recipientId}`);
              return; // Ignoramos el mensaje si no tenemos un perfil para esa página
            }
            console.log(`Petición recibida para el cliente: ${clientProfile.clientName}`);
            // --- FIN DE LA LÓGICA ---

            // Ahora llamamos al servicio pasándole el perfil completo del cliente
            const responseText = await getGeminiResponseForMessenger(senderId, messageText, clientProfile);

            if(responseText) {
              await sendMessengerMessage(senderId, responseText);
            }
          }
        } catch (error) {
          console.error(`Error al procesar un evento de Messenger para ${event.sender.id}:`, error);
        }
      });
    });

    // Respondemos a Meta con 200 OK para confirmar que recibimos el evento
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
};
