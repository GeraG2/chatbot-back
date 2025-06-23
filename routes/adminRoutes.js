// File: routes/adminRoutes.js
// Description: Define los endpoints para la administración del bot.

import express from 'express';
import { getContext, updateContext } from '../controllers/adminController.js';

const router = express.Router();

// Ruta para obtener el contexto actual del bot
// GET /api/admin/contexto
router.get('/contexto', getContext);

// Ruta para actualizar el contexto del bot
// POST /api/admin/contexto
router.post('/contexto', updateContext);

export default router;
