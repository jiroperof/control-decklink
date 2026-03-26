#!/bin/bash
# Script para matar procesos ffmpeg "zombies" asociados a Decklink.
# Detecta si el servidor está vivo ya sea como 'python main.py' o vía 'uvicorn'.

logger "Iniciando chequeo de procesos FFmpeg huérfanos..."

# Encontrar procesos ffmpeg que estén usando decklink
FFMPEG_PIDS=$(pgrep -f "ffmpeg.*decklink")

if [ -z "$FFMPEG_PIDS" ]; then
    logger "No hay procesos FFmpeg corriendo."
    exit 0
fi

# Detectar el servidor: compatible con ejecución directa (python main.py) y con uvicorn
SERVER_PID=$(pgrep -f "python.*main\.py" || pgrep -f "uvicorn.*main:app")

for PID in $FFMPEG_PIDS; do
    # Obtenemos el ID del proceso padre (Parent PID)
    PARENT=$(ps -o ppid= -p $PID 2>/dev/null | awk '{print $1}')
    
    if [ -z "$PARENT" ]; then
        continue
    fi
    
    # Si el padre es 1 (init/systemd), el proceso quedó huérfano → zombie
    if [ "$PARENT" -eq 1 ]; then
        logger "Matando ffmpeg huérfano (padre=init) PID $PID"
        kill -9 $PID
        continue
    fi
    
    # Si el servidor python/uvicorn NO está corriendo y hay ffmpeg vivos → zombies
    if [ -z "$SERVER_PID" ]; then
        logger "Servidor no activo pero ffmpeg ($PID) está corriendo. Matando..."
        kill -9 $PID
        continue
    fi
done

logger "Chequeo finalizado."
