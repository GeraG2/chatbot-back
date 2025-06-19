// File: controllers/whatsappController.js
// Description: Handles webhook verification and incoming messages from WhatsApp.

import { getGeminiResponseForWhatsapp } from '../services/geminiService.js';
import { sendMessage, verifyWebhookSignature } from '../services/whatsappService.js';
import process from 'process';

/**
 * Handles webhook verification (GET requests) from WhatsApp.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const verifyWebhook = (req, res) => {
  console.log('Received GET request to /webhook for WhatsApp verification.');

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const whatsappVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === whatsappVerifyToken) {
      console.log('Webhook verified successfully.');
      res.status(200).send(challenge);
    } else {
      console.warn('Webhook verification failed: Mode or token mismatch.');
      res.sendStatus(403); // Forbidden
    }
  } else {
    console.warn('Webhook verification failed: Missing mode or token in query parameters.');
    res.sendStatus(400); // Bad Request
  }
};

/**
 * Handles incoming messages (POST requests) from WhatsApp.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
export const handleIncomingMessage = async (req, res) => {
  console.log('Received POST request to /webhook (incoming WhatsApp message).');

  // ** IMPORTANT: Signature Validation **
  // In a production environment, you MUST validate the webhook signature.
  // The verifyWebhookSignature function in whatsappService.js is a placeholder.
  // Ensure it's fully implemented using WHATSAPP_APP_SECRET.
  // const isSignatureValid = verifyWebhookSignature(req);
  // if (!isSignatureValid) {
  //   console.warn('Invalid webhook signature. Rejecting request.');
  //   return res.sendStatus(403); // Forbidden
  // }
  // console.log('Webhook signature validation passed (or placeholder returned true).');

  const body = req.body;

  // Check if it's a WhatsApp business account notification
  if (body.object === 'whatsapp_business_account') {
    if (body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0] &&
        body.entry[0].changes[0].value && body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]) {

      const message = body.entry[0].changes[0].value.messages[0];

      if (message.type === 'text') {
        const senderId = message.from;
        const messageText = message.text.body;
        console.log(`Received text message from ${senderId}: "${messageText}"`);

        try {
          // Get response from Gemini
          const geminiResponse = await getGeminiResponseForWhatsapp(senderId, messageText);

          // Send the response back to the user via WhatsApp
          if (geminiResponse) {
            await sendMessage(senderId, geminiResponse);
            console.log(`Successfully sent Gemini response to ${senderId}.`);
          } else {
            console.warn(`Gemini response was empty for sender ${senderId}. No reply sent.`);
          }
        } catch (error) {
          console.error(`Error processing message or sending reply to ${senderId}:`, error);
          // Do not throw error here, as WhatsApp expects a 200 OK
          // You might want to send a generic error message back to the user if appropriate
          // await sendMessage(senderId, "Sorry, I encountered an error. Please try again later.");
        }
      } else {
        console.log(`Received non-text message type: ${message.type} from ${message.from}. Ignoring.`);
      }
    } else {
      console.log('Received WhatsApp notification, but message structure is not as expected. Ignoring.');
      // console.log('Full payload:', JSON.stringify(body, null, 2)); // For debugging
    }
  } else {
    // If it's not a WhatsApp business account notification, it might be something else.
    console.log('Received POST request that is not a WhatsApp business account update. Ignoring.');
    // console.log('Full payload:', JSON.stringify(body, null, 2)); // For debugging
  }

  // Always respond with 200 OK to WhatsApp to acknowledge receipt of the event.
  // Failure to do so can result in Meta resending the webhook or disabling it.
  res.sendStatus(200);
};
