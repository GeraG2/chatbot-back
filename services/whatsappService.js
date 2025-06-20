// File: services/whatsappService.js
// Description: Handles sending messages via the WhatsApp Business API.

import axios from 'axios';
import process from 'process';

/**
 * Sends a text message to a WhatsApp recipient.
 * @param {string} recipientId - The recipient's WhatsApp ID.
 * @param {string} messageText - The text message to send.
 * @returns {Promise<void>}
 * @throws {Error} If the API call fails or environment variables are missing.
 */
export const sendMessage = async (recipientId, messageText) => {
  const apiToken = process.env.WHATSAPP_API_TOKEN; // Usando tu nombre de variable
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiToken || !phoneNumberId) {
    console.error('Error: WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables are required.');
    throw new Error('WhatsApp API credentials are not configured.');
  }

  // --- SOLUCIÓN FINAL APLICADA AQUÍ ---
  // Corrige el formato para números de celular de México (elimina el '1' extra).
  let cleanedRecipientId = recipientId;
  if (cleanedRecipientId.startsWith("521") && cleanedRecipientId.length === 13) {
    cleanedRecipientId = "52" + cleanedRecipientId.substring(3);
    console.log(`DIAGNÓSTICO: Número de México corregido de '${recipientId}' a '${cleanedRecipientId}'`);
  }
  // --- FIN DE LA SOLUCIÓN ---


  const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: cleanedRecipientId, // Usamos el número corregido
    type: "text",
    text: { body: messageText }
  };

  try {
    console.log(`Enviando WhatsApp message to ${cleanedRecipientId}: "${messageText}"`);
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Message sent successfully to ${cleanedRecipientId}.`);
  } catch (error) {
    console.error(`Error sending WhatsApp message to ${cleanedRecipientId}:`, error.response ? error.response.data : error.message);
    // Propagate the error so the controller can handle it (e.g., send a 500 response)
    throw error;
  }
};

/**
 * Verifies the webhook signature (basic placeholder).
 * IMPORTANT: This is a placeholder and needs full implementation for production security.
 * @param {object} req - The Express request object.
 * @returns {boolean} - True if the signature is considered valid for now.
 */
export const verifyWebhookSignature = (req) => {
  const signature = req.headers['x-hub-signature-256'];
  if (signature) {
    console.log('X-Hub-Signature-256 header present. TODO: Implement full signature validation using WHATSAPP_APP_SECRET.');
    // In a real scenario, you would:
    // 1. Get WHATSAPP_APP_SECRET from process.env.
    // 2. Create a HMAC SHA256 hash of the raw request body using the App Secret.
    // 3. Compare the generated hash with the 'signature' header.
  } else {
    console.warn('X-Hub-Signature-256 header NOT present. Webhook requests should be validated for security.');
  }
  // For now, returning true to allow processing during development.
  return true; // Placeholder - CHANGE FOR PRODUCTION
};
