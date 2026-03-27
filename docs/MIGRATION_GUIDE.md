# 🔄 Guía de Migración - Mejoras de Seguridad y Rendimiento

## ⚠️ IMPORTANTE: Migración Obligatoria

Esta versión incluye **mejoras críticas de seguridad** que requieren migración de passwords.

---

## 📦 Paso 1: Instalar Dependencias

```bash
cd /home/administrador/Documentos/control-decklink
source .venv/bin/activate
pip install bcrypt
```

O instalar todas las dependencias:
```bash
pip install -r requirements.txt
```

---

## 🔐 Paso 2: Migrar Passwords

### A. Hashear passwords del archivo .env

1. **Ejecutar Python interactivo:**
```bash
python3
```

2. **Hashear tus passwords:**
```python
import bcrypt

def hash_pw(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Hashear password del admin
admin_hash = hash_pw('TU_PASSWORD_ADMIN_ACTUAL')
print(f"ADMIN_PASS={admin_hash}")

# Hashear password del operador
operator_hash = hash_pw('TU_PASSWORD_OPERADOR_ACTUAL')
print(f"OPERATOR_PASS={operator_hash}")
```

3. **Actualizar `.env`:**
```bash
# Antes:
ADMIN_PASS=mipassword123
OPERATOR_PASS=operador456

# Después:
ADMIN_PASS=$2b$12$abcd1234...hash_completo
OPERATOR_PASS=$2b$12$efgh5678...hash_completo
```

### B. Migrar usuarios dinámicos (users_db.json)

```bash
python3 migrate_passwords.py
```

Este script migrará automáticamente todos los usuarios en `users_db.json`.

---

## 🚀 Paso 3: Reiniciar el Servidor

```bash
sudo systemctl restart vtv-decklink
```

O si ejecutas manualmente:
```bash
python3 main.py
```

---

## ✅ Verificación

1. **Verifica que el servidor arranca sin errores:**
```bash
sudo systemctl status vtv-decklink
# o
tail -f server.log
```

2. **Prueba el login** desde la interfaz web

3. **Verifica los logs** para confirmar que no hay errores de autenticación

---

## 📝 Cambios Implementados

### 🔴 Críticos (Seguridad)
- ✅ **Password hashing con bcrypt** - Passwords ya no se almacenan en texto plano
- ✅ **Tokens en headers** - Ya no se exponen en URLs/logs
- ✅ **Locks para race conditions** - Previene corrupción de datos concurrentes

### 🟡 Importantes (Rendimiento)
- ✅ **Evicción de cache LRU** - Límite de 5000 entradas, previene memory leak
- ✅ **Logging mejorado** - Todas las excepciones ahora se registran apropiadamente

### 🟢 Mejoras Adicionales
- ✅ **ACCESS_LOG truncado automáticamente** - Previene crecimiento infinito en memoria
- ✅ **Timeout de ffprobe aumentado** - De 1s a 3s para archivos grandes
- ✅ **Mejor manejo de sesiones** - Usa `isinstance()` en lugar de `type()`

---

## 🔧 Troubleshooting

### Error: "ModuleNotFoundError: No module named 'bcrypt'"
```bash
pip install bcrypt
```

### Error: "Invalid salt" al hacer login
- Verifica que los hashes en `.env` estén completos (empiezan con `$2b$`)
- No agregues comillas alrededor de los hashes en `.env`

### Los usuarios no pueden hacer login
1. Verifica que ejecutaste `migrate_passwords.py`
2. Revisa `server.log` para ver errores específicos
3. Confirma que los passwords en `.env` están hasheados correctamente

### Frontend no puede descargar/reproducir archivos
- El frontend necesita enviar el token en el header `X-Token` en lugar de query string
- Verifica que el código JavaScript esté actualizado

---

## 📞 Soporte

Si encuentras problemas durante la migración:
- Revisa los logs: `tail -f server.log`
- Extensión telefónica: 8
- Email: mesadeayuda@vtv.gob.ve

---

## 🔙 Rollback (Solo en Emergencia)

Si necesitas revertir los cambios:

1. Restaurar código anterior desde git:
```bash
git checkout HEAD~1 main.py
```

2. Restaurar `.env` con passwords en texto plano

3. Reiniciar servidor

**⚠️ NO RECOMENDADO - Las mejoras de seguridad son críticas**
