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
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiToken || !phoneNumberId) {
    console.error('Error: WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables are required.');
    throw new Error('WhatsApp API credentials are not configured.');
  }

  const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: recipientId,
    type: "text",
    text: { body: messageText }
  };

  try {
    console.log(`Sending WhatsApp message to ${recipientId}: "${messageText}"`);
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log(`Message sent successfully to ${recipientId}.`);
  } catch (error) {
    console.error(`Error sending WhatsApp message to ${recipientId}:`, error.response ? error.response.data : error.message);
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
    // Example:
    // const crypto = require('crypto');
    // const body = req.rawBody; // Assuming rawBody is available (e.g., via bodyParser middleware)
    // const secret = process.env.WHATSAPP_APP_SECRET;
    // const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    // return crypto.timingSafeEqual(Buffer.from(signature.split('=')[1]), Buffer.from(hash));
  } else {
    console.warn('X-Hub-Signature-256 header NOT present. Webhook requests should be validated for security.');
    // Depending on your security policy, you might want to reject requests without a signature.
    // For development, or if signature is optional for some reason, you might proceed.
  }
  // TODO: Replace with actual signature validation logic for production.
  // For now, returning true to allow processing during development.
  // In production, if the signature is missing or invalid, you should return false or throw an error.
  return true; // Placeholder - CHANGE FOR PRODUCTION
};
