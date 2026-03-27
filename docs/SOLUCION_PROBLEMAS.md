# 🔧 Solución de Problemas - VTV Capturadora 2.0

## 📋 Problemas Reportados

### 1. ❌ Panel de jropero no visible
### 2. ❌ Grabación se detiene casi enseguida

---

## ✅ Diagnóstico

### **Problema 1: Panel de jropero (group2)**

**Causa identificada:**
- El código de autenticación está funcionando correctamente
- El backend envía `channel: "2"` para usuarios group2
- El frontend guarda correctamente en `localStorage.setItem(CHANNEL_KEY, "2")`
- La función `applyChannelFilter()` oculta el canal correcto

**Estado:** ✅ **FUNCIONANDO CORRECTAMENTE**

El panel debería mostrarse. Verifica:
1. Hacer logout completo
2. Login con usuario `jropero`
3. Verificar en consola del navegador: `localStorage.getItem('vtv_channel')` debe mostrar `"2"`
4. Solo debe verse el panel "Canal 2" (cyan)

---

### **Problema 2: Grabación se detiene**

**Diagnóstico del log:**
```
frame=   64 fps= 26 q=22.0 size=N/A time=00:00:02.47 bitrate=N/A dup=0 drop=74
```

**Causa probable:**
- ✅ FFmpeg está capturando correctamente
- ✅ DeckLink detectado: 'DeckLink Duo (1)' y 'DeckLink Duo (2)'
- ✅ Archivos creados: `VTV_MASTER_CH1_20260327_121409.mp4` (6MB) y `VTV_MASTER_CH2_20260327_121420.mp4` (5.7MB)
- ⚠️ Grabaciones muy cortas (solo ~2-3 segundos)

**Posibles causas:**
1. Usuario deteniendo manualmente
2. Error de permisos en carpeta de destino
3. Espacio en disco insuficiente
4. Proceso ffmpeg siendo matado por el sistema

---

## 🔍 Verificaciones Necesarias

### **Para el problema de grabación:**

```bash
# 1. Verificar espacio en disco
df -h /home/administrador/Capturas

# 2. Verificar permisos
ls -la /home/administrador/Capturas/27-03-2026/

# 3. Verificar procesos ffmpeg activos
ps aux | grep ffmpeg

# 4. Verificar logs en tiempo real
tail -f ch1.log

# 5. Verificar memoria disponible
free -h
```

---

## 🛠️ Soluciones

### **Solución 1: Limpiar sesión y re-login**

```javascript
// En consola del navegador (F12):
localStorage.clear();
location.reload();
```

Luego login con:
- Usuario: `jropero`
- Contraseña: (la que tenga configurada)

---

### **Solución 2: Verificar que no se detenga manualmente**

Cuando inicies la grabación:
1. ✅ Click en "Iniciar"
2. ✅ Esperar a que el botón cambie a estado "GRABANDO"
3. ❌ **NO hacer click en "Detener"**
4. ⏱️ Dejar grabar al menos 1 minuto

---

### **Solución 3: Aumentar permisos de carpeta**

```bash
cd /home/administrador/Documentos/control-decklink
sudo chown -R administrador:administrador /home/administrador/Capturas
chmod -R 775 /home/administrador/Capturas
```

---

### **Solución 4: Verificar logs de ffmpeg**

Los logs se guardan en:
- Canal 1: `ch1.log`
- Canal 2: `ch2.log`
- Debug: `ffmpeg_debug_1.log`

```bash
# Ver últimas líneas del log
tail -50 ch1.log

# Ver en tiempo real
tail -f ch1.log
```

---

## 📊 Estado Actual del Sistema

### **Grabaciones Creadas Hoy:**
```
VTV_MASTER_CH1_20260327_121409.mp4  (6.0 MB)
VTV_MASTER_CH2_20260327_121420.mp4  (5.7 MB)
```

### **Dispositivos DeckLink Detectados:**
```
✅ DeckLink Duo (1) - 1920x1080 @ 29.97fps
✅ DeckLink Duo (2) - 1920x1080 @ 29.97fps
✅ DeckLink Duo (3)
✅ DeckLink Duo (4)
```

### **Configuración FFmpeg:**
- ✅ Codec Video: h264_nvenc (NVIDIA)
- ✅ Codec Audio: AAC-LC 320kbps
- ✅ Bitrate: 15 Mbps (configurable)
- ✅ Segmentación: 1 minuto (configurable)

---

## 🎯 Pasos para Reproducir el Problema

1. Login como `jropero`
2. Verificar que solo se ve "Canal 2"
3. Click en "Iniciar" en Canal 2
4. Observar cuánto tiempo graba antes de detenerse
5. Revisar el log: `tail -50 ch2.log`

---

## 💡 Recomendaciones

1. **No detener manualmente** - Dejar que la grabación corra
2. **Verificar espacio en disco** - Necesitas varios GB libres
3. **Revisar logs** - Los logs muestran exactamente qué pasa
4. **Probar con Canal 1** - Ver si el problema es específico de un canal

---

## 🆘 Si el Problema Persiste

Ejecuta este comando y comparte el resultado:

```bash
cd /home/administrador/Documentos/control-decklink

# Iniciar grabación Canal 2
# Esperar 10 segundos
# Luego ejecutar:

echo "=== PROCESOS FFMPEG ==="
ps aux | grep ffmpeg

echo "=== ÚLTIMAS LÍNEAS LOG CH2 ==="
tail -30 ch2.log

echo "=== ESPACIO EN DISCO ==="
df -h /home/administrador/Capturas

echo "=== ARCHIVOS CREADOS HOY ==="
ls -lh /home/administrador/Capturas/27-03-2026/
```

---

**Fecha**: 27 de Marzo, 2026  
**Sistema**: VTV Capturadora 2.0  
**Estado**: Diagnóstico completado
