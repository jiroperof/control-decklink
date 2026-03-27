# 🔒 Configuración HTTPS para VTV Capturadora 2.0

## 📋 Tabla de Contenidos

1. [Instalación Rápida](#instalación-rápida)
2. [Opciones de Certificados](#opciones-de-certificados)
3. [Opción 1: mkcert (Recomendada)](#opción-1-mkcert-recomendada)
4. [Opción 2: OpenSSL Self-Signed](#opción-2-openssl-self-signed)
5. [Opción 3: Let's Encrypt (Producción)](#opción-3-lets-encrypt-producción)
6. [Acceso desde Otros Dispositivos](#acceso-desde-otros-dispositivos)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Instalación Rápida

### Método Automático (Recomendado)

```bash
# Ejecutar script de configuración
./setup_https.sh

# Reiniciar el servidor
sudo systemctl restart vtv-capturadora
```

El servidor ahora estará disponible en:
- **https://localhost:8000**
- **https://[TU_IP_LOCAL]:8000**

---

## 🎯 Opciones de Certificados

| Opción | Uso | Ventajas | Desventajas |
|--------|-----|----------|-------------|
| **mkcert** | Desarrollo local | ✅ Sin warnings<br>✅ Fácil instalación<br>✅ Confiable automáticamente | ❌ Solo local<br>❌ No para producción |
| **OpenSSL** | Desarrollo/Testing | ✅ No requiere instalación<br>✅ Funciona offline | ❌ Warnings en navegador<br>❌ Requiere aceptar manualmente |
| **Let's Encrypt** | Producción | ✅ Certificado oficial<br>✅ Gratis<br>✅ Renovación automática | ❌ Requiere dominio público<br>❌ Requiere puerto 80/443 |

---

## 🌟 Opción 1: mkcert (Recomendada)

### ¿Qué es mkcert?

**mkcert** es una herramienta simple para crear certificados SSL locales confiables sin configuración compleja.

### Instalación Manual

#### Linux (Debian/Ubuntu)

```bash
# Instalar dependencias
sudo apt-get update
sudo apt-get install -y libnss3-tools

# Descargar mkcert
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert

# Verificar instalación
mkcert -version
```

#### Linux (CentOS/RHEL)

```bash
sudo yum install -y nss-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

#### macOS

```bash
brew install mkcert
brew install nss  # Para Firefox
```

### Configuración

```bash
# 1. Instalar CA local (solo una vez)
mkcert -install

# 2. Crear directorio para certificados
mkdir -p certs
cd certs

# 3. Generar certificados
# Reemplaza 192.168.1.100 con tu IP local
mkcert localhost 127.0.0.1 192.168.1.100 ::1

# 4. Renombrar archivos
mv localhost+*.pem cert.pem
mv localhost+*-key.pem key.pem

# 5. Configurar permisos
chmod 644 cert.pem
chmod 600 key.pem

# 6. Volver al directorio raíz
cd ..

# 7. Reiniciar servidor
sudo systemctl restart vtv-capturadora
```

### Verificación

```bash
# El servidor debe mostrar:
# 🔒 Iniciando servidor con HTTPS en puerto 8000
# 📜 Certificado: /path/to/certs/cert.pem
# 🔑 Clave privada: /path/to/certs/key.pem

# Acceder en navegador (sin warnings):
# https://localhost:8000
```

---

## 🔧 Opción 2: OpenSSL Self-Signed

### Ventajas
- No requiere instalación adicional
- Funciona offline
- Rápido para testing

### Desventajas
- ⚠️ Navegadores mostrarán warning de seguridad
- Necesitas aceptar el certificado manualmente

### Generación de Certificados

```bash
# Crear directorio
mkdir -p certs
cd certs

# Generar certificado auto-firmado (válido 365 días)
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout key.pem \
  -out cert.pem \
  -days 365 \
  -subj "/C=VE/ST=Distrito Capital/L=Caracas/O=VTV/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:192.168.1.100"

# Configurar permisos
chmod 644 cert.pem
chmod 600 key.pem

cd ..
```

### Aceptar Certificado en Navegador

1. Accede a `https://localhost:8000`
2. Verás un warning de seguridad
3. Click en "Avanzado" → "Continuar a localhost (inseguro)"
4. El certificado quedará aceptado para esta sesión

**Chrome/Edge**: Settings → Privacy → Manage certificates → Authorities → Import `cert.pem`

**Firefox**: Settings → Privacy → View Certificates → Authorities → Import `cert.pem`

---

## 🌐 Opción 3: Let's Encrypt (Producción)

### Requisitos

- ✅ Dominio público (ej: `capturadora.vtv.gob.ve`)
- ✅ Servidor accesible desde Internet
- ✅ Puerto 80 y 443 abiertos

### Instalación con Certbot

```bash
# Instalar Certbot
sudo apt-get update
sudo apt-get install -y certbot

# Detener servidor temporalmente
sudo systemctl stop vtv-capturadora

# Obtener certificado (reemplaza con tu dominio)
sudo certbot certonly --standalone -d capturadora.vtv.gob.ve

# Certificados generados en:
# /etc/letsencrypt/live/capturadora.vtv.gob.ve/fullchain.pem
# /etc/letsencrypt/live/capturadora.vtv.gob.ve/privkey.pem

# Copiar a directorio del proyecto
sudo cp /etc/letsencrypt/live/capturadora.vtv.gob.ve/fullchain.pem certs/cert.pem
sudo cp /etc/letsencrypt/live/capturadora.vtv.gob.ve/privkey.pem certs/key.pem
sudo chown $USER:$USER certs/*.pem
chmod 644 certs/cert.pem
chmod 600 certs/key.pem

# Reiniciar servidor
sudo systemctl start vtv-capturadora
```

### Renovación Automática

```bash
# Crear script de renovación
sudo nano /etc/cron.monthly/renew-vtv-cert

# Contenido:
#!/bin/bash
certbot renew --quiet
cp /etc/letsencrypt/live/capturadora.vtv.gob.ve/fullchain.pem /path/to/certs/cert.pem
cp /etc/letsencrypt/live/capturadora.vtv.gob.ve/privkey.pem /path/to/certs/key.pem
systemctl restart vtv-capturadora

# Hacer ejecutable
sudo chmod +x /etc/cron.monthly/renew-vtv-cert
```

---

## 📱 Acceso desde Otros Dispositivos

### Con mkcert

Para que otros dispositivos confíen en tus certificados:

#### 1. Exportar CA Root

```bash
# En el servidor
mkcert -CAROOT
# Copia el archivo rootCA.pem
```

#### 2. Instalar en Dispositivos

**Windows**:
1. Doble click en `rootCA.pem`
2. Instalar certificado → Máquina local
3. Colocar en "Entidades de certificación raíz de confianza"

**macOS**:
1. Doble click en `rootCA.pem`
2. Agregar a "Llavero del Sistema"
3. Doble click → Confiar → Siempre confiar

**Android**:
1. Settings → Security → Install from storage
2. Seleccionar `rootCA.pem`

**iOS**:
1. Enviar `rootCA.pem` por email
2. Abrir → Instalar perfil
3. Settings → General → About → Certificate Trust Settings → Habilitar

### Con OpenSSL Self-Signed

Cada dispositivo debe aceptar el warning manualmente o importar el certificado.

---

## 🔍 Troubleshooting

### Error: "Certificados SSL no encontrados"

```bash
# Verificar que existan los archivos
ls -la certs/

# Deben existir:
# certs/cert.pem
# certs/key.pem

# Si no existen, ejecutar:
./setup_https.sh
```

### Error: "Permission denied" al leer certificados

```bash
# Configurar permisos correctos
chmod 644 certs/cert.pem
chmod 600 certs/key.pem
chown $USER:$USER certs/*.pem
```

### Navegador muestra "NET::ERR_CERT_AUTHORITY_INVALID"

**Con mkcert**:
```bash
# Reinstalar CA
mkcert -install

# Regenerar certificados
cd certs
rm *.pem
mkcert localhost 127.0.0.1 [TU_IP]
mv localhost+*.pem cert.pem
mv localhost+*-key.pem key.pem
```

**Con OpenSSL**:
- Es normal, acepta el certificado manualmente
- O importa `cert.pem` en el navegador

### Puerto 8000 ya en uso

```bash
# Verificar qué proceso usa el puerto
sudo lsof -i :8000

# Matar proceso si es necesario
sudo kill -9 [PID]

# O cambiar puerto en main.py (línea 1147)
```

### HTTPS funciona pero HTTP redirige

Esto es correcto. Una vez habilitado HTTPS, usa siempre `https://` en la URL.

### Certificado expirado

**mkcert**: Regenerar certificados (válidos 825 días)
```bash
cd certs
rm *.pem
mkcert localhost 127.0.0.1 [TU_IP]
```

**Let's Encrypt**: Renovar con certbot
```bash
sudo certbot renew
```

---

## 📊 Verificación de Seguridad

### Probar Configuración SSL

```bash
# Con openssl
openssl s_client -connect localhost:8000 -servername localhost

# Verificar protocolo y cipher
curl -vI https://localhost:8000 2>&1 | grep -E "SSL|TLS"

# Verificar certificado
echo | openssl s_client -connect localhost:8000 2>/dev/null | openssl x509 -noout -dates
```

### Herramientas Online

- **SSL Labs**: https://www.ssllabs.com/ssltest/
- **SSL Checker**: https://www.sslshopper.com/ssl-checker.html

---

## 🎯 Recomendaciones

### Desarrollo Local
✅ **Usar mkcert** - Sin warnings, fácil configuración

### Testing Interno
✅ **Usar OpenSSL** - Rápido, no requiere instalación

### Producción
✅ **Usar Let's Encrypt** - Certificados oficiales, gratis

---

## 📝 Notas Importantes

1. **Seguridad**: Los certificados auto-firmados son seguros para desarrollo, pero NO para producción pública

2. **Renovación**: 
   - mkcert: ~2 años de validez
   - Let's Encrypt: 90 días (renovar cada 60)

3. **.gitignore**: Los certificados ya están excluidos del repositorio

4. **Backup**: Guarda una copia de `certs/` en lugar seguro

5. **Firewall**: Asegúrate de que el puerto 8000 esté abierto:
   ```bash
   sudo ufw allow 8000/tcp
   ```

---

## ✅ Checklist de Instalación

- [ ] mkcert instalado
- [ ] CA local instalada (`mkcert -install`)
- [ ] Certificados generados en `certs/`
- [ ] Permisos configurados (644 cert, 600 key)
- [ ] Servidor reiniciado
- [ ] Acceso HTTPS funciona sin warnings
- [ ] `certs/` agregado a `.gitignore`

---

**Implementado**: 27 de Marzo, 2026  
**Autor**: VTV - Departamento de Tecnología  
**Versión**: 1.0
