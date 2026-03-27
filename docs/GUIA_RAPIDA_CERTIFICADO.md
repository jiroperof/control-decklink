# 🚀 Guía Rápida - Eliminar Warning de Certificado

## ⚠️ Problema que Ves

Cuando accedes desde otro dispositivo (no el servidor), aparece:

```
⚠️ Your connection is not private
NET::ERR_CERT_AUTHORITY_INVALID
```

---

## ✅ Solución en 3 Pasos

### **Paso 1: Acceder Temporalmente**

1. En la pantalla del warning, click en **"Advanced"** (Avanzado)
2. Click en **"Proceed to 192.168.22.130 (unsafe)"** (Continuar a...)
3. Ahora estás dentro (con warning temporal)

### **Paso 2: Descargar el Certificado**

**Opción A - Desde el navegador:**
```
https://192.168.22.130:8000/download-certificate
```

**Opción B - Desde el servidor:**
```bash
# El archivo está en:
/home/administrador/Documentos/control-decklink/certs/vtv-ca-root.pem

# Cópialo a USB o envíalo por email/WhatsApp
```

### **Paso 3: Instalar el Certificado**

#### **Windows**
1. Doble click en `vtv-ca-root.pem`
2. "Instalar certificado" → "Máquina local"
3. "Colocar en el siguiente almacén" → **"Entidades de certificación raíz de confianza"**
4. Finalizar
5. **Reiniciar navegador**

#### **macOS**
1. Doble click en `vtv-ca-root.pem`
2. Se abre "Acceso a Llaveros" → Agregar a "Sistema"
3. Buscar "mkcert" → Doble click
4. "Confiar" → **"Confiar siempre"**
5. **Reiniciar navegador**

#### **Android**
1. Configuración → Seguridad → Instalar desde almacenamiento
2. Seleccionar `vtv-ca-root.pem`
3. Nombre: "VTV Capturadora"
4. **Reiniciar navegador**

---

## 🎯 Resultado

Después de instalar:
- ✅ **Candado verde** en el navegador
- ✅ **Sin warnings**
- ✅ Acceso directo con `https://192.168.22.130:8000`

---

## 🔄 Redirección HTTP → HTTPS

El servidor ahora redirige automáticamente:

```
http://192.168.22.130:8000  →  https://192.168.22.130:8000
```

**Puedes escribir solo la IP y puerto**, el servidor te redirige a HTTPS.

---

## 📝 URLs de Acceso

Todas estas funcionan:

```
http://192.168.22.130:8000   (redirige a HTTPS)
https://192.168.22.130:8000  (directo)
192.168.22.130:8000          (redirige a HTTPS)
```

---

## ❓ Preguntas Frecuentes

### ¿Tengo que instalar en cada dispositivo?

**Sí**, cada dispositivo que acceda necesita el certificado instalado.

### ¿Cuánto dura el certificado?

**2 años** (hasta Junio 2028). Después deberás regenerarlo.

### ¿Es seguro?

**Sí**, es un certificado local válido solo para tu red. No es visible desde Internet.

### ¿Puedo evitar instalar el certificado?

**Sí**, pero siempre verás el warning y tendrás que aceptarlo manualmente cada vez.

---

## 🆘 Si Tienes Problemas

Ver documentación completa en:
- `INSTALAR_CERTIFICADO.md` - Instrucciones detalladas
- `HTTPS_SETUP.md` - Configuración completa de HTTPS

---

**Servidor**: capturadora2 (192.168.22.130)  
**Válido hasta**: Junio 2028
