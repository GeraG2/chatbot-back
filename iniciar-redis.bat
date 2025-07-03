@echo off
REM Script para iniciar el servidor de Redis en Windows.

REM --- CONFIGURACIÓN ---
REM Edita la siguiente línea con la ruta donde instalaste Redis.
REM Esta es la ruta más común.
set REDIS_PATH="C:\Program Files\Redis"

REM --- NO EDITES DEBAJO DE ESTA LÍNEA ---

REM Pone un título a la ventana de la terminal para identificarla.
title Redis Server

echo.
echo ===================================
echo   Iniciando Servidor de Redis...
echo ===================================
echo.
echo Buscando Redis en: %REDIS_PATH%
echo.

REM Cambia al directorio donde está instalado Redis.
cd /d %REDIS_PATH%

REM Ejecuta el servidor de Redis.
REM redis.windows.conf es el archivo de configuración por defecto.
echo Ejecutando: redis-server.exe redis.windows.conf
echo.
redis-server.exe redis.windows.conf

REM La línea de arriba mantendrá esta ventana abierta mientras el servidor corra.
REM Si el servidor falla al iniciar, esta sección se ejecutará.
echo.
echo Si ves esto inmediatamente, hubo un error al iniciar el servidor.
echo Verifica que la ruta en REDIS_PATH sea la correcta.

pause