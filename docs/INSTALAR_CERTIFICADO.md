# 🔒 Cómo Eliminar el Warning de Certificado

## 📋 Problema

Cuando accedes desde **otro dispositivo** (no el servidor), ves este error:

```
⚠️ Your connection is not private
NET::ERR_CERT_AUTHORITY_INVALID
```

## ✅ Solución

Instala el **Certificado de Autoridad (CA)** en cada dispositivo que acceda al sistema.

---

## 📥 Descargar el Certificado

### Opción 1: Desde el Navegador

1. Accede a: `https://192.168.22.130:8000`
2. Click en **"Advanced"** (Avanzado)
3. Click en **"Proceed to 192.168.22.130 (unsafe)"**
4. Una vez dentro, descarga el certificado:
   - URL directa: `https://192.168.22.130:8000/certs/vtv-ca-root.pem`

### Opción 2: Desde el Servidor

```bash
# El archivo está en:
/home/administrador/Documentos/control-decklink/certs/vtv-ca-root.pem

# Cópialo a una USB o envíalo por red
```

---

## 🖥️ Instalación por Sistema Operativo

### **Windows**

1. **Descargar** `vtv-ca-root.pem`
2. **Doble click** en el archivo
3. Click en **"Instalar certificado"**
4. Seleccionar **"Máquina local"** (requiere admin)
5. Click **"Siguiente"**
6. Seleccionar **"Colocar todos los certificados en el siguiente almacén"**
7. Click **"Examinar"** → Seleccionar **"Entidades de certificación raíz de confianza"**
8. Click **"Siguiente"** → **"Finalizar"**
9. Confirmar el warning de seguridad
10. **Reiniciar el navegador**

### **macOS**

1. **Descargar** `vtv-ca-root.pem`
2. **Doble click** en el archivo
3. Se abre **"Acceso a Llaveros"**
4. Seleccionar **"Sistema"** como destino
5. Ingresar contraseña de administrador
6. Buscar el certificado **"mkcert root@capturadora2"**
7. **Doble click** en el certificado
8. Expandir **"Confiar"**
9. Cambiar **"Al usar este certificado"** a **"Confiar siempre"**
10. Cerrar (pedirá contraseña nuevamente)
11. **Reiniciar el navegador**

### **Linux (Ubuntu/Debian)**

```bash
# Copiar certificado al sistema
sudo cp vtv-ca-root.pem /usr/local/share/ca-certificates/vtv-ca-root.crt

# Actualizar certificados del sistema
sudo update-ca-certificates

# Para Chrome/Chromium
mkdir -p ~/.pki/nssdb
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "VTV CA" -i vtv-ca-root.pem

# Para Firefox
# Settings → Privacy & Security → Certificates → View Certificates
# Authorities → Import → Seleccionar vtv-ca-root.pem
# ✅ Trust this CA to identify websites
```

### **Android**

1. **Transferir** `vtv-ca-root.pem` al dispositivo
2. Abrir **Configuración** → **Seguridad**
3. **Credenciales de confianza** → **Instalar desde almacenamiento**
4. Seleccionar `vtv-ca-root.pem`
5. Asignar un nombre: **"VTV Capturadora"**
6. Confirmar con PIN/huella
7. **Reiniciar el navegador**

### **iOS/iPadOS**

1. **Enviar** `vtv-ca-root.pem` por email o AirDrop
2. Abrir el archivo → **Instalar perfil**
3. Ir a **Configuración** → **General** → **Perfil**
4. Seleccionar el perfil instalado → **Instalar**
5. Ingresar código de desbloqueo
6. Ir a **Configuración** → **General** → **Información** → **Configuración de confianza de certificados**
7. **Habilitar** el certificado "mkcert root@capturadora2"
8. **Reiniciar Safari**

---

## 🌐 Endpoint Público del Certificado

He agregado un endpoint para descargar el certificado directamente:

```
https://192.168.22.130:8000/download-certificate
```

**Nota**: La primera vez verás el warning. Acepta temporalmente para descargar el certificado, luego instálalo.

---

## ✅ Verificación

Después de instalar el certificado:

1. **Reinicia el navegador** completamente
2. Accede a: `https://192.168.22.130:8000`
3. Deberías ver el **candado verde** 🔒
4. **Sin warnings**

---

## 🔧 Troubleshooting

### El warning persiste después de instalar

- **Reinicia el navegador** completamente (cerrar todas las ventanas)
- **Limpia la caché** del navegador
- Verifica que el certificado esté en **"Entidades raíz de confianza"**

### No encuentro el certificado instalado

**Windows**: 
- Presiona `Win + R` → `certmgr.msc`
- Buscar en "Entidades de certificación raíz de confianza"

**macOS**:
- Abrir "Acceso a Llaveros"
- Buscar "mkcert" en Sistema

### Error "NET::ERR_CERT_COMMON_NAME_INVALID"

Estás accediendo con un nombre/IP no incluido en el certificado.

**Solución**: Usa una de estas URLs:
- `https://localhost:8000` (solo desde el servidor)
- `https://192.168.22.130:8000` (desde la red)
- `https://capturadora2:8000` (si tienes DNS local)

---

## 🚀 Redirección HTTP → HTTPS

El servidor ahora **redirige automáticamente** HTTP a HTTPS:

```
http://192.168.22.130:8000  →  https://192.168.22.130:8000
```

**Beneficios**:
- ✅ Puedes escribir `http://` y te redirige a `https://`
- ✅ No necesitas recordar usar `https://`
- ✅ Todos los enlaces HTTP se convierten a HTTPS

---

## 📝 Resumen

| Acción | Resultado |
|--------|-----------|
| **Sin certificado instalado** | ⚠️ Warning en cada acceso |
| **Con certificado instalado** | ✅ Candado verde, sin warnings |
| **Acceso HTTP** | 🔄 Redirige automáticamente a HTTPS |

---

## 💡 Alternativa: Usar OpenSSL Self-Signed

Si no quieres instalar el certificado en cada dispositivo, puedes usar certificados auto-firmados con OpenSSL, pero **siempre verás el warning** y tendrás que aceptarlo manualmente.

Para producción con acceso público, usa **Let's Encrypt** (ver `HTTPS_SETUP.md`).

---

**Fecha**: 27 de Marzo, 2026  
**Servidor**: capturadora2 (192.168.22.130)  
**Certificado**: Válido hasta Junio 2028
