# 🔐 Credenciales de Acceso - VTV Capturadora 2.0

## 👤 Usuario Administrador

```
Usuario: administrador
Contraseña: 2wq3ew4re
```

**Importante:**
- ⚠️ Solo se acepta el usuario completo: `administrador`
- ❌ NO se aceptan alias como 'admin'

---

## 👥 Usuario Operador

```
Usuario: operador
Contraseña: (verificar en .env)
```

**Alias permitidos:**
- `operador` (nombre completo)

---

## 🔧 Resetear Contraseña de Administrador

Si necesitas cambiar la contraseña:

```bash
# Ejecutar script de reset
python3 reset_admin_password.py "nueva_contraseña"

# Copiar el hash generado al archivo .env
# Reiniciar el servidor
pkill -f "python.*main.py"
python3 main.py &
```

---

## 📝 Notas Importantes

1. **Las contraseñas están hasheadas** con bcrypt en el archivo `.env`
2. **Nunca subir `.env` a git** - contiene credenciales sensibles
3. **Backup automático** se crea en `.env.backup` antes de cambios
4. **Sesión única** para administrador (solo 1 sesión activa)
5. **Rate limiting** - 5 intentos fallidos = bloqueo de 5 minutos por IP

---

## 🚀 Acceso al Sistema

```
http://192.168.22.130:8000
```

1. Ingresa usuario: `admin` o `administrador`
2. Ingresa contraseña: `vtv2024`
3. Click en "Iniciar Sesión"

---

## 🛡️ Seguridad

- ✅ Contraseñas hasheadas con bcrypt (12 rounds)
- ✅ Rate limiting contra fuerza bruta
- ✅ Registro de accesos (access_log.json)
- ✅ Sesiones con UUID únicos
- ✅ Tokens de autenticación

---

**Fecha de actualización**: 27 de Marzo, 2026  
**Contraseña actual**: vtv2024
