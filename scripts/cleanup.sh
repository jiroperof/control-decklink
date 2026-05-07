#!/bin/bash

# ==========================================================
# Script de Limpieza Gestionado por VTV Control
# ==========================================================

# Directorio de Capturas
DIR_CAPTURA="/home/administrador/Capturas"
# Archivo de configuración
CONFIG_FILE="/home/administrador/Documentos/control-decklink/data/cleanup_config.json"

# Configuración predeterminada
RET_DAYS=2
FORCE_ALL=0
SPECIFIC_DAY=""
AUTO_DISK=0
DISK_THRESHOLD=95
DISK_TARGET=90

# Procesar argumentos
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --force-all) FORCE_ALL=1; shift ;;
        --specific-day) SPECIFIC_DAY="$2"; shift 2 ;;
        --auto-disk) AUTO_DISK=1; shift ;;
        *) shift ;;
    esac
done

# Función para obtener uso de disco en %
get_disk_usage() {
    df "$DIR_CAPTURA" | tail -1 | awk '{print $5}' | sed 's/%//'
}

# Lógica de limpieza por espacio en disco
if [ "$AUTO_DISK" -eq 1 ]; then
    USAGE=$(get_disk_usage)
    echo "$(date): Verificando espacio en disco. Uso actual: $USAGE%"
    
    if [ "$USAGE" -ge "$DISK_THRESHOLD" ]; then
        echo "$(date): ALERTA: Disco casi lleno ($USAGE%). Iniciando purga de archivos antiguos..."
        
        while [ "$(get_disk_usage)" -ge "$DISK_TARGET" ]; do
            # Buscar el archivo .mp4 más antiguo en todo el árbol
            OLDEST_FILE=$(find "$DIR_CAPTURA" -name "*.mp4" -type f -printf '%T+ %p\n' | sort | head -n 1 | awk '{print $2}')
            
            if [ -z "$OLDEST_FILE" ]; then
                echo "No se encontraron más archivos .mp4 para borrar."
                break
            fi
            
            echo "Borrando archivo más antiguo: $OLDEST_FILE"
            rm -f "$OLDEST_FILE"
            
            # Opcional: Borrar carpetas vacías después de borrar el archivo
            PARENT_DIR=$(dirname "$OLDEST_FILE")
            if [ "$PARENT_DIR" != "$DIR_CAPTURA" ]; then
                find "$PARENT_DIR" -type d -empty -delete
            fi
        done
        echo "$(date): Limpieza por disco completada. Uso final: $(get_disk_usage)%"
    else
        echo "Espacio en disco suficiente ($USAGE% < $DISK_THRESHOLD%)."
    fi
    exit 0
fi

if [ -n "$SPECIFIC_DAY" ]; then
    echo "$(date): MODALIDAD ESPECIFICA ACTIVADA (Borrar dia: $SPECIFIC_DAY)."
    if [ -d "$DIR_CAPTURA/$SPECIFIC_DAY" ]; then
        echo "Borrando carpeta especifica: $SPECIFIC_DAY"
        rm -rf "$DIR_CAPTURA/$SPECIFIC_DAY"
        echo "$(date): Limpieza especifica completada."
    else
        echo "$(date): No se encontro la carpeta $DIR_CAPTURA/$SPECIFIC_DAY."
    fi
    exit 0
fi

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
