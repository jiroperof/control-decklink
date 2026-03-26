#!/bin/bash
# Script para iniciar el servidor de control DeckLink correctamente

BASE_DIR="/home/administrador/Documentos/control-decklink"
cd "$BASE_DIR"

# Activar el entorno virtual si existe
if [ -d "$BASE_DIR/.venv" ]; then
    source "$BASE_DIR/.venv/bin/activate"
else
    echo "Error: .venv no encontrado en $BASE_DIR"
    exit 1
fi

# Matar procesos anteriores si los hubiera en el puerto 8000
fuser -k 8000/tcp 2>/dev/null

# Iniciar el servidor en segundo plano
echo "Iniciando servidor DeckLink..."
nohup python3 main.py > server.log 2>&1 &

echo "Servidor iniciado en segundo plano. Log en server.log"
deactivate
