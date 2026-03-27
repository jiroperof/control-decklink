# 🔧 Instrucciones de Debug - VTV Capturadora 2.0

## 🐛 Problemas Reportados

1. **Panel de administrador**: Cajas una encima de otra (debería ser lado a lado)
2. **Panel de usuarios de grupos**: No muestra nada

---

## ✅ Correcciones Aplicadas

### **1. Grid Layout del Administrador**

**Problema:** El grid se estaba modificando incorrectamente para usuarios de grupos, afectando al admin.

**Solución:**
- Reset completo del grid al inicio de `restrictUIByRole()`
- Limpieza de `maxWidth` y `margin` inline styles
- Grid por defecto: `xl:grid-cols-[1fr_1fr_260px]` (2 canales + panel recursos)

### **2. Visibilidad de Paneles para Usuarios de Grupos**

**Problema:** Los paneles no se mostraban para jropero/jcontreras.

**Solución:**
- Agregado `setTimeout()` de 100ms antes de `applyChannelFilter()`
- Asegurar que el canal asignado se muestre explícitamente
- Console.log para debug en navegador

---

## 🧪 Cómo Verificar

### **Para Administrador:**

1. Login como `administrador` / `2wq3ew4re`
2. Deberías ver:
   - ✅ **Canal 1** (rojo) a la izquierda
   - ✅ **Canal 2** (cyan) en el centro
   - ✅ **Panel Recursos** a la derecha
   - ✅ Layout de 2 columnas en pantallas grandes

### **Para Usuario de Grupo (jropero):**

1. **Limpiar localStorage primero:**
   ```javascript
   // Abrir consola (F12) y ejecutar:
   localStorage.clear();
   location.reload();
   ```

2. Login como `jropero` (contraseña: la que tenga configurada)

3. **Verificar en consola:**
   ```javascript
   // Deberías ver estos logs:
   [FILTER] USER_CHANNEL: 2
   [FILTER] Mostrando canal: 2 | Ocultando canal: 1
   [FILTER] ✅ Canal 2 visible
   [FILTER] ❌ Canal 1 oculto
   ```

4. **Deberías ver:**
   - ✅ Solo **Canal 2** (cyan) centrado
   - ✅ **Panel Recursos** a la derecha
   - ❌ Canal 1 NO visible

### **Para Usuario de Grupo (jcontreras):**

1. Mismo proceso que jropero
2. Deberías ver:
   - ✅ Solo **Canal 1** (rojo) centrado
   - ✅ **Panel Recursos** a la derecha
   - ❌ Canal 2 NO visible

---

## 🔍 Debug en Consola del Navegador

Abre la consola (F12) y verifica:

```javascript
// Verificar canal asignado
localStorage.getItem('vtv_channel')
// Debería mostrar: "1" para jcontreras, "2" para jropero, null para admin

// Verificar rol
localStorage.getItem('vtv_role')
// Debería mostrar: "group1", "group2", o "admin"

// Verificar si los elementos existen
document.getElementById('cardCH1')  // Panel Canal 1
document.getElementById('cardCH2')  // Panel Canal 2

// Verificar clases aplicadas
document.getElementById('cardCH1').className
document.getElementById('cardCH2').className
// El canal oculto debería tener 'hidden' en sus clases
```

---

## 🛠️ Si Sigue Sin Funcionar

### **Opción 1: Hard Refresh**

```
Ctrl + Shift + R  (Linux/Windows)
Cmd + Shift + R   (Mac)
```

### **Opción 2: Limpiar Caché Completa**

1. Abrir DevTools (F12)
2. Click derecho en el botón de recargar
3. Seleccionar "Vaciar caché y recargar de forma forzada"

### **Opción 3: Verificar que el servidor esté actualizado**

```bash
cd /home/administrador/Documentos/control-decklink

# Verificar que los archivos JS estén actualizados
ls -la static/js/auth.js
ls -la static/js/dashboard.js

# Reiniciar servidor si es necesario
pkill -f "python.*main.py"
source .venv/bin/activate
python3 main.py &
```

---

## 📊 Cambios Técnicos Realizados

### **auth.js (líneas 181-187)**
```javascript
// Reset layout to defaults first
if (grid) {
    grid.classList.remove('xl:grid-cols-[1fr_1fr]', 'xl:grid-cols-[1fr_260px]', 'lg:grid-cols-[1fr_260px]');
    grid.classList.add('xl:grid-cols-[1fr_1fr_260px]', 'lg:grid-cols-[1fr_1fr]');
    grid.style.maxWidth = '';  // ← NUEVO: Limpiar inline styles
    grid.style.margin = '';    // ← NUEVO: Limpiar inline styles
}
```

### **auth.js (línea 231)**
```javascript
// Ocultar el canal que NO les pertenece
setTimeout(() => applyChannelFilter(), 100);  // ← NUEVO: Timeout para asegurar DOM listo
```

### **dashboard.js (líneas 600-635)**
```javascript
function applyChannelFilter() {
    console.log('[FILTER] USER_CHANNEL:', USER_CHANNEL);  // ← NUEVO: Debug
    if (!USER_CHANNEL) {
        console.warn('[FILTER] No USER_CHANNEL definido');  // ← NUEVO: Warning
        return;
    }
    
    // Mostrar el canal asignado explícitamente
    const visibleCard = document.getElementById(`cardCH${visibleCh}`);
    if (visibleCard) {
        visibleCard.classList.remove('hidden');  // ← NUEVO: Asegurar visibilidad
        console.log('[FILTER] ✅ Canal', visibleCh, 'visible');
    }
    // ... resto del código
}
```

---

## 🎯 Resultado Esperado

### **Administrador:**
```
┌─────────────┬─────────────┬──────────┐
│   Canal 1   │   Canal 2   │ Recursos │
│   (Rojo)    │   (Cyan)    │          │
└─────────────┴─────────────┴──────────┘
```

### **Usuario group1 (jcontreras):**
```
┌─────────────────────┬──────────┐
│      Canal 1        │ Recursos │
│      (Rojo)         │          │
│     Centrado        │          │
└─────────────────────┴──────────┘
```

### **Usuario group2 (jropero):**
```
┌─────────────────────┬──────────┐
│      Canal 2        │ Recursos │
│      (Cyan)         │          │
│     Centrado        │          │
└─────────────────────┴──────────┘
```

---

## 📝 Notas Importantes

1. **Siempre limpiar localStorage** antes de probar con un usuario diferente
2. **Verificar la consola** para ver los logs de debug
3. **Hard refresh** después de cambios en archivos JS
4. El **timeout de 100ms** es necesario para que el DOM esté completamente listo

---

**Fecha**: 27 de Marzo, 2026  
**Versión**: 2.1  
**Estado**: Correcciones aplicadas
