// File: routes/chatRoutes.js
// Description: Define los endpoints para la API del chat.

import express from 'express';
// import { startChat, sendMessage } from '../controllers/chatController.js'; // No longer needed

const router = express.Router();

// Ruta para iniciar una nueva sesión de chat
// POST /api/chat/start
// router.post('/start', startChat); // Removed as startChat is removed

// Ruta para enviar un mensaje a una sesión de chat existente y recibir una respuesta en streaming
// POST /api/chat/:sessionId/message
// router.post('/:sessionId/message', sendMessage); // Removed as sendMessage is removed

// This router is now empty. It can be removed from server.js if no other chat-related routes are planned.
export default router;
