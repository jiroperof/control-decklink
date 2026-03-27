<div align="center">
  <img src="static/logo.png" alt="VTV Logo" width="140"/>
  <h1>VTV — Capturadora Multicanal 2.1</h1>
  <p><strong>Sistema de grabación SDI en tiempo real con Blackmagic DeckLink + NVIDIA NVENC</strong></p>

  ![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)
  ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-109989?logo=fastapi&logoColor=white)
  ![FFmpeg](https://img.shields.io/badge/FFmpeg-DeckLink%20%2B%20NVENC-007808?logo=ffmpeg&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?logo=tailwind-css&logoColor=white)
  ![Blackmagic](https://img.shields.io/badge/Hardware-Blackmagic_Design-black)
</div>

---

## 📺 Acerca del Proyecto

**Capturadora Multicanal 2.1** es una plataforma web para la ingesta y codificación en tiempo real de señales SDI profesionales. Diseñada para entornos *broadcast* 24/7, controla de forma independiente dos canales DeckLink con aceleración GPU NVENC, segmentación automática de archivos MP4, recuperación ante caídas y un panel de administración completo accesible desde el navegador.

---

## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| 🎙️ **Grabación dual** | Control asíncrono e independiente de 2 señales DeckLink SDI |
| 🏎️ **NVENC H.264** | Codificación por hardware (preset P4/HQ + VBR), desentrelazado `bwdif`, 29.97 fps |
| 🔐 **RBAC 4 roles** | `admin` · `operator` · `group1` · `group2` — permisos granulares por canal |
| 👁️ **Live preview** | Stream MJPEG en el navegador sin interrumpir la grabación |
| 📊 **Telemetría** | CPU · RAM · GPU · VRAM · Disco · Red en tiempo real (psutil + nvidia-smi) |
| 🛡️ **Watchdog** | Daemon que detecta caídas de FFmpeg y relanza el proceso automáticamente |
| 📅 **Scheduler** | Programación de inicio/stop por hora con configuración por canal |
| 🧹 **Limpieza automática** | Script de retención configurable (N días), con opción de limpieza manual desde la UI |
| 📈 **Panel estadísticas** | Gráficas Chart.js: almacenamiento, horas grabadas, audit log de accesos |
| 🔒 **Brute-force protection** | Bloqueo temporal de IP tras 5 intentos fallidos (rate limiting) |
| ⚡ **UI sin build step** | Vanilla JS + Tailwind CDN — sin Node.js, sin bundler |

---

## 🛠️ Stack Tecnológico

- **Backend:** FastAPI + Uvicorn (Python 3.12), asyncio nativo, `asyncio.to_thread` para todo I/O de bloqueo
- **Frontend:** HTML5 · Vanilla JS · Tailwind CSS CDN · Chart.js
- **Autenticación:** Token estático por usuario + UUID de sesión + bcrypt
- **Proceso de grabación:** `subprocess.Popen` con FFmpeg, señal `q` a stdin para cierre limpio de segmentos MP4
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
│   └── js/
│       ├── auth.js       # Autenticación, sesión, idle-logout
│       ├── dashboard.js  # UI principal, polling, controles
│       ├── admin.js      # Panel de administración de usuarios
│       ├── stats.js      # Modal de estadísticas + Chart.js
│       └── logs.js       # Visor de logs FFmpeg en vivo
│
├── data/                 # Datos de runtime (excluidos del repo)
│   ├── users_db.json     # Usuarios dinámicos
│   ├── access_log.json   # Audit log de accesos
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
| `admin` | Control total: todos los canales, gestión de usuarios, estadísticas, limpieza |
| `operator` | Solo lectura: métricas y estado de canales |
| `group1` | Canal 1 únicamente: iniciar/detener grabación, ver telemetría, preview |
| `group2` | Canal 2 únicamente: igual que group1 |

Los usuarios `group1`/`group2` se crean desde el panel de Administración dentro de la propia web app.

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
```

---

<div align="center">
  <sub>Desarrollado para entornos de transmisión y broadcast SDI continuo · v2.1</sub>
</div>
