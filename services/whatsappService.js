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
  console.log("Verifying webhook signature..."); // General log for entry
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    console.warn("CRITICAL SECURITY WARNING: 'x-hub-signature-256' header NOT present. Request will be rejected. Implement full signature validation.");
    // In a production environment, ensure this leads to request rejection in the controller.
    return false;
  } else {
    console.warn("SECURITY WARNING: 'x-hub-signature-256' header present, but full validation is NOT IMPLEMENTED. This is a placeholder and NOT secure for production. Request will be allowed for now. IMPLEMENT FULL VALIDATION using WHATSAPP_APP_SECRET.");
    // The following is an example of how to implement the actual signature verification.
    // This MUST be implemented for production use.
    //
    // 1. Ensure you have a middleware that makes the raw request body available.
    //    For Express, you might use something like:
    //    app.use(express.json({
    //      verify: (req, res, buf, encoding) => {
    //        if (buf && buf.length) {
    //          req.rawBody = buf.toString(encoding || 'utf8');
    //        }
    //      }
    //    }));
    //
    // 2. Get WHATSAPP_APP_SECRET from your environment variables.
    //    const appSecret = process.env.WHATSAPP_APP_SECRET;
    //    if (!appSecret) {
    //      console.error('CRITICAL: WHATSAPP_APP_SECRET is not set. Cannot validate signature.');
    //      return false; // Or throw an error, but be careful not to crash the app.
    //    }
    //
    // 3. Calculate the HMAC SHA256 hash.
    //    const crypto = require('crypto');
    //    // Ensure req.rawBody contains the raw, unparsed request body.
    //    const expectedHash = crypto.createHmac('sha256', appSecret)
    //                              .update(req.rawBody) // Use the raw request body
    //                              .digest('hex');
    //
    // 4. Compare the calculated hash with the signature from the header.
    //    // The signature header is typically in the format "sha256=actual_hash_value".
    //    const receivedHash = signature.split('=')[1];
    //    if (!receivedHash) {
    //        console.warn("Signature format appears incorrect. Could not extract hash.");
    //        return false;
    //    }
    //
    //    const isValid = crypto.timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(expectedHash, 'hex'));
    //    if (isValid) {
    //        console.log("Webhook signature validated successfully (actual check).");
    //        return true;
    //    } else {
    //        console.warn("CRITICAL: Webhook signature validation FAILED (actual check).");
    //        return false;
    //    }

    // Returning true here to allow development flow when header is present but validation is not complete.
    // THIS IS NOT SECURE FOR PRODUCTION.
    return true;
  }
};
