# 🚀 Inicio Rápido - HTTPS en 2 Minutos

## Para Usuarios Impacientes 😎

```bash
# 1. Ejecutar script automático
./setup_https.sh

# 2. Reiniciar servidor
sudo systemctl restart vtv-capturadora
# O si lo ejecutas manualmente:
# python3 main.py

# 3. Acceder
# https://localhost:8000
```

**¡Listo!** 🎉 Tu servidor ahora usa HTTPS sin warnings.

---

## ¿Qué hace el script?

1. ✅ Instala `mkcert` (si no está instalado)
2. ✅ Crea una Autoridad Certificadora (CA) local
3. ✅ Genera certificados SSL válidos
4. ✅ Los guarda en `certs/cert.pem` y `certs/key.pem`
5. ✅ Configura permisos correctos

---

## Verificación

### ✅ Servidor Iniciado Correctamente

Deberías ver en los logs:

```
🔒 Iniciando servidor con HTTPS en puerto 8000
📜 Certificado: /path/to/certs/cert.pem
🔑 Clave privada: /path/to/certs/key.pem
```

### ✅ Navegador Sin Warnings

Al acceder a `https://localhost:8000`:
- ✅ Candado verde en la barra de direcciones
- ✅ Sin mensaje de "Conexión no segura"
- ✅ Certificado válido

---

## Acceso desde Otros Dispositivos

### Obtener tu IP Local

```bash
hostname -I | awk '{print $1}'
# Ejemplo: 192.168.1.100
```

### Acceder desde Otro Dispositivo

```
https://192.168.1.100:8000
```

**⚠️ Importante:** El otro dispositivo mostrará un warning porque no confía en tu CA local.

**Solución:** Instala el CA root en el dispositivo (ver [HTTPS_SETUP.md](HTTPS_SETUP.md#acceso-desde-otros-dispositivos))

---

## Troubleshooting Rápido

### "Certificados SSL no encontrados"

```bash
# Verificar que existan
ls -la certs/

# Si no existen, ejecutar:
./setup_https.sh
```

### "Permission denied"

```bash
chmod 644 certs/cert.pem
chmod 600 certs/key.pem
```

### Navegador muestra warning

```bash
# Reinstalar CA
mkcert -install

# Regenerar certificados
cd certs && rm *.pem
mkcert localhost 127.0.0.1 $(hostname -I | awk '{print $1}')
mv localhost+*.pem cert.pem
mv localhost+*-key.pem key.pem
```

---

## Documentación Completa

Para opciones avanzadas, Let's Encrypt, OpenSSL, etc:

👉 **[HTTPS_SETUP.md](HTTPS_SETUP.md)**

---

**Tiempo total:** ~2 minutos ⏱️  
**Dificultad:** Fácil 🟢
