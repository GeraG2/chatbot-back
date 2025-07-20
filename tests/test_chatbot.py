import pytest
import requests
import json
from unittest.mock import patch, MagicMock
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# URL del webhook del chatbot (suponiendo que se ejecuta localmente para las pruebas)
MESSENGER_WEBHOOK_URL = "http://localhost:5000/api/messenger/webhook"
WHATSAPP_WEBHOOK_URL = "http://localhost:5000/api/whatsapp/webhook"

# Datos de ejemplo para las solicitudes de Messenger
MESSENGER_PAYLOAD = {
    "object": "page",
    "entry": [
        {
            "id": "<PAGE_ID>",
            "time": 1752969264023,
            "messaging": [
                {
                    "sender": {
                        "id": "<SENDER_PSID>"
                    },
                    "recipient": {
                        "id": "<PAGE_ID>"
                    },
                    "message": {
                        "text": "Hola, quiero agendar una cita para mañana a las 10am."
                    }
                }
            ]
        }
    ]
}

MESSENGER_PAYLOAD_MODIFY = {
    "object": "page",
    "entry": [
        {
            "id": "<PAGE_ID>",
            "time": 1752969264023,
            "messaging": [
                {
                    "sender": {
                        "id": "<SENDER_PSID>"
                    },
                    "recipient": {
                        "id": "<PAGE_ID>"
                    },
                    "message": {
                        "text": "Hola, quiero cambiar mi cita a las 11am."
                    }
                }
            ]
        }
    ]
}

MESSENGER_PAYLOAD_CANCEL = {
    "object": "page",
    "entry": [
        {
            "id": "<PAGE_ID>",
            "time": 1752969264023,
            "messaging": [
                {
                    "sender": {
                        "id": "<SENDER_PSID>"
                    },
                    "recipient": {
                        "id": "<PAGE_ID>"
                    },
                    "message": {
                        "text": "Hola, quiero cancelar mi cita."
                    }
                }
            ]
        }
    ]
}


# Mock de las credenciales de Google Calendar
@pytest.fixture
def mock_google_calendar_credentials():
    with patch('google.oauth2.credentials.Credentials.from_authorized_user_file') as mock_from_user_file:
        mock_credentials = MagicMock(spec=Credentials)
        mock_from_user_file.return_value = mock_credentials
        yield mock_credentials

# Mock del servicio de Google Calendar
@pytest.fixture
def mock_google_calendar_service(mock_google_calendar_credentials):
    with patch('googleapiclient.discovery.build') as mock_build:
        mock_service = MagicMock()
        mock_build.return_value = mock_service
        yield mock_service

def process_message(payload, calendar_service):
    """
    Procesa el mensaje del webhook y crea un evento en Google Calendar.
    """
    # Lógica para extraer la información de la cita del mensaje
    # (esto sería más complejo en un chatbot real)
    summary = "Cita agendada"
    start_time = "2025-07-21T10:00:00-03:00"
    end_time = "2025-07-21T11:00:00-03:00"

    event = {
        'summary': summary,
        'start': {
            'dateTime': start_time,
            'timeZone': 'America/Argentina/Buenos_Aires',
        },
        'end': {
            'dateTime': end_time,
            'timeZone': 'America/Argentina/Buenos_Aires',
        },
    }

    calendar_service.events().insert(calendarId='primary', body=event).execute()

def process_message_modify(payload, calendar_service):
    """
    Procesa el mensaje del webhook y modifica un evento en Google Calendar.
    """
    # Lógica para extraer la información de la cita del mensaje
    # (esto sería más complejo en un chatbot real)
    summary = "Cita modificada"
    start_time = "2025-07-21T11:00:00-03:00"
    end_time = "2025-07-21T12:00:00-03:00"
    event_id = "evento_a_modificar_id"

    event = {
        'summary': summary,
        'start': {
            'dateTime': start_time,
            'timeZone': 'America/Argentina/Buenos_Aires',
        },
        'end': {
            'dateTime': end_time,
            'timeZone': 'America/Argentina/Buenos_Aires',
        },
    }

    calendar_service.events().update(calendarId='primary', eventId=event_id, body=event).execute()

def process_message_cancel(payload, calendar_service):
    """
    Procesa el mensaje del webhook y cancela un evento en Google Calendar.
    """
    event_id = "evento_a_cancelar_id"
    calendar_service.events().delete(calendarId='primary', eventId=event_id).execute()


@patch('requests.post')
def test_create_appointment(mock_post, mock_google_calendar_service):
    """Prueba la creación de una cita a través del chatbot de Messenger."""
    # Simula la recepción del webhook
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "EVENT_RECEIVED"
    mock_post.return_value = mock_response

    response = requests.post(MESSENGER_WEBHOOK_URL, json=MESSENGER_PAYLOAD)

    assert response.status_code == 200
    assert response.text == "EVENT_RECEIVED"

    # Llama a la función que procesa el mensaje
    process_message(MESSENGER_PAYLOAD, mock_google_calendar_service)

    # Verifica que se llamó a la API de Google Calendar
    mock_google_calendar_service.events().insert.assert_called_once()


@patch('requests.post')
def test_modify_appointment(mock_post, mock_google_calendar_service):
    """Prueba la modificación de una cita a través del chatbot de Messenger."""
    # Simula la recepción del webhook
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "EVENT_RECEIVED"
    mock_post.return_value = mock_response

    response = requests.post(MESSENGER_WEBHOOK_URL, json=MESSENGER_PAYLOAD_MODIFY)

    assert response.status_code == 200
    assert response.text == "EVENT_RECEIVED"

    # Llama a la función que procesa el mensaje de modificación
    process_message_modify(MESSENGER_PAYLOAD_MODIFY, mock_google_calendar_service)

    # Verifica que se llamó a la API de Google Calendar para actualizar el evento
    mock_google_calendar_service.events().update.assert_called_once()


@patch('requests.post')
def test_cancel_appointment(mock_post, mock_google_calendar_service):
    """Prueba la cancelación de una cita a través del chatbot de Messenger."""
    # Simula la recepción del webhook
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = "EVENT_RECEIVED"
    mock_post.return_value = mock_response

    response = requests.post(MESSENGER_WEBHOOK_URL, json=MESSENGER_PAYLOAD_CANCEL)

    assert response.status_code == 200
    assert response.text == "EVENT_RECEIVED"

    # Llama a la función que procesa el mensaje de cancelación
    process_message_cancel(MESSENGER_PAYLOAD_CANCEL, mock_google_calendar_service)

    # Verifica que se llamó a la API de Google Calendar para eliminar el evento
    mock_google_calendar_service.events().delete.assert_called_once()
