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
  const { sessionId } = req.params;
  const { message } = req.body;

  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Faltan el sessionId o el mensaje.' });
  }

  // Función para enviar datos al cliente en formato SSE
  // Definida aquí para ser accesible tanto en try como en catch (si headersSent)
  const sendEvent = (data) => {
    if (!res.writableEnded) { // Verificar si el stream sigue abierto
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    // --- Configuración para Server-Sent Events (SSE) ---
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Enviar los headers inmediatamente

    // Llamar al servicio que maneja el streaming con Gemini
    await streamMessageToGemini(sessionId, message, sendEvent);
    
    // Enviar un evento final para indicar que el stream ha terminado
    if (!res.writableEnded) {
      sendEvent({ type: 'done' });
      res.end();
    }

  } catch (error) {
    console.error(`Error en la sesión ${sessionId}:`, error.message, error.stack);

    if (!res.headersSent) {
      // Si los headers no se han enviado, podemos enviar una respuesta HTTP normal.
      res.status(500).json({ error: 'Ocurrió un error al procesar tu solicitud.' });
    } else if (!res.writableEnded) {
      // Si los headers ya se enviaron, intentamos enviar un evento de error SSE.
      try {
        sendEvent({ type: 'error', message: 'Ocurrió un error procesando tu solicitud.', details: error.message });
      } catch (sendEventError) {
        console.error('Error al enviar el evento de error SSE:', sendEventError);
      }
      res.end(); // Importante cerrar la conexión.
    } else {
      // Si la respuesta ya terminó por alguna razón, solo logueamos.
      console.error('Error ocurrido después de que la respuesta ya había finalizado.');
    }
  }
};
