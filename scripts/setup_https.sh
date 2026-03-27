#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# Setup HTTPS con mkcert para VTV Capturadora 2.0
# ══════════════════════════════════════════════════════════════════════════════

set -e

echo "🔒 Instalando HTTPS local con mkcert..."
echo ""

# ── 1. Instalar mkcert ────────────────────────────────────────────────────────
echo "📦 Paso 1: Instalando mkcert..."

if command -v mkcert &> /dev/null; then
    echo "✅ mkcert ya está instalado"
else
    # Detectar sistema operativo
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Debian/Ubuntu
            sudo apt-get update
            sudo apt-get install -y libnss3-tools
            
            # Descargar mkcert
            curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
            chmod +x mkcert-v*-linux-amd64
            sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
        elif command -v yum &> /dev/null; then
            # CentOS/RHEL
            sudo yum install -y nss-tools
            curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
            chmod +x mkcert-v*-linux-amd64
            sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        brew install mkcert
        brew install nss # para Firefox
    fi
    
    echo "✅ mkcert instalado correctamente"
fi

echo ""

# ── 2. Crear CA local ─────────────────────────────────────────────────────────
echo "🔑 Paso 2: Creando Autoridad Certificadora (CA) local..."
mkcert -install
echo "✅ CA local instalada en el sistema"
echo ""

# ── 3. Crear directorio para certificados ────────────────────────────────────
CERT_DIR="$(pwd)/certs"
mkdir -p "$CERT_DIR"
echo "📁 Directorio de certificados: $CERT_DIR"
echo ""

# ── 4. Generar certificados ───────────────────────────────────────────────────
echo "📜 Paso 3: Generando certificados SSL..."

cd "$CERT_DIR"

# Generar certificado para localhost y la IP local
HOSTNAME=$(hostname)
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo "Generando certificados para:"
echo "  - localhost"
echo "  - 127.0.0.1"
echo "  - $HOSTNAME"
echo "  - $LOCAL_IP"
echo ""

mkcert localhost 127.0.0.1 "$HOSTNAME" "$LOCAL_IP" ::1

# Renombrar archivos para nombres más claros
mv localhost+*.pem cert.pem 2>/dev/null || true
mv localhost+*-key.pem key.pem 2>/dev/null || true

# Si no se renombraron, buscar los archivos generados
if [ ! -f "cert.pem" ]; then
    CERT_FILE=$(ls localhost+*.pem | head -1)
    KEY_FILE=$(ls localhost+*-key.pem | head -1)
    mv "$CERT_FILE" cert.pem
    mv "$KEY_FILE" key.pem
fi

echo "✅ Certificados generados:"
echo "   📄 Certificado: $CERT_DIR/cert.pem"
echo "   🔑 Clave privada: $CERT_DIR/key.pem"
echo ""

# ── 5. Configurar permisos ────────────────────────────────────────────────────
chmod 644 cert.pem
chmod 600 key.pem
echo "✅ Permisos configurados correctamente"
echo ""

# ── 6. Actualizar .gitignore ──────────────────────────────────────────────────
cd ..
if ! grep -q "certs/" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# SSL Certificates" >> .gitignore
    echo "certs/" >> .gitignore
    echo "✅ Agregado certs/ a .gitignore"
fi
echo ""

# ── 7. Información final ──────────────────────────────────────────────────────
echo "════════════════════════════════════════════════════════════════════════════"
echo "✨ HTTPS configurado exitosamente!"
echo "════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Próximos pasos:"
echo ""
echo "1. El servidor ahora usará HTTPS automáticamente"
echo "2. Accede a: https://localhost:8000"
echo "3. También funciona en: https://$LOCAL_IP:8000"
echo ""
echo "🔒 Certificados válidos para:"
echo "   • localhost"
echo "   • 127.0.0.1"
echo "   • $HOSTNAME"
echo "   • $LOCAL_IP"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   - Los certificados son válidos SOLO en esta máquina"
echo "   - Otros dispositivos necesitarán instalar el CA local"
echo "   - Para producción, usa Let's Encrypt o certificados oficiales"
echo ""
echo "🚀 Reinicia el servidor para aplicar cambios"
echo "════════════════════════════════════════════════════════════════════════════"
