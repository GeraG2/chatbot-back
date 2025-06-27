// File: routes/messengerRoutes.js
// Description: Define las rutas para el webhook de Messenger.

import express from 'express';
import { handleVerification, handleIncomingMessage } from '../controllers/messengerController.js';

const router = express.Router();

// Esta ruta manejará la verificación inicial de Meta (GET)
router.get('/webhook', handleVerification);

// Esta ruta manejará los mensajes que nos envíen los usuarios (POST)
router.post('/webhook', handleIncomingMessage);

export default router;
