#!/bin/bash
# Script para actualizar .env con passwords hasheados

ENV_FILE="/home/administrador/Documentos/control-decklink/.env"
BACKUP_FILE="/home/administrador/Documentos/control-decklink/.env.backup"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: Archivo .env no encontrado."
    exit 1
fi

# Crear backup
cp "$ENV_FILE" "$BACKUP_FILE"
echo "✓ Backup creado: .env.backup"

# Reemplazar hashes (Placeholders - Sustituir con hashes reales generados localmente)
# ADMIN_HASH="[TU_HASH_BCRYPT_AQUI]"
# OPERATOR_HASH="[TU_HASH_BCRYPT_AQUI]"

echo "⚠️ Este script debe ser configurado localmente con los hashes deseados."
echo "Utiliza el script utils/hash_env_passwords.py para generar nuevos hashes."
