# 👥 Resumen de Cuentas - VTV Capturadora 2.0

## 📊 Total de Cuentas: **5 usuarios**

---

## 🔴 **Usuarios Estáticos (Configurados en .env)**

### 1. **Administrador** 👑
```
Usuario: administrador (alias: admin)
Contraseña: vtv2024
Token: vtv_secure_token_2024
Rol: admin
Permisos: Control total del sistema
Sesiones: 1 sesión simultánea máximo
```

**Capacidades:**
- ✅ Ver y controlar ambos canales (1 y 2)
- ✅ Iniciar/detener grabaciones
- ✅ Configurar horarios programados
- ✅ Ver estadísticas y métricas del sistema
- ✅ Gestionar usuarios (crear, editar, eliminar)
- ✅ Ver logs de acceso y auditoría
- ✅ Limpiar archivos antiguos
- ✅ Acceso completo a todas las funciones

---

### 2. **Operador Global** 👁️
```
Usuario: operador
Contraseña: vtv2024
Token: vtv_operator_token_2024
Rol: operator
Permisos: Vista de solo lectura
Sesiones: 3 sesiones simultáneas máximo
```

**Capacidades:**
- ✅ Ver estado de ambos canales (1 y 2)
- ✅ Ver métricas del sistema
- ✅ Ver vista previa de video
- ❌ NO puede iniciar/detener grabaciones
- ❌ NO puede modificar configuraciones
- ❌ NO puede gestionar usuarios
- ❌ NO puede limpiar archivos

---

## 🟢 **Usuarios Dinámicos (Configurados en users_db.json)**

### 3. **jcontreras** - Canal 1 📹
```
Usuario: jcontreras
Contraseña: (hasheada en BD)
Token: c74537b4f3e376418363fdebd9a0bc54df47955a9d87aa73
Rol: group1
Canal asignado: Canal 1
Sesiones: 3 sesiones simultáneas máximo
```

**Capacidades:**
- ✅ Ver y controlar SOLO Canal 1
- ✅ Iniciar/detener grabación Canal 1
- ✅ Configurar horarios Canal 1
- ✅ Ver métricas del sistema
- ✅ Ver vista previa Canal 1
- ❌ NO puede ver ni controlar Canal 2
- ❌ NO puede gestionar usuarios
- ❌ NO puede limpiar archivos

---

### 4. **jropero** - Canal 2 📹
```
Usuario: jropero
Contraseña: (hasheada en BD)
Token: cdacb91f542ccdcd1ea6c1abc3da58f6863b9ab7c023d7cd
Rol: group2
Canal asignado: Canal 2
Sesiones: 3 sesiones simultáneas máximo
```

**Capacidades:**
- ✅ Ver y controlar SOLO Canal 2
- ✅ Iniciar/detener grabación Canal 2
- ✅ Configurar horarios Canal 2
- ✅ Ver métricas del sistema
- ✅ Ver vista previa Canal 2
- ❌ NO puede ver ni controlar Canal 1
- ❌ NO puede gestionar usuarios
- ❌ NO puede limpiar archivos

---

### 5. **eblanco** - Canal 2 📹
```
Usuario: eblanco
Contraseña: (hasheada en BD)
Token: fa445afdd5104d09138fe012b4335742e076eba1f42ee3c8
Rol: group2
Canal asignado: Canal 2
Sesiones: 3 sesiones simultáneas máximo
```

**Capacidades:**
- ✅ Ver y controlar SOLO Canal 2
- ✅ Iniciar/detener grabación Canal 2
- ✅ Configurar horarios Canal 2
- ✅ Ver métricas del sistema
- ✅ Ver vista previa Canal 2
- ❌ NO puede ver ni controlar Canal 1
- ❌ NO puede gestionar usuarios
- ❌ NO puede limpiar archivos

---

## 📋 **Resumen por Rol**

| Rol | Cantidad | Usuarios | Permisos |
|-----|----------|----------|----------|
| **Admin** | 1 | administrador | Control total |
| **Operator** | 1 | operador | Solo lectura global |
| **Group1** | 1 | jcontreras | Control Canal 1 |
| **Group2** | 2 | jropero, eblanco | Control Canal 2 |

---

## 🔐 **Seguridad**

- ✅ Todas las contraseñas están hasheadas con **bcrypt** (12 rounds)
- ✅ Tokens únicos por usuario para autenticación
- ✅ Rate limiting: 5 intentos fallidos = bloqueo 5 minutos
- ✅ Registro de accesos en `access_log.json`
- ✅ Sesiones con UUID únicos
- ✅ Control de sesiones concurrentes por rol

---

## 📊 **Distribución de Canales**

```
Canal 1: 1 usuario (jcontreras)
Canal 2: 2 usuarios (jropero, eblanco)
```

---

## 🛠️ **Gestión de Usuarios**

### **Crear Nuevo Usuario**
Solo el administrador puede crear usuarios desde la interfaz web:
1. Login como administrador
2. Click en "Administración"
3. Ingresar datos del nuevo usuario
4. Asignar canal (1 o 2)
5. Guardar

### **Eliminar Usuario**
Solo el administrador puede eliminar usuarios dinámicos (no puede eliminar admin ni operador).

### **Cambiar Contraseña**
- **Admin/Operador**: Usar `reset_admin_password.py`
- **Usuarios dinámicos**: Eliminar y recrear desde la interfaz

---

## 📝 **Notas Importantes**

1. **Usuarios estáticos** (admin, operador) están en `.env` - requieren reinicio del servidor para cambios
2. **Usuarios dinámicos** están en `users_db.json` - cambios en tiempo real
3. **No se pueden eliminar** usuarios estáticos (admin, operador)
4. **Sesiones únicas** para admin, **múltiples** para otros roles
5. **Backup automático** de users_db.json antes de modificaciones

---

## 🚀 **Acceso al Sistema**

```
URL: http://192.168.22.130:8000
```

**Credenciales conocidas:**
- Admin: `admin` / `vtv2024`
- Operador: `operador` / `vtv2024`
- Usuarios dinámicos: Consultar con administrador

---

**Fecha de actualización**: 27 de Marzo, 2026  
**Total usuarios activos**: 5
