// File: routes/whatsappRoutes.js
// Description: Defines the webhook endpoints for WhatsApp.

import express from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/whatsappController.js';

// Create an Express router instance
const router = express.Router();

/**
 * @route GET /webhook
 * @description Handles webhook verification for WhatsApp.
 * Meta will send a GET request to this endpoint to verify the webhook.
 */
router.get('/webhook', verifyWebhook);

/**
 * @route POST /webhook
 * @description Handles incoming messages from WhatsApp users.
 * WhatsApp will send POST requests to this endpoint with message data.
 */
router.post('/webhook', handleIncomingMessage);

// Export the router
export default router;
