// File: controllers/messengerController.js (Versión Final con Carga Correcta)

import { getGeminiResponseForMessenger } from '../services/geminiService.js';
import { sendMessengerMessage } from '../services/messengerService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENTS_FILE_PATH = path.join(__dirname, '..', 'clients.json');

// Variable para guardar la configuración
let clientsConfig = []; // Inicializamos como un array vacío

// Función asíncrona para cargar la configuración
async function loadClientsConfig() {
    try {
        const data = await fs.readFile(CLIENTS_FILE_PATH, 'utf-8');
        clientsConfig = JSON.parse(data);
        console.log('✅ Registro de clientes para Messenger cargado con éxito.');
    } catch (error) {
        console.error(`❌ Error fatal: No se pudo cargar ${CLIENTS_FILE_PATH}.`, error);
        // En caso de error, nos aseguramos de que siga siendo un array
        clientsConfig = [];
    }
}
// Llamamos a la función para cargar los clientes al iniciar el servidor
loadClientsConfig();


export const handleVerification = (req, res) => {
    // ... tu lógica de verificación se mantiene igual ...
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
            
            // La búsqueda ahora funciona porque clientsConfig es un array
            const clientProfile = clientsConfig.find(c => c.clientId === recipientId);

            if (clientProfile) {
              console.log(`Petición para el cliente: ${clientProfile.clientName}`);
              const responseText = await getGeminiResponseForMessenger(senderId, messageText, clientProfile);
              
              if (responseText) {
                await sendMessengerMessage(senderId, responseText, clientProfile.pageAccessToken);
              }
            } else {
              console.warn(`Mensaje para página no configurada: ${recipientId}`);
            }
          }
        } catch (error) {
          console.error(`Error procesando evento para ${event.sender.id}:`, error);
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
};