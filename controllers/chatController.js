// File: controllers/chatController.js
// Description: Lógica para manejar las peticiones de las rutas del chat.

import { initializeChatSession, streamMessageToGemini } from '../services/geminiService.js';

/**
 * Inicia una nueva sesión de chat.
 * @param {object} req - Request object de Express.
 * @param {object} res - Response object de Express.
 */
export const startChat = (req, res) => {
  try {
    const { systemInstruction } = req.body;
    const { sessionId, chat } = initializeChatSession(systemInstruction);
    
    console.log(`Nueva sesión de chat iniciada con ID: ${sessionId}`);

    res.status(201).json({
      sessionId: sessionId,
      initialMessage: "Contexto aplicado. ¿Cómo puedo ayudarte ahora?"
    });
  } catch (error) {
    console.error('Error al iniciar el chat:', error);
    res.status(500).json({ error: 'No se pudo iniciar la sesión de chat.' });
  }
};

/**
 * Envía un mensaje a una sesión existente y devuelve la respuesta en streaming.
 * @param {object} req - Request object de Express.
 * @param {object} res - Response object de Express.
 */
export const sendMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Faltan el sessionId o el mensaje.' });
    }
    
    // --- Configuración para Server-Sent Events (SSE) ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Enviar los headers inmediatamente

    // Función para enviar datos al cliente en formato SSE
    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Llamar al servicio que maneja el streaming con Gemini
    await streamMessageToGemini(sessionId, message, sendEvent);
    
    // Enviar un evento final para indicar que el stream ha terminado
    sendEvent({ type: 'done' });
    res.end();

  } catch (error) {
    console.error(`Error en la sesión ${req.params.sessionId}:`, error.message);
    // Es difícil enviar un estado de error una vez que el stream ha comenzado,
    // pero si el error ocurre antes, podemos manejarlo.
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // Si el stream ya comenzó, simplemente terminamos la respuesta.
      res.end();
    }
  }
};
