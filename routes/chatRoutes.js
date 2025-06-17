// File: routes/chatRoutes.js
// Description: Define los endpoints para la API del chat.

import express from 'express';
import { startChat, sendMessage } from '../controllers/chatController.js';

const router = express.Router();

// Ruta para iniciar una nueva sesión de chat
// POST /api/chat/start
router.post('/start', startChat);

// Ruta para enviar un mensaje a una sesión de chat existente y recibir una respuesta en streaming
// POST /api/chat/:sessionId/message
router.post('/:sessionId/message', sendMessage);

export default router;
