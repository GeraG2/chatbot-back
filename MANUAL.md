Manual de Alta para Nuevos Clientes de Facebook
Este es el proceso paso a paso para conectar un nuevo cliente (Página de Facebook) al chatbot.

Parte 1: Configuración en Meta for Developers
Ir al Panel de Apps: Entra a https://developers.facebook.com/apps/.

Seleccionar App: Haz clic en tu aplicación (ej. "Nexus Bot").

Añadir Página: Ve a Messenger > Configuración. En la sección "Tokens de acceso", haz clic en "Añadir o eliminar páginas" y selecciona la nueva página del cliente.

Generar Token Inicial: Al lado del nombre de la nueva página, haz clic en "Generar token". Copia este token de corta duración.

Parte 2: Obtener el Token de Página Permanente (El "Cheat Sheet")
Necesitarás 4 piezas de información:

[APP_ID]: El ID de tu aplicación de Meta.

[APP_SECRET]: El "Secreto de la app" de tu aplicación.

[SHORT_LIVED_TOKEN]: El token que acabas de generar en el paso anterior.

[PAGE_ID]: El ID de la nueva página de Facebook.

Comando 1: Obtener Token de Larga Duración (60 días)
Ejecuta esto en tu terminal.

Bash

curl -i -X GET "https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=[APP_ID]&client_secret=[APP_SECRET]&fb_exchange_token=[SHORT_LIVED_TOKEN]"
La respuesta te dará un nuevo access_token. Cópialo. Este es tu [TOKEN_DE_LARGA_DURACION].

Comando 2: Obtener Token de Página Permanente
Usa el token del paso anterior para ejecutar este segundo comando.

Bash

curl -i -X GET "https://graph.facebook.com/v20.0/[PAGE_ID]?fields=access_token&access_token=[TOKEN_DE_LARGA_DURACION]"
La respuesta te dará el access_token final. Este es el token permanente.

Parte 3: Configuración Final en el Backend
Actualizar clients.json:

Abre tu archivo clients.json.

Añade un nuevo objeto para el cliente.

Pega el ID de la página en el campo clientId.

Pega el token permanente en el campo pageAccessToken.

Suscribir la App a la Página:

Ejecuta este comando final para que la página empiece a enviar eventos a tu webhook.

Bash

curl -X POST "https://graph.facebook.com/v20.0/[PAGE_ID]/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=[TOKEN_PERMANENTE]"
Desplegar en Fly.io:

Guarda los cambios y despliega tu backend con fly deploy.