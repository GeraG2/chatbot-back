// File: services/googleService.js
// Description: Centraliza la lógica para interactuar con la API de Google Calendar.

import { google } from 'googleapis';

/**
 * Crea un cliente de OAuth2 autenticado para un cliente específico.
 * @param {object} authData - El objeto googleAuth del perfil del cliente.
 * @returns {google.auth.OAuth2} - El cliente de OAuth2 autenticado.
 */
export function createAuthClient(authData) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: authData.accessToken,
    refresh_token: authData.refreshToken,
    expiry_date: authData.expiryDate,
  });
  return oauth2Client;
}

/**
 * Agenda una nueva cita en el calendario.
 * @param {object} authData - Los tokens de autenticación del cliente.
 * @param {object} eventDetails - Detalles del evento a crear.
 * @returns {Promise<object>} - El evento de calendario creado.
 */
export async function createCalendarEvent(authData, eventDetails) {
  const auth = createAuthClient(authData);
  const calendar = google.calendar({ version: 'v3', auth });

  const { dateTime, customerName, service } = eventDetails;
  const startTime = new Date(dateTime);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // Asume 1 hora de duración

  const event = {
    summary: `${service} - ${customerName}`,
    description: `Cita agendada por Nexus Bot. Cliente: ${customerName}.`,
    start: { dateTime: startTime.toISOString(), timeZone: 'America/Mexico_City' },
    end: { dateTime: endTime.toISOString(), timeZone: 'America/Mexico_City' },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return response.data;
}

/**
 * Actualiza una cita existente en el calendario.
 * @param {object} authData - Los tokens de autenticación del cliente.
 * @param {string} eventId - El ID del evento a actualizar.
 * @param {object} eventDetails - Los nuevos detalles del evento.
 * @returns {Promise<object>} - El evento de calendario actualizado.
 */
export async function updateCalendarEvent(authData, eventId, eventDetails) {
  const auth = createAuthClient(authData);
  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId,
    resource: eventDetails,
  });

  return response.data;
}
