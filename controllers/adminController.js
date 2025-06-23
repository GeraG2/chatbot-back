// File: controllers/adminController.js
// Description: Controlador para las rutas de administración.

// Variable en memoria para almacenar el contexto (systemInstruction)
// TODO: Considerar una solución más persistente si es necesario.
let currentContext = "Eres un vendedor de tamales, tienes de carne, pollo, puerco y queso La docena cuesta $120 La medio docena $ 75 Preguntar al final si quiere servicio a domicilio tiene un costo de $40 extras";

/**
 * @route GET /api/admin/contexto
 * @description Obtiene el contexto actual del bot (systemInstruction).
 * @access Public (por ahora, considerar agregar autenticación)
 */
export const getContext = (req, res) => {
  try {
    res.status(200).json({ systemInstruction: currentContext });
  } catch (error) {
    console.error('Error al obtener el contexto:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener el contexto.' });
  }
};

/**
 * @route POST /api/admin/contexto
 * @description Actualiza el contexto actual del bot (systemInstruction).
 * @access Public (por ahora, considerar agregar autenticación)
 */
export const updateContext = (req, res) => {
  try {
    const { systemInstruction } = req.body;

    if (typeof systemInstruction !== 'string') {
      return res.status(400).json({ error: 'El campo systemInstruction es requerido y debe ser un string.' });
    }

    currentContext = systemInstruction;
    console.log('Contexto global actualizado a:', currentContext);

    // Nota: No es necesario llamar a una función setSystemInstruction en geminiService
    // si geminiService ya está obteniendo dinámicamente el contexto usando getCurrentContext()
    // cada vez que inicia un chat o necesita la instrucción del sistema.
    // Si geminiService cacheara la instrucción o la necesitara de forma más activa,
    // entonces sí sería necesario un mecanismo para "empujar" la actualización.

    res.status(200).json({ message: 'Contexto actualizado correctamente.', systemInstruction: currentContext });
  } catch (error) {
    console.error('Error al actualizar el contexto:', error);
    res.status(500).json({ error: 'Error interno del servidor al actualizar el contexto.' });
  }
};

// Función para que otros módulos (como geminiService) puedan acceder al contexto actual.
export const getCurrentContext = () => {
  return currentContext;
};
