// File: controllers/messengerController.js (Versión Final Multi-Cliente)

import { getGeminiResponseForMessenger } from '../services/geminiService.js';
import { sendMessengerMessage } from '../services/messengerService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENTS_FILE_PATH = path.join(__dirname, '..', 'clients.json');

let clientsConfig = []; // Lo inicializamos como un array
(async () => {
    try {
        const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
        clientsConfig = JSON.parse(data);
        console.log('✅ Registro de clientes para Messenger cargado con éxito.');
    } catch (error) {
        console.error(`❌ Error fatal: No se pudo cargar ${CLIENTS_FILE_PATH}.`, error);
    }
})();

export const handleVerification = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.MESSENGER_VERIFY_TOKEN) {
    console.log("✅ Webhook de Messenger verificado con éxito.");
    res.status(200).send(challenge);
  } else {
    console.warn("⚠️ Falló la verificación del webhook de Messenger.");
    res.sendStatus(403);
  }
};

export const handleIncomingMessage = (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach(entry => {
      entry.messaging.forEach(async event => {
        try {
          if (event.message && event.message.text) {
            const senderId = event.sender.id;
            const recipientId = event.recipient.id;
            const messageText = event.message.text;
            
            const clientProfile = clientsConfig.find(c => c.clientId === recipientId);

            if (!clientProfile) {
              console.warn(`Mensaje recibido para una página no configurada: ${recipientId}`);
              return; 
            }
            
            console.log(`Petición recibida para el cliente: ${clientProfile.clientName}`);

            // --- ¡LA CORRECCIÓN ESTÁ AQUÍ! ---
            // Nos aseguramos de pasar los TRES argumentos a la función del servicio.
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
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
};