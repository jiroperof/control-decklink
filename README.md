<div align="center">
  <img src="static/logo.png" alt="VTV Logo" width="140"/>
  <h1>VTV — Capturadora Multicanal 2.3</h1>
  <p><strong>Sistema de grabación SDI en tiempo real con Blackmagic DeckLink + NVIDIA NVENC</strong></p>

  ![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
  ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-109989?logo=fastapi&logoColor=white)
  ![FFmpeg](https://img.shields.io/badge/FFmpeg-DeckLink%20%2B%20NVENC-007808?logo=ffmpeg&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?logo=tailwind-css&logoColor=white)
  ![Blackmagic](https://img.shields.io/badge/Hardware-Blackmagic_Design-black)
</div>

---

## 📺 Acerca del Proyecto

**Capturadora Multicanal 2.3** es una plataforma web para la ingesta y codificación en tiempo real de señales SDI profesionales. Diseñada para entornos *broadcast* 24/7, controla de forma independiente cuatro canales DeckLink con aceleración GPU NVENC, segmentación automática de archivos MP4, recuperación ante caídas, reportes automáticos por correo y un panel de administración completo accesible desde el navegador.

Los videos se almacenan en un **disco dedicado de capturas** (Hitachi 1.8 TB, montado en `/home/administrador/Capturas`) separado del disco del sistema operativo (Samsung SSD 238 GB), con monitoreo y alertas independientes para cada unidad.

---

## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🎙️ **Grabación multicanal** | Control asíncrono e independiente de hasta 4 señales DeckLink SDI |
| 🏎️ **NVENC H.264** | Codificación por hardware (preset P4/HQ + VBR), desentrelazado `bwdif`, 29.97 fps |
| 🔐 **RBAC 4 roles** | `admin` · `operator` · `group1` · `group2` — permisos granulares por canal |
| 👁️ **Live preview** | Stream MJPEG en el navegador sin interrumpir la grabación |
| 📊 **Telemetría** | CPU · RAM · GPU · VRAM · Disco SSD + Disco Capturas · Red en tiempo real (psutil + nvidia-smi) |
| 🛡️ **Watchdog** | Daemon que detecta caídas de FFmpeg y relanza el proceso automáticamente |
| 📅 **Scheduler** | Programación de inicio/stop por hora con configuración por canal |
| 🧹 **Limpieza automática** | Monitoreo y limpieza sobre el disco de Capturas; script de retención configurable (N días), limpieza manual desde UI |
| 📈 **Panel estadísticas** | Gráficas Chart.js: almacenamiento, horas grabadas, audit log de accesos |
| 🔒 **Brute-force protection** | Bloqueo temporal de IP tras 5 intentos fallidos (rate limiting) |
| 📧 **Notificaciones por correo** | Alertas SMTP para 7 tipos de eventos con rate-limiting y plantilla HTML branded |
| 📋 **Reportes diarios** | Reporte automático a las 06:00 y 22:00 con logo VTV, métricas (SSD + Capturas), canales y accesos |
| ⚡ **UI sin build step** | Vanilla JS + Tailwind CDN — sin Node.js, sin bundler |

---

## 🛠️ Stack Tecnológico

- **Backend:** FastAPI + Uvicorn (Python 3.12), asyncio nativo, `asyncio.to_thread` para todo I/O de bloqueo
- **Frontend:** HTML5 · Vanilla JS · Tailwind CSS CDN · Chart.js
- **Autenticación:** Token estático por usuario + UUID de sesión + bcrypt
- **Proceso de grabación:** `subprocess.Popen` con FFmpeg, señal `q` a stdin para cierre limpio de segmentos MP4
- **Correo:** `smtplib` + MIME multipart HTML, sin dependencias externas
- **Hardware:** Blackmagic DeckLink Duo + NVIDIA Quadro (NVENC)

---

## 📁 Estructura del Proyecto

```
control-decklink/
├── main.py               # Aplicación FastAPI principal
├── start_server.sh       # Script de arranque
├── requirements.txt      # Dependencias Python
├── README.md
├── .env                  # Credenciales (NO en git)
│
├── static/               # Frontend
│   ├── index.html
│   ├── logo.png
│   └── js/
│       ├── auth.js       # Autenticación, sesión, idle-logout
│       ├── dashboard.js  # UI principal, polling, controles
│       ├── admin.js      # Panel admin: usuarios + notificaciones
│       ├── stats.js      # Modal de estadísticas + Chart.js
│       └── logs.js       # Visor de logs FFmpeg en vivo
│
├── data/                 # Datos de runtime (excluidos del repo)
│   ├── users_db.json     # Usuarios dinámicos
│   ├── access_log.json   # Audit log de accesos
│   ├── email_config.json # Configuración SMTP y notificaciones
│   ├── cleanup_config.json
│   └── duration_cache.json
│
├── logs/                 # Logs de aplicación (excluidos del repo)
│   ├── server.log
│   └── ffmpeg_debug_*.log
│
├── scripts/              # Scripts de shell
│   ├── cleanup.sh        # Limpieza automática de grabaciones antiguas
│   ├── kill_zombie_ffmpeg.sh
│   ├── setup_https.sh
│   └── update_env.sh
│
├── utils/                # Utilidades Python (gestión de contraseñas, tests)
│   ├── hash_env_passwords.py
│   ├── reset_admin_password.py
│   ├── migrate_passwords.py
│   └── test_api.py
│
├── docs/                 # Documentación interna
└── certs/                # Certificados TLS locales (excluidos del repo)
```

---

## 🚀 Instalación y Arranque

### Requisitos previos
1. **Drivers Blackmagic Desktop Video** instalados y tarjeta DeckLink reconocida
2. **FFmpeg** compilado con `--enable-decklink` y `--enable-nvenc`
3. **Python 3.12+** y `pip`
4. **Servidor SMTP** accesible en la red (por defecto `vtvcorreo.vtv.gob.ve:25`)

### Configuración

```bash
# 1. Clonar el repositorio
git clone https://github.com/jiroperof/control-decklink.git
cd control-decklink

# 2. Crear entorno virtual e instalar dependencias
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 3. Crear el archivo .env con las credenciales
cp .env.example .env   # editar con tus valores
# Variables requeridas: ADMIN_USER, ADMIN_PASS (bcrypt), ACCESS_TOKEN,
#                       OPERATOR_USER, OPERATOR_PASS (bcrypt), OPERATOR_TOKEN

# 4. Arrancar el servidor
./start_server.sh
```

> Las contraseñas en `.env` deben estar hasheadas con bcrypt.  
> Usa `python3 utils/hash_env_passwords.py` para generarlas.

### Acceso

| Protocolo | URL |
|-----------|-----|
| HTTP | `http://<IP-DEL-SERVIDOR>:8000` |
| HTTPS (opcional) | `https://<IP-DEL-SERVIDOR>:8000` |

---

## 👥 Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `admin` | Control total: todos los canales, gestión de usuarios, estadísticas, limpieza, notificaciones |
| `operator` | Solo lectura: métricas y estado de canales |
| `group1` | Canal 1 únicamente: iniciar/detener grabación, ver telemetría, preview |
| `group2` | Canal 2 únicamente: igual que group1 |
| `group3` | Canal 3 únicamente: igual que group1 |
| `group4` | Canal 4 únicamente: igual que group1 |

Los usuarios de grupo se crean desde el panel de Administración dentro de la propia web app.

---

## 📧 Sistema de Notificaciones por Correo

Configurable desde **Admin → Notif.** en el panel web. Se guarda en `data/email_config.json`.

### Eventos notificados

| Evento | Descripción |
|--------|-------------|
| ▶ Inicio de grabación | Al iniciar grabación en cualquier canal |
| ⏹ Detención de grabación | Al detener, incluye duración total |
| 🔐 Login exitoso | Acceso válido al sistema |
| ⚠ Login fallido | Intento con credenciales incorrectas |
| 🔄 Auto-reinicio watchdog | FFmpeg relanzado automáticamente |
| 🗑 Guardián de disco | Limpieza automática por espacio |
| 💾 Disco crítico | Uso de disco supera el 90% |

### Reportes diarios automáticos

Se envían **dos veces al día** con información completa del sistema:

| Turno | Hora | Badge |
|-------|------|-------|
| Mañana | 06:00 | 🟡 amarillo |
| Noche  | 22:00 | 🟣 violeta |

Cada reporte incluye: logo VTV · recursos del servidor (CPU/RAM/Disco SSD/Disco Capturas) · cantidad de videos y tamaño de carpeta · estado de los 4 canales · últimos 3 accesos al sistema.

> Para enviar el reporte manualmente: **Admin → Notif. → ✉ Enviar Prueba**

### Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/admin/email-config` | Obtener configuración SMTP (sin contraseña) |
| `POST` | `/api/admin/email-config` | Guardar configuración SMTP y toggles |
| `POST` | `/api/admin/send-report` | Enviar reporte completo manualmente |

---

## ⚙️ Variables de Entorno (`.env`)

```env
ADMIN_USER=admin
ADMIN_PASS=$2b$12$...        # bcrypt hash
ACCESS_TOKEN=token-secreto-admin

OPERATOR_USER=operador
OPERATOR_PASS=$2b$12$...     # bcrypt hash
OPERATOR_TOKEN=token-secreto-operador

AUTO_RESTART=true            # Watchdog auto-relanza FFmpeg si cae
ALLOWED_ORIGINS=http://localhost:8000,http://192.168.1.x:8000

SMTP_PASS=tu-contraseña-smtp # Siempre tiene prioridad sobre email_config.json
CAPTURAS_PATH=/home/administrador/Capturas  # Ruta base del disco de capturas
```

---

## 📝 Changelog

### v2.3 — Mayo 2026
- **Nuevo:** Panel de recursos muestra dos discos independientes: SSD del sistema (/) y disco Hitachi 1.8 TB de Capturas
- **Nuevo:** Botón **LIMPIAR** solo disponible en el disco de Capturas
- **Nuevo:** Tiempo restante predictivo basado en espacio libre del disco de Capturas
- **Nuevo:** Variable de entorno `CAPTURAS_PATH` configurable (default `/home/administrador/Capturas`)
- **Nuevo:** Variable de entorno `SMTP_PASS` — contraseña SMTP fuera del código fuente
- **Mejora:** `disk_cleanup_task`, `disk_guard_task` y reporte diario monitorizan el disco de Capturas
- **Mejora:** Reporte diario incluye barra de uso del disco de Capturas
- **Mejora:** `schedule_checker_task` envía notificaciones por correo al disparar grabaciones programadas
- **Fix:** Race condition al detener preview antes de grabar (espera real hasta 3 s + SIGKILL)
- **Fix:** Watchdog limpia `mgr.config` si `AUTO_RESTART=false` (evitaba config huérfana)
- **Fix:** UI revierte estado optimista si el servidor devuelve error en start/stop
- **Fix:** `system_monitor_task` usa `CAPTURAS_PATH` en vez de path hardcodeado
- **Seguridad:** `SMTP_PASS` del `.env` siempre tiene prioridad sobre el valor guardado en `email_config.json`

### v2.2 — Mayo 2026
- **Nuevo:** Sistema completo de notificaciones por correo (`smtplib`, sin dependencias externas)
- **Nuevo:** 7 tipos de eventos con plantilla HTML branded (dark mode, logo VTV, colores por tipo)
- **Nuevo:** Reportes diarios automáticos a las 06:00 y 22:00 con métricas del sistema
- **Nuevo:** Tab "Notif." en el panel de admin con formulario SMTP, destinatarios y toggles por evento
- **Nuevo:** `POST /api/admin/send-report` para envío manual del reporte
- **Fix:** `Body(...)` en endpoint `POST /api/admin/email-config` (405 Method Not Allowed)
- **Fix:** SMTP sin autenticación (`has_extn("AUTH")`) compatible con servidores relay internos

### v2.1
- Panel de estadísticas con Chart.js
- Scheduler de grabación por hora
- Guardián de disco con limpieza automática
- RBAC expandido a 4 roles

### v2.0
- Reescritura completa en FastAPI async
- Soporte multicanal (hasta 4 DeckLink)
- Live preview MJPEG
- Watchdog de procesos FFmpeg

---

<div align="center">
  <sub>Desarrollado para entornos de transmisión y broadcast SDI continuo · C.A. Venezolana de Televisión · v2.3</sub>
</div>
