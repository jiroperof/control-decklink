#!/bin/bash

# ==========================================================
# Script de Limpieza Gestionado por VTV Control
# ==========================================================

# Directorio de Capturas
DIR_CAPTURA="/home/administrador/Capturas"
# Archivo de configuración
CONFIG_FILE="/home/administrador/Documentos/control-decklink/cleanup_config.json"

# Configuración predeterminada
RET_DAYS=2
FORCE_ALL=0

# Procesar argumentos
for arg in "$@"; do
    if [ "$arg" == "--force-all" ]; then
        FORCE_ALL=1
    fi
done

if [ "$FORCE_ALL" -eq 1 ]; then
    RET_DAYS=1
    echo "$(date): MODALIDAD FORZADA ACTIVADA (Borrar todo el historial previo a hoy)."
else
    # Leer días de retención de la configuración
    if [ -f "$CONFIG_FILE" ]; then
        RET_DAYS=$(grep -oP '"retention_days":\s*\K[0-9]+' "$CONFIG_FILE")
    fi
fi

# Validar que RET_DAYS sea un número
[ "$RET_DAYS" -eq "$RET_DAYS" ] 2>/dev/null || RET_DAYS=2

echo "$(date): Iniciando limpieza basada en CALENDARIO. Retencion: $RET_DAYS dias en $DIR_CAPTURA"

if [ -d "$DIR_CAPTURA" ]; then
    # Obtener fecha de referencia para borrar
    # Si RET_DAYS=1, UMBRAL es hoy (20260320). Borra todo < 20260320 (ej: ayer 19-03)
    # Si RET_DAYS=2, UMBRAL es ayer (20260319). Borra todo < 20260319 (ej: anteayer 18-03)
    OFFSET=$((RET_DAYS - 1))
    if [ $OFFSET -lt 0 ]; then OFFSET=0; fi
    UMBRAL=$(date -d "$OFFSET days ago" +%Y%m%d)
    
    echo "Fecha limite de conservacion: $UMBRAL"
    for folder in $(ls "$DIR_CAPTURA" | grep -E '^[0-9]{2}-[0-9]{2}-[0-9]{4}$'); do
        # Convertir DD-MM-YYYY a YYYYMMDD para comparar
        F_DATE=$(echo "$folder" | awk -F'-' '{print $3$2$1}')
        
        if [ "$F_DATE" -lt "$UMBRAL" ]; then
            echo "Borrando carpeta antigua: $folder (Fecha: $F_DATE < Umbral: $UMBRAL)"
            rm -rf "$DIR_CAPTURA/$folder"
        else
            echo "Manteniendo carpeta: $folder (Fecha: $F_DATE >= Umbral: $UMBRAL)"
        fi
    done
    
    # Tambien borrar archivos sueltos antiguos (por si acaso hay fuera de carpetas)
    find "$DIR_CAPTURA" -maxdepth 1 -name "*.mp4" -type f -mtime +$((RET_DAYS-1)) -delete
    
    echo "$(date): Limpieza completada."
else
    echo "$(date): Error: Directorio $DIR_CAPTURA no encontrado."
fi
