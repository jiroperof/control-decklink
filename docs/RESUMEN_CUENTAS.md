# 👥 Resumen de Cuentas - VTV Capturadora 2.0

## 📊 Usuarios del Sistema

Este documento describe los roles y permisos de los usuarios. Las credenciales reales (usuarios, contraseñas y tokens) se gestionan a través del archivo `.env` (usuarios estáticos) y `users_db.json` (usuarios dinámicos).

---

## 🔴 **Usuarios Estáticos (Configurados en .env)**

### 1. **Administrador** 👑
- **Rol**: `admin`
- **Permisos**: Control total del sistema.
- **Capacidades**: Gestión de canales, usuarios, horarios, estadísticas y limpieza.

### 2. **Operador Global** 👁️
- **Rol**: `operator`
- **Permisos**: Vista de solo lectura global.
- **Capacidades**: Ver estado de canales, métricas y vista previa.

---

## 🟢 **Usuarios Dinámicos (Configurados en users_db.json)**

Los usuarios dinámicos tienen acceso restringido a canales específicos según su rol (`group1`, `group2`, etc.).

---

## 🔐 **Seguridad**

- ✅ Todas las contraseñas están hasheadas con **bcrypt**.
- ✅ Tokens únicos por sesión para autenticación.
- ✅ Rate limiting activo.
- ✅ Registro de auditoría en `access_log.json`.

---

**IMPORTANTE**: Por motivos de seguridad, las contraseñas y tokens en texto plano han sido eliminados de la documentación técnica. Consulte los archivos de configuración protegidos en el servidor.
