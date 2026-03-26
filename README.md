<div align="center">
  <img src="static/logo.png" alt="VTV Logo" width="150" style="margin-right: 20px;"/>
  <h1>VTV - Capturadora Multicanal 2.0</h1>
  <p><strong>Sistema Avanzado de Grabación de Video SDI con Blackmagic DeckLink</strong></p>
</div>

---

## 📺 Acerca del Proyecto

**Capturadora Multicanal 2.0** es una robusta plataforma web diseñada para la ingesta y codificación en tiempo real de señales de video SDI profesionales. Utilizando hardware **Blackmagic Design (DeckLink Duo)** y aceleración por GPU (**NVIDIA NVENC**), el sistema permite controlar de manera independiente múltiples canales de grabación.

Esta herramienta está pensada para entornos *broadcast* de alta disponibilidad (24/7), garantizando una latencia mínima, protección frente a caídas y segmentación automática de archivos para flujos de trabajo en televisión.

---

## ✨ Características Principales

*   **🎙️ Grabación Multicanal Independiente:** Control asíncrono sobre 2 o más señales DeckLink SDI.
*   **🏎️ Codificación NVENC por Hardware:** Transcodificación `H.264` ultra eficiente (presets P4/HQ), que descarga la CPU enviando el trabajo a la tarjeta de video (ej. Nvidia Quadro).
*   **🔐 Control de Acceso Multi-Usuario (RBAC):**
    *   **Administradores:** Control total sobre todos los canales y gestión de usuarios.
    *   **Operador (Master):** Visualización global del estado de todos los canales (solo lectura).
    *   **Grupos Asignados (Canal 1 / Canal 2):** Cuentas limitadas estructuralmente. Solo pueden interactuar, ver telemetría y visualizar vistas previas del hardware que tienen específicamente asignado.
*   **👁️ Vista Previa en Vivo (Live MJPEG):** Streaming en el navegador directamente desde la capturadora, sin interrumpir la grabación en curso.
*   **📊 Telemetría de Sistemas en Tiempo Real:** Interfaz viva con lecturas de uso de CPU, VRAM, GPU, Discos y Red mediante *psutil*.
*   **🛡️ Watchdog & Autorecovery:** Sistema de demonios en segundo plano que monitorea la salud de `FFmpeg` y resucita procesos huérfanos si la capturadora sufre un microcorte.
*   **🧹 Rotación de Almacenamiento:** Módulo automático de limpieza que se encarga de eliminar ficheros `.mp4` obsoletos basándose en políticas de retención.
*   **📈 Dashboard de Estadísticas:** Panel analítico reservado para el Administrador equipado con gráficas `Chart.js` para monitorear la distribución de almacenamiento, horas grabadas y el registro de accesos en tiempo real (Audit Log con rastreo de intentos fallidos).

---

## 🛠️ Stack Tecnológico

![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white) 
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-109989?logo=fastapi&logoColor=white) 
![FFmpeg](https://img.shields.io/badge/FFmpeg-DeckLink%20%2B%20NVENC-007808?logo=ffmpeg&logoColor=white) 
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.0-38B2AC?logo=tailwind-css&logoColor=white)
![Blackmagic](https://img.shields.io/badge/Hardware-Blackmagic_Design-black)

### Estructura
*   **Backend:** FastAPI (Python), sirviendo como orquestador asíncrono para subprocesos de FFmpeg y servidor de la base de datos de usuarios dinámica (`users_db.json`).
*   **Frontend:** Vanilla JS (`index.html`) + Tailwind CSS, asegurando 0 dependencias de *build*, máxima ligereza y manipulación del DOM nativa.

---

## 🚀 Uso y Despliegue

La aplicación se sirve de forma segura en una red local bajo un daemon de `systemd` (`vtv-decklink.service`). 

1. **Instalación de Dependencias OS:** Es mandatorio instalar los **Desktop Video Drivers** de Blackmagic y un cliente `FFmpeg` compilado expresamente con soporte `--enable-decklink` y `--enable-nvenc`.
2. **Entorno de Python:** El ambiente virtual `.venv` provee `uvicorn`, `fastapi`, `psutil`, etc.
3. **Arranque:** `sudo systemctl start vtv-decklink`

### Inicio de Sesión
El sistema cuenta con prevención contra fuerza bruta (bloqueo automático temporal a IPs con 5 intentos fallidos). Los usuarios base (`Administrador` y `Operador` global) se inyectan a través del archivo de configuración `.env`. Las cuentas operativas limitadas por canal se administran visualmente mediante el botón de *"Administración"* dentro de la misma web app.

---
<div align="center">
  <sub>Desarrollado para entornos de transmisión y broadcast SDI continuo.</sub>
</div>
