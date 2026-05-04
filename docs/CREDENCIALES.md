# 🔐 Credenciales de Acceso - VTV Capturadora 2.0

## 👤 Usuario Administrador

```
Usuario: [VER_ARCHIVO_.ENV]
Contraseña: [VER_ARCHIVO_.ENV]
```

**Importante:**
- ⚠️ Las credenciales reales se encuentran en el archivo `.env` del servidor.
- ❌ NUNCA compartas el archivo `.env` ni lo subas a repositorios públicos.

---

## 👥 Usuario Operador

```
Usuario: [VER_ARCHIVO_.ENV]
Contraseña: [VER_ARCHIVO_.ENV]
```

---

## 🔧 Resetear Contraseña de Administrador

Si necesitas cambiar la contraseña:

```bash
# Ejecutar script de reset
python3 reset_admin_password.py "nueva_contraseña"

# El script generará un hash y actualizará el archivo .env (o indicará cómo hacerlo)
# Reiniciar el servidor para aplicar cambios
```

---

## 🛡️ Seguridad

- ✅ Contraseñas hasheadas con bcrypt (12 rounds)
- ✅ Rate limiting contra fuerza bruta
- ✅ Registro de accesos (access_log.json)
- ✅ Sesiones con UUID únicos
- ✅ Tokens de autenticación

---

**Nota de Seguridad**: Este archivo ha sido saneado para eliminar información sensible tras la publicación del repositorio.
