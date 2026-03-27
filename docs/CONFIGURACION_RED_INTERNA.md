# 🌐 Configuración para Red Interna VTV

## ✅ Configuración Actual

El servidor está configurado para **HTTP puro** (sin HTTPS) porque:

1. ✅ **Red interna confiable** - Solo accesible dentro de VTV
2. ✅ **Sin warnings de certificados** - Acceso directo sin excepciones
3. ✅ **Sin instalación manual** - Funciona inmediatamente en cualquier dispositivo
4. ✅ **Más simple de mantener** - Sin renovación de certificados

---

## 🌐 Acceso al Sistema

### **Desde Cualquier Dispositivo en la Red VTV**

```
http://192.168.22.130:8000
```

O simplemente:

```
192.168.22.130:8000
```

**Sin warnings, sin instalación, sin configuración adicional.**

---

## 🔒 Seguridad en Red Interna

### **¿Es Seguro Sin HTTPS?**

**Sí, para red interna:**

- ✅ La red VTV es controlada y confiable
- ✅ No hay acceso desde Internet
- ✅ El tráfico no sale de la organización
- ✅ Firewall protege la red perimetral

### **Datos que Viajan Sin Cifrar**

- Contraseñas de login
- Datos de sesión
- Comandos de grabación

**Esto es aceptable** porque la red interna es confiable y está protegida por firewall.

---

## 🚀 Ventajas de HTTP en Red Interna

| Aspecto | HTTP | HTTPS |
|---------|------|-------|
| **Warnings** | ❌ Ninguno | ⚠️ Requiere certificado |
| **Instalación** | ✅ Cero configuración | ❌ Instalar CA en cada dispositivo |
| **Mantenimiento** | ✅ Sin renovaciones | ⚠️ Renovar cada 1-2 años |
| **Compatibilidad** | ✅ 100% dispositivos | ⚠️ Algunos dispositivos complejos |
| **Velocidad** | ✅ Ligeramente más rápido | ⚠️ Overhead de cifrado |

---

## 🔐 ¿Cuándo Usar HTTPS?

Considera habilitar HTTPS si:

- ❌ El servidor es accesible desde Internet
- ❌ Hay acceso desde redes WiFi públicas
- ❌ Políticas de seguridad lo requieren
- ❌ Hay datos extremadamente sensibles

Para red interna VTV controlada: **HTTP es suficiente y más práctico.**

---

## 📱 Acceso desde Dispositivos

### **Computadoras (Windows/Mac/Linux)**

```
http://192.168.22.130:8000
```

### **Tablets/Smartphones**

```
http://192.168.22.130:8000
```

### **Smart TVs**

```
http://192.168.22.130:8000
```

**Todos funcionan sin configuración adicional.**

---

## 🔄 Si Necesitas HTTPS en el Futuro

Si en algún momento necesitas habilitar HTTPS:

1. Consulta `HTTPS_SETUP.md`
2. Ejecuta `./setup_https.sh`
3. Reinicia el servidor

El código ya está preparado para detectar certificados automáticamente.

---

## 🛡️ Recomendaciones de Seguridad

Para red interna sin HTTPS:

1. ✅ **Firewall activo** - Bloquear acceso desde Internet
2. ✅ **Red segmentada** - VLAN separada para producción
3. ✅ **Contraseñas fuertes** - Aunque viajen sin cifrar
4. ✅ **Logs de acceso** - Monitorear intentos de login
5. ✅ **Backup regular** - De configuración y grabaciones

---

## 📊 Estado Actual

| Configuración | Valor |
|---------------|-------|
| **Protocolo** | HTTP (sin cifrado) |
| **Puerto** | 8000 |
| **Host** | 0.0.0.0 (todas las interfaces) |
| **Acceso** | Red interna VTV |
| **Warnings** | Ninguno |
| **Certificados** | No requeridos |

---

## 🆘 Troubleshooting

### No puedo acceder desde otro dispositivo

```bash
# Verificar que el servidor esté corriendo
ps aux | grep "python.*main.py"

# Verificar que el puerto esté abierto
sudo ufw allow 8000/tcp

# Verificar conectividad
ping 192.168.22.130
```

### El navegador intenta usar HTTPS

Algunos navegadores recuerdan si accediste antes con HTTPS.

**Solución:**
1. Limpia la caché del navegador
2. Usa modo incógnito
3. Escribe explícitamente `http://` en la URL

### Quiero volver a HTTPS

```bash
# Ejecutar script de configuración
./setup_https.sh

# El servidor detectará los certificados automáticamente
# y usará HTTPS en el próximo reinicio
```

---

## 📝 Resumen

- ✅ **Servidor HTTP activo** en `http://192.168.22.130:8000`
- ✅ **Sin warnings** de certificados
- ✅ **Sin instalación manual** en dispositivos
- ✅ **Acceso directo** desde cualquier navegador en la red VTV
- ✅ **Seguro para red interna** controlada

---

**Configuración optimizada para red interna VTV - Acceso simple y directo sin complicaciones.** 🌐✨

**Fecha**: 27 de Marzo, 2026  
**Servidor**: capturadora2 (192.168.22.130)  
**Protocolo**: HTTP (Red Interna)
