#!/bin/bash
# Script para actualizar .env con passwords hasheados

ENV_FILE="/home/administrador/Documentos/control-decklink/.env"
BACKUP_FILE="/home/administrador/Documentos/control-decklink/.env.backup"

# Crear backup
cp "$ENV_FILE" "$BACKUP_FILE"
echo "✓ Backup creado: .env.backup"

# Actualizar ADMIN_PASS
sed -i 's|^ADMIN_PASS=.*|ADMIN_PASS=$2b$12$6ZPScTzalOU2WDODilFjmObY4EOKZc2HtGXkQjOWQaS3WGxoV7CaO|' "$ENV_FILE"
echo "✓ ADMIN_PASS actualizado"

# Actualizar OPERATOR_PASS
sed -i 's|^OPERATOR_PASS=.*|OPERATOR_PASS=$2b$12$l6mIpl5kkR.bSOm96bwcJOLMSkZR8XTsoLEzanOqYUzqJzLLZ80yW|' "$ENV_FILE"
echo "✓ OPERATOR_PASS actualizado"

echo ""
echo "✓ Archivo .env actualizado con passwords hasheados"
echo "✓ Backup guardado en: .env.backup"
echo ""
echo "Ahora reinicia el servidor:"
echo "  sudo systemctl restart vtv-decklink"
