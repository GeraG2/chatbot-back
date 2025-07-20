// File: services/toolShed.js
// Description: Contiene la lógica de todas las herramientas disponibles para la IA.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Herramienta genérica para buscar en cualquier base de conocimiento JSON.
 * @param {object} args - Argumentos proporcionados por la IA.
 * @returns {object} - Un objeto con los resultados de la búsqueda.
 */
async function searchKnowledgeBase(args, clientProfile) {
  try {
    const knowledgeBasePath = path.join(__dirname, '..', clientProfile.knowledgeBasePath);
    const data = JSON.parse(await fs.readFile(knowledgeBasePath, 'utf-8'));
    if (!data || !Array.isArray(data)) {
      return { error: "La base de conocimiento no es válida o está vacía." };
    }
    const searchTerm = args.itemName || "";

    if (searchTerm) {
      const foundItems = data.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return { results: foundItems.length > 0 ? foundItems : [] };
    } else {
      return { results: data };
    }
  } catch (error) {
    console.error(`Error searching in ${clientProfile.knowledgeBasePath}:`, error);
    return { error: "Could not access knowledge base." };
  }
}



// --- NUEVAS HERRAMIENTAS DE GOOGLE CALENDAR ---

/**
 * Crea un cliente de OAuth2 autenticado para un cliente específico.
 * @param {object} authData - El objeto googleAuth del perfil del cliente.
 */
function createAuthClient(authData) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: authData.accessToken,
    refresh_token: authData.refreshToken,
    expiry_date: authData.expiryDate,
  }); // Usa los tokens guardados del cliente
  return oauth2Client;
}


/**
 * Revisa la disponibilidad en un calendario para una fecha específica.
 * @param {object} args - Argumentos de la IA.
 * @param {string} args.date - La fecha a revisar (formato AAAA-MM-DD).
 * @param {object} args.googleAuth - Los tokens de autenticación del cliente.
 */
async function checkAvailability(args) {
  try {
    const auth = createAuthClient(args.googleAuth);
    const calendar = google.calendar({ version: 'v3', auth });
    const today = new Date();
    const availableSlots = [];

    for (let i = 0; i < 10; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      
      const timeMin = new Date(checkDate);
      timeMin.setHours(9, 0, 0, 0); // 9 AM

      const timeMax = new Date(checkDate);
      timeMax.setHours(18, 0, 0, 0); // 6 PM

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const busySlots = response.data.items.map(e => ({
        start: new Date(e.start.dateTime),
        end: new Date(e.end.dateTime),
      }));

      let lastEndTime = timeMin;
      for (const busySlot of busySlots) {
        if (busySlot.start > lastEndTime) {
            availableSlots.push({ 
                date: checkDate.toISOString().split('T')[0], 
                startTime: lastEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
                endTime: busySlot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            });
        }
        lastEndTime = busySlot.end;
      }
      if (timeMax > lastEndTime) {
        availableSlots.push({ 
            date: checkDate.toISOString().split('T')[0], 
            startTime: lastEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            endTime: timeMax.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        });
      }
    }

    return { availableSlots };
  } catch (error) {
    console.error("Error en checkAvailability:", error);
    return { error: "No se pudo consultar el calendario." };
  }
}

/**
 * Agenda una nueva cita en el calendario.
 * @param {object} args - Argumentos de la IA.
 * @param {string} args.dateTime - Fecha y hora de inicio en formato ISO (ej. "2025-07-17T14:00:00").
 * @param {string} args.customerName - Nombre del cliente para la cita.
 * @param {string} args.service - Descripción del servicio.
 * @param {object} args.googleAuth - Los tokens de autenticación del cliente.
 */
async function scheduleAppointment(args) {
  try {
    console.log("Radiografía de args:");
    console.dir(args, { depth: null });
    // --- VALIDACIÓN AÑADIDA ---
    if (!args.dateTime || !args.customerName || !args.service) {
      return { error: "Faltan datos para agendar. Necesito la fecha, la hora, tu nombre y el servicio que deseas." };
    }
    
    
    // --- INICIO DE LA MODIFICACIÓN ---

    // 1. Forzamos la renovación del token si está a punto de expirar.
    // La librería debería hacer esto automáticamente, pero forzarlo nos ayuda a depurar.
    const auth = createAuthClient(args.googleAuth);
    await auth.getAccessToken(); 
    console.log("Tokens de acceso actualizados antes de la llamada.");
    const calendar = google.calendar({ version: 'v3', auth });

    // --- FIN DE LA MODIFICACIÓN ---

    const startTime = new Date(args.dateTime);
    // Asumimos que cada cita dura 1 hora, si tiene otra duración, se debe especificar.
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const event = {
      summary: `${args.service} - ${args.customerName}`,
      description: `Cita agendada por Nexus Bot. Cliente: ${args.customerName}.`,
      start: { dateTime: startTime.toISOString(), timeZone: 'America/Mexico_City' },
      end: { dateTime: endTime.toISOString(), timeZone: 'America/Mexico_City' },
    };

    // --- INICIO DEL CÓDIGO DE DEPURACIÓN ---
    console.log("\n--- 🕵️ Enviando el siguiente evento a Google Calendar: 🕵️ ---");
    console.log(JSON.stringify(event, null, 2));
    console.log("----------------------------------------------------------\n");

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log("\n--- ✅ Respuesta COMPLETA de la API de Google Calendar: ✅ ---");
    // Usamos console.dir para ver el objeto completo, no solo el texto
    console.dir(response, { depth: null }); 
    console.log("----------------------------------------------------------\n");
    // --- FIN DEL CÓDIGO DE DEPURACIÓN ---

    return { status: 'success', eventLink: response.data.htmlLink };
  } catch (error) {
    console.error("Error en scheduleAppointment:", error);
    return { error: `No se pudo agendar la cita. Razón: ${error.message}` };
  }
}

// --- REGISTRO DE HERRAMIENTAS DISPONIBLES ---
// Mapea el nombre de la función (el que usa Gemini) con la función real.
export const availableTools = {
  searchKnowledgeBase,
  checkAvailability,
  scheduleAppointment
};