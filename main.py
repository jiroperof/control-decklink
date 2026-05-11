import subprocess, os, re, signal, asyncio, logging, psutil, time, json, shlex, uuid, secrets, smtplib, socket, base64 as _b64
from logging.handlers import RotatingFileHandler
from datetime import datetime, date, timedelta
from datetime import time as dtime
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request, Query, Header, Path as FastAPIPath, Body
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, field_validator
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import bcrypt

# ── Logging ───────────────────────────────────────────────────────────────────
# Write logs to both stdout and a rotating file in logs/.
_LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s — %(message)s"
_LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DATA_DIR = os.path.join(_BASE_DIR, "data")
_LOGS_DIR = os.path.join(_BASE_DIR, "logs")
os.makedirs(_DATA_DIR, exist_ok=True)
os.makedirs(_LOGS_DIR, exist_ok=True)

def _setup_logging():
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    max_mb = int(os.environ.get("LOG_MAX_MB", "10"))
    backups = int(os.environ.get("LOG_BACKUPS", "10"))
    max_bytes = max(1, max_mb) * 1024 * 1024
    backups = min(100, max(1, backups))

    root = logging.getLogger()
    root.setLevel(level)

    formatter = logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATEFMT)

    # Avoid duplicating handlers on reload.
    if not any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        fh = RotatingFileHandler(
            os.path.join(_LOGS_DIR, "server.log"),
            maxBytes=max_bytes,
            backupCount=backups,
            encoding="utf-8",
        )
        fh.setFormatter(formatter)
        fh.setLevel(level)
        root.addHandler(fh)

    if not any(isinstance(h, logging.StreamHandler) and getattr(h, "stream", None) is not None for h in root.handlers):
        sh = logging.StreamHandler()
        sh.setFormatter(formatter)
        sh.setLevel(level)
        root.addHandler(sh)

_setup_logging()
logger = logging.getLogger("vtv")

CPU_MODEL = "Intel Xeon CPU E5-2620 v4"
GPU_MODEL = "Nvidia Quadro M2000"

# --- Caches & Network Tracking ---
last_net_time = time.time()
last_net_bytes = 0
try:
    last_net_bytes = psutil.net_io_counters(pernic=True).get('eno1', psutil.net_io_counters()).bytes_sent + \
                     psutil.net_io_counters(pernic=True).get('eno1', psutil.net_io_counters()).bytes_recv
except Exception:
    pass

cached_metrics = {
    "cpu": 0, "ram": 0, "ram_total": 0, "disk": 0, "disk_total": 0,
    "disk2": 0, "disk2_total": 0, "disk2_free": 0,
    "gpu": 0, "vram": 0, "vram_total": 0, "net": 0, "net_mbps": 0, "server_ip": "",
    "cpu_name": CPU_MODEL, "gpu_name": GPU_MODEL
}
cached_processes = {"processes": [], "count": 0}

# ── Duration Cache con evicción LRU ───────────────────────────────────────────
CACHE_FILE = os.path.join(_DATA_DIR, "duration_cache.json")
MAX_CACHE_ENTRIES = 5000  # Límite de entradas en cache
DURATION_CACHE: dict = {}  # {path: [mtime, duration, last_access_time]}
try:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            loaded = json.load(f)
            # Migrar formato antiguo [mtime, dur] a nuevo [mtime, dur, access_time]
            for k, v in loaded.items():
                if len(v) == 2:
                    DURATION_CACHE[k] = [v[0], v[1], time.time()]
                else:
                    DURATION_CACHE[k] = v
except Exception as e:
    logger.error(f"Error cargando duration_cache: {e}")

def _evict_cache_if_needed():
    """Evicta entradas LRU si el cache excede MAX_CACHE_ENTRIES"""
    if len(DURATION_CACHE) > MAX_CACHE_ENTRIES:
        # Ordenar por último acceso y eliminar las más antiguas
        sorted_entries = sorted(DURATION_CACHE.items(), key=lambda x: x[1][2] if len(x[1]) > 2 else 0)
        to_remove = len(DURATION_CACHE) - MAX_CACHE_ENTRIES
        for path, _ in sorted_entries[:to_remove]:
            del DURATION_CACHE[path]
        logger.info(f"Cache eviction: eliminadas {to_remove} entradas antiguas")

# ── Variables de entorno ──────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv; load_dotenv()
    logger.info("Archivo .env cargado")
except ImportError:
    logger.warning("python-dotenv no instalado")

ADMIN_USER     = os.environ.get("ADMIN_USER")
ADMIN_PASS     = os.environ.get("ADMIN_PASS")
ACCESS_TOKEN   = os.environ.get("ACCESS_TOKEN")
OPERATOR_USER  = os.environ.get("OPERATOR_USER")
OPERATOR_PASS  = os.environ.get("OPERATOR_PASS")
OPERATOR_TOKEN = os.environ.get("OPERATOR_TOKEN")

_required_env = {"ADMIN_USER": ADMIN_USER, "ADMIN_PASS": ADMIN_PASS, "ACCESS_TOKEN": ACCESS_TOKEN,
                 "OPERATOR_USER": OPERATOR_USER, "OPERATOR_PASS": OPERATOR_PASS, "OPERATOR_TOKEN": OPERATOR_TOKEN}
_missing = [k for k, v in _required_env.items() if not v]
if _missing:
    raise RuntimeError(f"Variables de entorno requeridas no definidas en .env: {', '.join(_missing)}")
AUTO_RESTART   = os.environ.get("AUTO_RESTART",   "false").lower() == "true"
ALLOWED_ORIGINS = [o.strip() for o in
    os.environ.get("ALLOWED_ORIGINS","http://localhost:8000,http://127.0.0.1:8000").split(",") if o.strip()]
SMTP_PASS_ENV  = os.environ.get("SMTP_PASS", "")
CAPTURAS_PATH  = os.environ.get("CAPTURAS_PATH", "/home/administrador/Capturas")

# ── Usuarios y roles ──────────────────────────────────────────────────────────
USERS = {
    ADMIN_USER:   {"password": ADMIN_PASS,   "token": ACCESS_TOKEN,   "role": "admin"},
    OPERATOR_USER:{"password": OPERATOR_PASS,"token": OPERATOR_TOKEN, "role": "operator"},
}

# ── Base de datos de usuarios dinámicos ───────────────────────────────────────
USERS_DB_FILE = os.path.join(_DATA_DIR, "users_db.json")

DEFAULT_USERS_DB = {
    "groups": {
        "1": {"name": "Capturadora2.0I"},
        "2": {"name": "Capturadora2.0II"},
        "3": {"name": "Capturadora2.0III"},
        "4": {"name": "Capturadora2.0IV"}
    },
    "users": {}
}

def _load_users_db() -> dict:
    try:
        if os.path.exists(USERS_DB_FILE):
            with open(USERS_DB_FILE, "r") as f:
                data = json.load(f)
                # Ensure structure integrity
                if "groups" not in data:
                    data["groups"] = DEFAULT_USERS_DB["groups"]
                if "users" not in data:
                    data["users"] = {}
                return data
    except Exception as e:
        logger.error(f"Error cargando users_db: {e}")
    return {"groups": dict(DEFAULT_USERS_DB["groups"]), "users": {}}

async def _save_users_db():
    async with users_db_lock:
        try:
            def _write_users():
                with open(USERS_DB_FILE, "w") as f:
                    json.dump(USERS_DB, f, indent=2)
            await asyncio.to_thread(_write_users)
        except Exception as e:
            logger.error(f"Error guardando users_db: {e}")

USERS_DB = _load_users_db()

ACCESS_LOG_FILE = os.path.join(_DATA_DIR, "access_log.json")
def _load_access_log() -> list:
    try:
        if os.path.exists(ACCESS_LOG_FILE):
            with open(ACCESS_LOG_FILE, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error cargando access_log: {e}")
    return []

async def _save_access_log():
    async with access_log_lock:
        try:
            # Truncar en memoria también para prevenir memory leak
            global ACCESS_LOG
            ACCESS_LOG = ACCESS_LOG[-2000:]
            def _write_log():
                with open(ACCESS_LOG_FILE, "w") as f:
                    json.dump(ACCESS_LOG, f, indent=2)
            await asyncio.to_thread(_write_log)
        except Exception as e:
            logger.error(f"Error guardando access_log: {e}")

ACCESS_LOG = _load_access_log()

def _rebuild_dynamic_maps():
    """Reconstruye TOKEN_TO_ROLE, TOKEN_TO_USER y ACTIVE_SESSIONS con usuarios dinámicos."""
    global TOKEN_TO_ROLE, TOKEN_TO_USER
    # Base estático
    TOKEN_TO_ROLE = {u["token"]: u["role"] for u in USERS.values()}
    TOKEN_TO_USER = {u["token"]: name for name, u in USERS.items()}
    # Dinámico
    for uname, udata in USERS_DB["users"].items():
        TOKEN_TO_ROLE[udata["token"]] = udata["role"]
        TOKEN_TO_USER[udata["token"]] = uname
        if uname not in ACTIVE_SESSIONS:
            ACTIVE_SESSIONS[uname] = []

TOKEN_TO_ROLE = {u["token"]: u["role"] for u in USERS.values()}

# Sessions for single-login per user
ACTIVE_SESSIONS = {
    ADMIN_USER: [],
    OPERATOR_USER: []
}
TOKEN_TO_USER = {u["token"]: name for name, u in USERS.items()}

# Inicializar con usuarios dinámicos existentes
_rebuild_dynamic_maps()

# Brute force protection
LOGIN_ATTEMPTS = {}

# ── Concurrency Locks ─────────────────────────────────────────────────────────
access_log_lock = asyncio.Lock()
users_db_lock = asyncio.Lock()
sessions_lock = asyncio.Lock()

# ── Password Security ─────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash"""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        logger.error(f"Error verificando password: {e}")
        return False

# ── Modelos ───────────────────────────────────────────────────────────────────
class RecordConfig(BaseModel):
    bitrate: str
    segment_minutes: int
    dest_path: str

    @field_validator("bitrate")
    @classmethod
    def validate_bitrate(cls, v: str) -> str:
        v = v.strip().upper()
        if not v.endswith("M"): raise ValueError("Bitrate debe terminar en 'M'")
        try: int(v[:-1])
        except: raise ValueError("Bitrate inválido")
        return v

    @field_validator("segment_minutes")
    @classmethod
    def validate_minutes(cls, v: int) -> int:
        if not (1 <= v <= 120): raise ValueError("Debe ser 1–120")
        return v

class LoginRequest(BaseModel):
    username: str
    password: str
    force: bool = False

class ScheduleRequest(BaseModel):
    start_time: Optional[str] = None
    stop_time:  Optional[str] = None
    config:     Optional[RecordConfig] = None

class CreateUserRequest(BaseModel):
    username: str
    password: str
    group: str  # "1", "2", "3" or "4"

class GroupNamesRequest(BaseModel):
    group1_name: str
    group2_name: str
    group3_name: str
    group4_name: str

# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_token(x_token: str = Header(None), token: Optional[str] = Query(None)):
    """Valida el token desde el header X-Token o, como fallback, desde query param ?token=.
    El fallback es necesario para enlaces <a href> de descarga que no pueden enviar headers."""
    effective_token = x_token or token
    if not effective_token or effective_token not in TOKEN_TO_ROLE:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return effective_token

def require_admin(token: str = Depends(verify_token)):
    if TOKEN_TO_ROLE.get(token) != "admin":
        raise HTTPException(status_code=403, detail="Permiso denegado. Se requiere cuenta de Administrador.")
    return token

def require_channel_access(source_id: str, token: str):
    """Returns True if the token has access to the given source_id channel."""
    role = TOKEN_TO_ROLE.get(token, "")
    if role == "admin":
        return True
    if role == "group1" and source_id == "1":
        return True
    if role == "group2" and source_id == "2":
        return True
    if role == "group3" and source_id == "3":
        return True
    if role == "group4" and source_id == "4":
        return True
    return False

# ── RecordingManager Multicanal ───────────────────────────────────────────────
class RecordingManager:
    def __init__(self, source_id: str, input_name: str):
        self.source_id = source_id
        self.input_name = input_name
        self.log_file = os.path.join(_LOGS_DIR, f"ffmpeg_debug_{source_id}.log")
        self.process: Optional[subprocess.Popen] = None
        self.preview_process: Optional[asyncio.subprocess.Process] = None
        self.config:  Optional[dict] = None
        self.started_at: Optional[float] = None
        self.auto_restarted: bool = False
        self.scheduled_start: Optional[datetime] = None
        self.scheduled_stop:  Optional[datetime] = None
        self.scheduled_config: Optional[RecordConfig] = None

    def is_recording(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def _rotate_log(self):
        max_size = 50 * 1024 * 1024 # 50 MB
        if os.path.exists(self.log_file) and os.path.getsize(self.log_file) > max_size:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            rotated = os.path.join(_LOGS_DIR, f"ffmpeg_debug_{self.source_id}_{ts}.log")
            os.rename(self.log_file, rotated)
            # Retención: mantener solo los últimos N logs rotados por canal
            try:
                keep = int(os.environ.get("FFMPEG_LOG_ROTATED_KEEP", "10"))
                keep = min(200, max(1, keep))
            except Exception:
                keep = 10
            try:
                pattern = os.path.join(_LOGS_DIR, f"ffmpeg_debug_{self.source_id}_*.log")
                rotated_logs = sorted(
                    [p for p in Path(_LOGS_DIR).glob(f"ffmpeg_debug_{self.source_id}_*.log")],
                    key=lambda p: p.stat().st_mtime,
                    reverse=True,
                )
                for old in rotated_logs[keep:]:
                    try:
                        old.unlink()
                    except Exception:
                        pass
            except Exception:
                pass

    def _stop_sync(self, graceful: bool = True):
        """Detiene ffmpeg de forma ordenada:
        1. Envía 'q' a stdin → ffmpeg cierra el segmento MP4 limpiamente
        2. SIGTERM al grupo de procesos → fallback si stdin no responde
        3. Espera hasta 15 s → solo entonces usa SIGKILL como último recurso
        """
        proc = self.process
        if proc is None:
            return
        try:
            if graceful and proc.poll() is None:
                try:
                    proc.stdin.write("q\n")
                    proc.stdin.flush()
                    logger.info(f"[CH{self.source_id}] Enviando 'q' a ffmpeg (PID {proc.pid}) para corte limpio…")
                except Exception as e:
                    logger.debug(f"[CH{self.source_id}] No se pudo enviar 'q' a stdin (probablemente cerrado): {e}")
                # SIGTERM al grupo de procesos como fallback
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception as e:
                    logger.debug(f"[CH{self.source_id}] No se pudo enviar SIGTERM al grupo: {e}")
                # Esperar hasta 15 s que ffmpeg finalice el segmento
                for _ in range(30):
                    if proc.poll() is not None:
                        break
                    time.sleep(0.5)
            # Si sigue vivo → SIGKILL inevitable
            if proc.poll() is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                    proc.wait(timeout=5)
                except Exception as e:
                    logger.warning(f"[CH{self.source_id}] Error enviando SIGKILL: {e}")
            logger.info(f"[CH{self.source_id}] FFmpeg detenido (PID {proc.pid})")
        except Exception as e:
            logger.warning(f"[CH{self.source_id}] Error al detener FFmpeg: {e}")
        finally:
            self.process = None
            self.started_at = None

    async def stop_and_clean(self):
        await asyncio.to_thread(self._stop_sync, True)
        self.config = None
        self.auto_restarted = False
        self.scheduled_start = self.scheduled_stop = self.scheduled_config = None

    def _start_sync(self, cfg: RecordConfig) -> tuple[bool, str]:
        # Detener vista previa limpiamente antes de grabar
        if self.preview_process:
            try:
                pid = getattr(self.preview_process, 'pid', None)
                self.preview_process.terminate()
                # Esperar hasta 3s a que el proceso asyncio termine (desde hilo síncrono)
                deadline = time.time() + 3.0
                while time.time() < deadline:
                    if self.preview_process.returncode is not None:
                        break
                    time.sleep(0.1)
                if self.preview_process.returncode is None:
                    try:
                        self.preview_process.kill()
                    except Exception:
                        pass
                logger.info(f"[CH{self.source_id}] Preview detenido (PID {pid}) antes de grabar")
            except Exception as e:
                logger.warning(f"[CH{self.source_id}] Error deteniendo preview: {e}")
            self.preview_process = None
            time.sleep(0.5)  # breve pausa para liberar el dispositivo

        # Detener grabación anterior si la hubiera (sin corte limpio en este caso)
        self._stop_sync(graceful=False)
        time.sleep(0.5)
        self._rotate_log()

        # Crear subcarpeta de hoy con permisos correctos
        today_str = datetime.now().strftime("%d-%m-%Y")
        daily_dest_path = os.path.join(cfg.dest_path, today_str)
        try:
            os.makedirs(daily_dest_path, exist_ok=True)
            os.chmod(daily_dest_path, 0o775)
        except PermissionError:
            subprocess.call(["sudo", "chown", "-R",
                             f"{os.getenv('USER', 'administrador')}:", cfg.dest_path])
            os.makedirs(daily_dest_path, exist_ok=True)

        bnum = int(cfg.bitrate[:-1])
        filename_pattern = f"{daily_dest_path}/VTV_MASTER_CH{self.source_id}_%Y%m%d_%H%M%S.mp4"

        cmd = [
            "ffmpeg", "-y",
            "-thread_queue_size", "8192",
            "-f", "decklink", "-duplex_mode", "half",
            "-video_input", "sdi", "-format_code", "Hi59",  # 1080i 29.97fps SDI digital
            "-i", self.input_name,
            # Deinterlace (1080i → 1080p) + colorspace seguro
            "-vf", "bwdif=mode=send_field:parity=auto,format=yuv420p",
            "-af", "aresample=async=1000",
            # Codec de video: NVENC sin forzar level para evitar fallos (auto-level)
            "-c:v", "h264_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr",
            "-b:v", cfg.bitrate, "-maxrate:v", f"{int(bnum * 1.5)}M", "-bufsize:v", "120M",
            "-r", "30000/1001",        # 29.97 fps
            # Audio AAC-LC limpio
            "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
            # Segmentación con faststart para reproducción rápida
            "-f", "segment",
            "-segment_time", str(cfg.segment_minutes * 60),
            "-segment_format", "mp4",
            "-segment_format_options", "movflags=+faststart",
            "-reset_timestamps", "1",   # evita timestamps corruptos entre segmentos
            "-strftime", "1",
            filename_pattern
        ]

        logger.info(f"[CH{self.source_id}] INICIANDO: {' '.join(shlex.quote(c) for c in cmd)}")
        with open(self.log_file, "a") as log:
            log.write(f"\n{'='*60}\n[{datetime.now().isoformat()}] INICIO CH{self.source_id}\n{'='*60}\n")
            self.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=log,
                stderr=log,
                preexec_fn=os.setsid,
                universal_newlines=True,
                bufsize=1,  # line-buffered → flush inmediato al log
            )

        # Verificación de arranque (esperar hasta 5 s)
        for _ in range(10):
            time.sleep(0.5)
            if self.process.poll() is not None:
                self.process = None
                return False, f"Error al iniciar CH{self.source_id}. Revisa {self.log_file}"

        self.started_at = time.time()
        return True, f"Grabación CH{self.source_id} iniciada"

    async def start(self, cfg: RecordConfig) -> tuple[bool, str]:
        ok, msg = await asyncio.to_thread(self._start_sync, cfg)
        if ok:
            self.config = cfg.model_dump()
        return ok, msg

# Registramos los cuatro canales
managers = {
    "1": RecordingManager("1", "DeckLink Duo (1)"),
    "2": RecordingManager("2", "DeckLink Duo (2)"),
    "3": RecordingManager("3", "DeckLink Duo (3)"),
    "4": RecordingManager("4", "DeckLink Duo (4)")
}

def get_mgr(source_id: str) -> RecordingManager:
    if source_id not in managers:
        raise HTTPException(status_code=404, detail="Canal no encontrado (usa 1, 2, 3 o 4)")
    return managers[source_id]


# ── GPU / Procesos ────────────────────────────────────────────────────────────
def _gpu_sync() -> dict:
    try:
        raw = subprocess.check_output(
            ["nvidia-smi","--query-gpu=utilization.gpu,memory.used,memory.total",
             "--format=csv,noheader,nounits"], encoding="utf-8", timeout=3
        ).strip().split(", ")
        return {
            "load": int(raw[0]),
            "vram": round(int(raw[1])/int(raw[2])*100, 1),
            "total_gb": round(int(raw[2])/1024, 1)
        }
    except Exception:
        return {"load": 0, "vram": 0, "total_gb": 0}

WATCHED_KEYWORDS = {"ffmpeg", "python", "python3", "nvenc"}
def _get_processes_sync() -> list:
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_info']):
        try:
            name = (p.info['name'] or '').lower()
            if any(kw in name for kw in WATCHED_KEYWORDS):
                mb = round(p.info['memory_info'].rss / 1024 / 1024, 1) if p.info['memory_info'] else 0
                procs.append({"pid": p.info['pid'], "name": p.info['name'], "status": p.info['status'], "cpu": round(p.info['cpu_percent'] or 0, 1), "mem_mb": mb})
        except Exception:
            pass
    return sorted(procs, key=lambda x: x['name'].lower())

# ── Background tasks ──────────────────────────────────────────────────────────
async def watchdog_task():
    while True:
        await asyncio.sleep(5)
        for ch, mgr in managers.items():
            if mgr.process is not None and mgr.process.poll() is not None:
                logger.warning(f"[CH{ch}] FFmpeg murió inesperadamente")
                old_cfg = mgr.config
                mgr.process = None; mgr.started_at = None
                if not AUTO_RESTART:
                    mgr.config = None  # limpiar config huérfana si no hay auto-restart
                if AUTO_RESTART and old_cfg:
                    try:
                        ok, msg = await mgr.start(RecordConfig(**old_cfg))
                        mgr.auto_restarted = ok
                        logger.info(f"[CH{ch}] Auto-reinicio: {'OK' if ok else 'FALLO'} — {msg}")
                        cfg_e = await asyncio.to_thread(_load_email_config_sync)
                        if cfg_e.get("notify_watchdog"):
                            asyncio.create_task(send_email(
                                "watchdog", f"Canal {ch} — Proceso reiniciado automáticamente",
                                [f"Canal: DeckLink Duo ({ch})",
                                 f"FFmpeg terminó inesperadamente y fue reiniciado.",
                                 f"Estado: {'✅ Reinicio exitoso' if ok else '❌ Reinicio fallido'}",
                                 f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"],
                                cooldown_key=f"watchdog_{ch}"
                            ))
                    except Exception as e:
                        logger.error(f"[CH{ch}] Error en auto-reinicio: {e}")

async def schedule_checker_task():
    while True:
        await asyncio.sleep(10)  # Granularidad de 10s para mayor precisión en horarios programados
        now = datetime.now()
        for ch, mgr in managers.items():
            if mgr.scheduled_start and not mgr.is_recording() and now >= mgr.scheduled_start:
                cfg = mgr.scheduled_config; mgr.scheduled_start = None
                if cfg:
                    ok, msg = await mgr.start(cfg)
                    logger.info(f"[CH{ch}] Grabación programada {'iniciada' if ok else 'FALLIDA'}: {msg}")
                    cfg_e = await asyncio.to_thread(_load_email_config_sync)
                    if cfg_e.get("notify_recording_start"):
                        asyncio.create_task(send_email(
                            "start", f"Canal {ch} — Grabación programada iniciada",
                            [f"Canal: DeckLink Duo ({ch})", "Inicio: Programado automáticamente",
                             f"Estado: {'✅ Iniciada' if ok else '❌ Falló'}",
                             f"Bitrate: {cfg.bitrate}", f"Segmentos: {cfg.segment_minutes} min",
                             f"Hora: {now.strftime('%d/%m/%Y %H:%M:%S')}"],
                            cooldown_key=f"start_{ch}"
                        ))
            if mgr.scheduled_stop and mgr.is_recording() and now >= mgr.scheduled_stop:
                mgr.scheduled_stop = None
                await mgr.stop_and_clean()
                logger.info(f"[CH{ch}] Grabación detenida por programación")
                cfg_e = await asyncio.to_thread(_load_email_config_sync)
                if cfg_e.get("notify_recording_stop"):
                    asyncio.create_task(send_email(
                        "stop", f"Canal {ch} — Grabación programada detenida",
                        [f"Canal: DeckLink Duo ({ch})", "Parada: Programada automáticamente",
                         f"Hora: {now.strftime('%d/%m/%Y %H:%M:%S')}"],
                        cooldown_key=f"stop_{ch}"
                    ))

async def system_monitor_task():
    global last_net_time, last_net_bytes, cached_metrics, cached_processes
    while True:
        try:
            # Net calc
            now = time.time()
            dt = now - last_net_time
            counters = psutil.net_io_counters(pernic=True).get('eno1')
            current_bytes = counters.bytes_sent + counters.bytes_recv if counters else last_net_bytes
            mbps = 0
            if dt > 0:
                bytes_diff = current_bytes - last_net_bytes
                if bytes_diff < 0: bytes_diff = 0 # Handle wrap around/restart
                mbps = (bytes_diff * 8) / (dt * 1000000)
            last_net_time = now
            last_net_bytes = current_bytes
            
            # Others
            gpu = await asyncio.to_thread(_gpu_sync)
            mem = psutil.virtual_memory()
            dsk = psutil.disk_usage("/")
            cpu_val = psutil.cpu_percent(interval=None)
            try:
                dsk2 = psutil.disk_usage(CAPTURAS_PATH)
                disk2_pct   = round(dsk2.percent, 1)
                disk2_total = round(dsk2.total / (1024**3), 1)
                disk2_free  = round(dsk2.free  / (1024**3), 1)
            except Exception:
                disk2_pct = disk2_total = disk2_free = 0

            # IP de la interfaz eno1
            try:
                addrs = psutil.net_if_addrs().get('eno1', [])
                server_ip = next((a.address for a in addrs if a.family == socket.AF_INET), "")
            except Exception:
                server_ip = cached_metrics.get("server_ip", "")

            cached_metrics.update({
                "cpu": cpu_val, 
                "ram": mem.percent, "ram_total": round(mem.total / (1024**3), 1),
                "disk": dsk.percent, "disk_total": round(dsk.total / (1024**3), 1),
                "disk2": disk2_pct, "disk2_total": disk2_total, "disk2_free": disk2_free,
                "gpu": gpu["load"], "vram": gpu["vram"], "vram_total": gpu["total_gb"],
                "net": min(100, round((mbps/1000)*100, 1)), "net_mbps": round(mbps, 1),
                "server_ip": server_ip
            })

            # Processes
            procs = await asyncio.to_thread(_get_processes_sync)
            cached_processes["processes"] = procs
            cached_processes["count"] = len(procs)

        except Exception as e:
            logger.error(f"Error en monitor task: {e}")

        await asyncio.sleep(2)

async def disk_cleanup_task():
    """Tarea en segundo plano para verificar espacio en disco de Capturas y limpiar si es necesario (cada 2 minutos)"""
    logger.info("[DISK-CLEANUP] Iniciando tarea de monitoreo de espacio en disco.")
    while True:
        try:
            cfg = await asyncio.to_thread(_load_cleanup_config_sync)
            trigger = int((cfg.get("disk_guard") or {}).get("trigger_percent", 90))
            trigger = min(99, max(1, trigger))

            try:
                dsk = psutil.disk_usage(CAPTURAS_PATH)
            except Exception:
                dsk = psutil.disk_usage("/")
            if dsk.percent >= trigger:
                script_path = os.path.join(_BASE_DIR, "scripts", "cleanup.sh")
                proc = await asyncio.create_subprocess_exec(
                    "sudo", script_path, "--auto-disk",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
                stdout, stderr = await proc.communicate()
                output = stdout.decode()
                if "ALERTA" in output:
                    logger.warning(f"[DISK-CLEANUP] Limpieza automática ejecutada:\n{output}")
                    cfg_e = await asyncio.to_thread(_load_email_config_sync)
                    if cfg_e.get("notify_disk_guard"):
                        asyncio.create_task(send_email(
                            "disk_guard", "Limpieza automática de disco ejecutada",
                            ["El disco de Capturas superó el umbral configurado y se ejecutó limpieza automática.",
                             f"Disco: {CAPTURAS_PATH}",
                             f"Uso actual: {dsk.percent:.1f}%",
                             f"Libre: {dsk.free//(1024**3)} GB",
                             f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"],
                            cooldown_key="disk_cleanup"
                        ))
                elif proc.returncode != 0:
                    logger.error(f"[DISK-CLEANUP] Error ejecutando script: {stderr.decode()}")
        except Exception as e:
            logger.error(f"[DISK-CLEANUP] Error en tarea de fondo: {e}")

        await asyncio.sleep(120)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Limpiar procesos ffmpeg huérfanos del Decklink al arrancar
    try:
        for p in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                name = (p.info.get('name') or '').lower()
                cmdline = ' '.join(p.info.get('cmdline') or [])
                if 'ffmpeg' in name and 'decklink' in cmdline.lower():
                    logger.warning(f"[STARTUP] Matando ffmpeg huérfano PID {p.info['pid']}: {cmdline[:80]}...")
                    p.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception as e:
        logger.error(f"[STARTUP] Error limpiando procesos: {e}")

    asyncio.create_task(watchdog_task())
    asyncio.create_task(schedule_checker_task())
    asyncio.create_task(system_monitor_task())
    asyncio.create_task(disk_cleanup_task())
    asyncio.create_task(disk_guard_task())
    asyncio.create_task(daily_report_task())
    yield
    for mgr in managers.values():
        if mgr.process: mgr._stop_sync()

# ══ Reporte Diario ─────────────────────────────────────────────────────────────────

def _logo_b64() -> str:
    """Devuelve el logo VTV como cadena base64 PNG para embeber en emails."""
    logo_path = os.path.join(_BASE_DIR, "static", "logo.png")
    try:
        with open(logo_path, "rb") as f:
            return _b64.b64encode(f.read()).decode()
    except Exception:
        return ""

async def _build_and_send_daily_report(turno: str = "mañana"):
    """Construye y envía el reporte completo del sistema.
    turno: 'mañana' (06:00) o 'noche' (22:00)
    """
    try:
        now = datetime.now()
        dsk = psutil.disk_usage("/")
        try:
            dsk_cap = psutil.disk_usage(CAPTURAS_PATH)
        except Exception:
            dsk_cap = dsk
        mem = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=1)

        # ── Helpers ──────────────────────────────────────────────────────────
        def _bar(pct, col):
            return (f'<div style="background:#1e293b;border-radius:999px;height:8px;overflow:hidden;margin-top:6px;">'
                    f'<div style="background:{col};width:{min(100,round(pct))}%;height:8px;border-radius:999px;"></div></div>')

        def _seccion(titulo):
            return (f'<tr><td colspan="4" style="padding:14px 20px 8px;background:#0f172a;border-top:1px solid #1e293b;">'
                    f'<span style="color:#475569;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">{titulo}</span>'
                    f'</td></tr>')

        # ── Colores según umbral ──────────────────────────────────────────────
        disk_col = "#f87171" if dsk.percent >= 85 else "#fbbf24" if dsk.percent >= 65 else "#4ade80"
        cap_col  = "#f87171" if dsk_cap.percent >= 85 else "#fbbf24" if dsk_cap.percent >= 65 else "#4ade80"
        cpu_col  = "#f87171" if cpu >= 90 else "#fbbf24" if cpu >= 70 else "#4ade80"
        ram_col  = "#f87171" if mem.percent >= 90 else "#fbbf24" if mem.percent >= 70 else "#60a5fa"

        disk_free_gb  = round(dsk.free  / (1024**3), 1)
        disk_total_gb = round(dsk.total / (1024**3), 1)
        cap_free_gb   = round(dsk_cap.free  / (1024**3), 1)
        cap_total_gb  = round(dsk_cap.total / (1024**3), 1)
        ram_used_gb   = round((mem.total - mem.available) / (1024**3), 1)
        ram_total_gb  = round(mem.total / (1024**3), 1)

        # ── Carpeta de videos ─────────────────────────────────────────────────
        def _folder_stats_sync():
            base = _resolve_dest_path()
            total_bytes = 0
            total_files = 0
            try:
                for f in base.rglob("*.mp4"):
                    try:
                        total_bytes += f.stat().st_size
                        total_files += 1
                    except Exception:
                        pass
            except Exception:
                pass
            gb = round(total_bytes / (1024**3), 2)
            return total_files, gb

        video_count, folder_gb = await asyncio.to_thread(_folder_stats_sync)

        # ── Canales ───────────────────────────────────────────────────────────
        channel_rows = ""
        for ch_id, mgr in managers.items():
            grabando = mgr.is_recording()
            estado   = "&#9679; GRABANDO" if grabando else "&#9675; Inactivo"
            col      = "#4ade80" if grabando else "#475569"
            bitrate  = mgr.config.get("bitrate", "—") if mgr.config else "—"
            elapsed  = int(time.time() - mgr.started_at) if mgr.started_at and grabando else 0
            h2, m2, s2 = elapsed // 3600, (elapsed % 3600) // 60, elapsed % 60
            dur = f"{h2:02d}h {m2:02d}m {s2:02d}s" if elapsed else "—"
            destino = mgr.config.get("dest_path", "—") if mgr.config else "—"
            channel_rows += f"""
            <tr>
              <td style="padding:10px 16px;border-bottom:1px solid #0f172a;">
                <div style="color:#e2e8f0;font-family:monospace;font-size:12px;font-weight:700;">Canal {ch_id}</div>
                <div style="color:#334155;font-family:monospace;font-size:10px;margin-top:2px;">{mgr.input_name}</div>
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid #0f172a;text-align:center;">
                <span style="color:{col};font-family:monospace;font-size:10px;font-weight:900;letter-spacing:1px;">{estado}</span>
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid #0f172a;text-align:center;">
                <span style="color:#94a3b8;font-family:monospace;font-size:11px;">{bitrate}</span>
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid #0f172a;text-align:center;">
                <span style="color:#94a3b8;font-family:monospace;font-size:11px;">{dur}</span>
              </td>
            </tr>"""

        # ── Últimos 3 accesos ─────────────────────────────────────────────────
        day_start  = now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        day_logs   = [e for e in ACCESS_LOG if e.get("timestamp", 0) >= day_start]
        ok_count   = sum(1 for e in day_logs if e.get("role") not in ("", "fallido"))
        fail_count = sum(1 for e in day_logs if e.get("role") == "fallido")
        last_3     = list(reversed(ACCESS_LOG[-3:])) if ACCESS_LOG else []

        access_rows = ""
        for entry in last_3:
            ts_entry  = datetime.fromtimestamp(entry.get("timestamp", 0)).strftime("%d/%m %H:%M:%S")
            usr = entry.get("username", "—")
            rol = entry.get("role", "—")
            ip  = entry.get("ip", "—")
            rc  = "#f87171" if rol == "fallido" else "#4ade80"
            access_rows += f"""
            <tr>
              <td style="padding:8px 16px;border-bottom:1px solid #0f172a;">
                <span style="color:#64748b;font-family:monospace;font-size:11px;">{ts_entry}</span>
              </td>
              <td style="padding:8px 16px;border-bottom:1px solid #0f172a;">
                <span style="color:#e2e8f0;font-family:monospace;font-size:12px;font-weight:600;">{usr}</span>
              </td>
              <td style="padding:8px 16px;border-bottom:1px solid #0f172a;">
                <span style="color:{rc};font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1px;">{rol.upper()}</span>
              </td>
              <td style="padding:8px 16px;border-bottom:1px solid #0f172a;">
                <span style="color:#475569;font-family:monospace;font-size:11px;">{ip}</span>
              </td>
            </tr>"""
        if not access_rows:
            access_rows = '<tr><td colspan="4" style="padding:12px 20px;color:#334155;font-size:11px;font-style:italic;">Sin accesos registrados.</td></tr>'

        # ── Logo base64 ───────────────────────────────────────────────────────
        logo_data = await asyncio.to_thread(_logo_b64)
        logo_tag  = (f'<img src="data:image/png;base64,{logo_data}" alt="VTV" '
                     f'style="height:40px;vertical-align:middle;display:block;">'
                     if logo_data else
                     '<span style="color:#dc2626;font-size:22px;font-weight:900;font-family:monospace;">VTV</span>')

        # ── Turno label ───────────────────────────────────────────────────────
        turno_label = "REPORTE DE LA MA&#209;ANA" if turno == "ma\u00f1ana" else "REPORTE DE LA NOCHE"
        turno_color = "#fbbf24" if turno == "ma\u00f1ana" else "#818cf8"
        fecha_str   = now.strftime("%A %d de %B de %Y").capitalize()

        # ── HTML ──────────────────────────────────────────────────────────────
        html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#020617;font-family:'Segoe UI',system-ui,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:32px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">

  <!-- Barra roja VTV -->
  <tr><td style="background-color:#dc2626;height:5px;border-radius:6px 6px 0 0;font-size:0;">&nbsp;</td></tr>

  <!-- Cabecera -->
  <tr><td style="background-color:#0f172a;border:1px solid #1e293b;border-top:none;padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;width:60px;">{logo_tag}</td>
        <td style="vertical-align:middle;padding-left:14px;border-left:3px solid #dc2626;">
          <div style="color:#fff;font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:-0.3px;line-height:1.1;">CAPTURADORA 2.0</div>
          <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-top:3px;">Sistema Multicanal &mdash; C.A. Venezolana de Televisi&oacute;n</div>
        </td>
        <td align="right" style="vertical-align:middle;">
          <div style="display:inline-block;background:{turno_color}22;color:{turno_color};border:1px solid {turno_color}55;padding:4px 12px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:2px;text-transform:uppercase;white-space:nowrap;">{turno_label}</div>
          <div style="color:#64748b;font-family:monospace;font-size:11px;font-weight:700;margin-top:6px;text-align:right;">{fecha_str}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- RECURSOS DEL SERVIDOR -->
  <tr><td style="background-color:#0a0f1e;border:1px solid #1e293b;border-top:none;padding:20px 28px;">
    <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px;">Recursos del Servidor</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:33%;padding-right:16px;vertical-align:top;">
          <div style="color:#64748b;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Procesador (CPU)</div>
          {_bar(cpu, cpu_col)}
          <div style="color:{cpu_col};font-family:monospace;font-size:22px;font-weight:900;margin-top:4px;">{round(cpu)}%</div>
        </td>
        <td style="width:33%;padding:0 8px;vertical-align:top;">
          <div style="color:#64748b;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Memoria RAM</div>
          {_bar(mem.percent, ram_col)}
          <div style="color:{ram_col};font-family:monospace;font-size:22px;font-weight:900;margin-top:4px;">{ram_used_gb}<span style="font-size:12px;color:#475569;"> / {ram_total_gb} GB</span></div>
        </td>
        <td style="width:33%;padding-left:16px;vertical-align:top;">
          <div style="color:#64748b;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Disco del Sistema</div>
          {_bar(dsk.percent, disk_col)}
          <div style="color:{disk_col};font-family:monospace;font-size:22px;font-weight:900;margin-top:4px;">{dsk.percent:.1f}%</div>
          <div style="color:#475569;font-size:10px;font-family:monospace;">{disk_free_gb} GB libres de {disk_total_gb} GB</div>
        </td>
      </tr>
      <tr>
        <td colspan="3" style="padding-top:16px;vertical-align:top;">
          <div style="color:#64748b;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Disco de Capturas (Hitachi 1.8TB)</div>
          {_bar(dsk_cap.percent, cap_col)}
          <div style="color:{cap_col};font-family:monospace;font-size:22px;font-weight:900;margin-top:4px;">{dsk_cap.percent:.1f}%</div>
          <div style="color:#475569;font-size:10px;font-family:monospace;">{cap_free_gb} GB libres de {cap_total_gb} GB &mdash; {CAPTURAS_PATH}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ALMACENAMIENTO DE VIDEOS -->
  <tr><td style="background-color:#0f172a;border:1px solid #1e293b;border-top:none;padding:16px 28px;">
    <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Almacenamiento de Videos</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="width:50%;padding-right:12px;">
          <div style="background:#0a0f1e;border:1px solid #1e293b;border-radius:12px;padding:14px 18px;text-align:center;">
            <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Videos grabados (.mp4)</div>
            <div style="color:#60a5fa;font-family:monospace;font-size:28px;font-weight:900;margin-top:4px;">{video_count}</div>
          </div>
        </td>
        <td style="width:50%;padding-left:12px;">
          <div style="background:#0a0f1e;border:1px solid #1e293b;border-radius:12px;padding:14px 18px;text-align:center;">
            <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Tama&ntilde;o de la carpeta</div>
            <div style="color:#a78bfa;font-family:monospace;font-size:28px;font-weight:900;margin-top:4px;">{folder_gb} <span style="font-size:14px;">GB</span></div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ESTADO DE CANALES -->
  <tr><td style="background-color:#0a0f1e;border:1px solid #1e293b;border-top:none;">
    <div style="padding:14px 28px 8px;">
      <span style="color:#475569;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Estado de Canales de Grabaci&oacute;n</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#0f172a;">
        <th style="padding:7px 16px;text-align:left;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Canal / Dispositivo</span></th>
        <th style="padding:7px 16px;text-align:center;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Estado</span></th>
        <th style="padding:7px 16px;text-align:center;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Bitrate</span></th>
        <th style="padding:7px 16px;text-align:center;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">En grabaci&oacute;n</span></th>
      </tr>
      {channel_rows}
    </table>
  </td></tr>

  <!-- ÚLTIMOS 3 ACCESOS -->
  <tr><td style="background-color:#0f172a;border:1px solid #1e293b;border-top:none;">
    <div style="padding:14px 28px 8px;">
      <span style="color:#475569;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
        &Uacute;ltimos Accesos al Sistema
      </span>
      &nbsp;&nbsp;
      <span style="background:#16a34a22;color:#4ade80;border:1px solid #16a34a44;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;font-family:monospace;">{ok_count} exitosos hoy</span>
      &nbsp;
      <span style="background:#dc262622;color:#f87171;border:1px solid #dc262644;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;font-family:monospace;">{fail_count} fallidos hoy</span>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr style="background:#0a0f1e;">
        <th style="padding:7px 16px;text-align:left;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fecha/Hora</span></th>
        <th style="padding:7px 16px;text-align:left;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Usuario</span></th>
        <th style="padding:7px 16px;text-align:left;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Rol</span></th>
        <th style="padding:7px 16px;text-align:left;"><span style="color:#1e293b;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">IP</span></th>
      </tr>
      {access_rows}
    </table>
  </td></tr>

  <!-- Pie de p&aacute;gina -->
  <tr><td style="background-color:#020617;border:1px solid #1e293b;border-top:none;border-radius:0 0 12px 12px;padding:14px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="color:#1e293b;font-size:10px;font-weight:700;letter-spacing:1px;font-family:monospace;">
            Generado autom&aacute;ticamente el {now.strftime('%d/%m/%Y a las %H:%M:%S')}
          </span>
        </td>
        <td align="right">
          <span style="color:#dc2626;font-size:12px;font-weight:900;letter-spacing:3px;font-family:monospace;">VTV</span>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>"""

        # ── Envío ─────────────────────────────────────────────────────────────
        cfg_e = await asyncio.to_thread(_load_email_config_sync)
        recipients = [r.strip() for r in cfg_e.get("recipients", []) if r.strip()]
        if not recipients:
            logger.warning("[REPORTE] No hay destinatarios configurados")
            return

        hora_str = now.strftime("%H:%M")
        subject  = f"[Capturadora VTV] Reporte {turno.capitalize()} — {now.strftime('%d/%m/%Y')} {hora_str}"

        def _send_report():
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"{cfg_e['from_name']} <{cfg_e['from_addr']}>"
            msg["To"]      = ", ".join(recipients)
            msg.attach(MIMEText(f"Reporte {turno} Capturadora 2.0 — {now.strftime('%d/%m/%Y')}", "plain", "utf-8"))
            msg.attach(MIMEText(html, "html", "utf-8"))
            host = cfg_e.get("smtp_host", "127.0.0.1")
            port = int(cfg_e.get("smtp_port", 25))
            srv  = smtplib.SMTP(host, port, timeout=10)
            srv.ehlo()
            if cfg_e.get("smtp_tls"):
                srv.starttls(); srv.ehlo()
            if cfg_e.get("smtp_user") and cfg_e.get("smtp_pass") and srv.has_extn("AUTH"):
                srv.login(cfg_e["smtp_user"], cfg_e["smtp_pass"])
            srv.sendmail(cfg_e["from_addr"], recipients, msg.as_string())
            srv.quit()

        await asyncio.to_thread(_send_report)
        logger.info(f"[REPORTE] Reporte '{turno}' enviado a {recipients}")
    except Exception as e:
        logger.error(f"[REPORTE] Error enviando reporte '{turno}': {e}")


async def daily_report_task():
    """Dispara el reporte a las 06:00 (mañana) y 22:00 (noche) cada día."""
    logger.info("[REPORTE] Tarea iniciada — envíos a las 06:00 y 22:00")
    TURNOS = [(6, 0, "mañana"), (22, 0, "noche")]
    while True:
        now = datetime.now()
        # Calcular el próximo turno
        proximos = []
        for h, m, label in TURNOS:
            t = now.replace(hour=h, minute=m, second=0, microsecond=0)
            if now >= t:
                t += timedelta(days=1)
            proximos.append((t, label))
        proximos.sort(key=lambda x: x[0])
        next_target, next_label = proximos[0]
        wait_secs = (next_target - now).total_seconds()
        logger.info(f"[REPORTE] Próximo reporte ({next_label}) en {int(wait_secs//3600)}h {int((wait_secs%3600)//60)}m")
        await asyncio.sleep(wait_secs)
        await _build_and_send_daily_report(next_label)


# ══ App ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(title="VTV - Capturadora Multicanal 2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ── Configuración para Red Interna (HTTP) ────────────────────────────────────
# Para red interna VTV: Sin HTTPS, sin warnings, acceso directo

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/api/admin/send-report")
async def api_send_report(token: str = Depends(verify_token)):
    await _build_and_send_daily_report()
    return {"status": "ok"}
@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.1", "recording": {k: v.is_recording() for k,v in managers.items()}}

@app.post("/api/login")
async def login(data: LoginRequest, request: Request):
    ip = request.client.host
    now = time.time()

    # Limpiar entradas de LOGIN_ATTEMPTS con más de 10 minutos de antigüedad (previene memory leak)
    stale = [k for k, v in LOGIN_ATTEMPTS.items()
             if v.get("count", 0) == 0 or now - v.get("lock_until", 0) > 600]
    for k in stale:
        LOGIN_ATTEMPTS.pop(k, None)

    # Rate limiting check
    attempt = LOGIN_ATTEMPTS.get(ip, {"count": 0, "lock_until": 0})
    if now < attempt["lock_until"]:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta en 5 min.")

    user_data = None
    real_user = data.username
    
    # Buscar en usuarios estáticos (sin alias)
    for uname, uinfo in USERS.items():
        if uname == data.username:
            user_data = uinfo
            real_user = uname
            break

    # Buscar en usuarios dinámicos si no se encontró
    if user_data is None:
        dyn = USERS_DB["users"].get(data.username)
        if dyn:
            user_data = dyn
            real_user = data.username

    if user_data and verify_password(data.password, user_data["password"]):
        LOGIN_ATTEMPTS[ip] = {"count": 0, "lock_until": 0} # reset
        new_sess = str(uuid.uuid4())
        
        async with access_log_lock:
            ACCESS_LOG.append({
                "timestamp": now,
                "username": real_user,
                "ip": ip,
                "role": user_data["role"]
            })
        await _save_access_log()
        
        # Gestión de sesiones concurrentes por Rol
        role = user_data["role"]
        max_sess = 3 if role == "operator" else 1
        
        async with sessions_lock:
            sessions = ACTIVE_SESSIONS.get(real_user, [])
            
            # Retrocompatibilidad rápida para el viejo esquema en memoria
            if isinstance(sessions, dict):
                sessions = [sessions]
            
            # Limpiar sesiones huérfanas (sin ping por más de 4 minutos)
            sessions = [s for s in sessions if isinstance(s, dict) and "last_ping" in s and now - s["last_ping"] < 240]
            
            # Desalojar la más vieja si llegamos al tope
            if len(sessions) >= max_sess:
                sessions.sort(key=lambda x: x.get("last_ping", 0))
                sessions.pop(0)
                
            sessions.append({"session_id": new_sess, "last_ping": now})
            ACTIVE_SESSIONS[real_user] = sessions

        # Determinar el canal asignado (para roles de grupo)
        channel = None
        if role == "group1":
            channel = "1"
        elif role == "group2":
            channel = "2"
        elif role == "group3":
            channel = "3"
        elif role == "group4":
            channel = "4"
        
        cfg_e = await asyncio.to_thread(_load_email_config_sync)
        if cfg_e.get("notify_login_ok"):
            asyncio.create_task(send_email(
                "login", f"Acceso al sistema — {real_user}",
                [f"Usuario: {real_user}", f"Rol: {role}", f"IP: {ip}",
                 f"Hora: {datetime.fromtimestamp(now).strftime('%d/%m/%Y %H:%M:%S')}"],
                cooldown_key=f"login_ok_{real_user}"
            ))
        return {
            "token": user_data["token"], "role": role,
            "username": real_user, "session_id": new_sess,
            "channel": channel
        }
        
    # Failed attempt
    attempt["count"] += 1
    if attempt["count"] >= 5:
        attempt["lock_until"] = now + 300
    LOGIN_ATTEMPTS[ip] = attempt
    
    async with access_log_lock:
        ACCESS_LOG.append({
            "timestamp": now,
            "username": data.username,
            "ip": ip,
            "role": "fallido"
        })
    await _save_access_log()
    cfg_e = await asyncio.to_thread(_load_email_config_sync)
    if cfg_e.get("notify_login_fail"):
        asyncio.create_task(send_email(
            "login_fail", f"Intento fallido de acceso — {data.username}",
            [f"Usuario: {data.username}", f"IP: {ip}",
             f"Intentos: {attempt['count']}",
             f"Hora: {datetime.fromtimestamp(now).strftime('%d/%m/%Y %H:%M:%S')}"],
            cooldown_key=f"login_fail_{ip}"
        ))
    raise HTTPException(status_code=401, detail="Credenciales incorrectas")

@app.get("/api/metrics")
async def api_metrics(x_username: str = Header(None), x_session_id: str = Header(None), token: str = Depends(verify_token)):
    if x_username and x_session_id:
        async with sessions_lock:
            sessions = ACTIVE_SESSIONS.get(x_username, [])
            if isinstance(sessions, dict):
                sessions = [sessions]

            my_session = next((s for s in sessions if isinstance(s, dict) and s.get("session_id") == x_session_id), None)

            if not my_session:
                # Sesión no encontrada en memoria (p.ej. después de reinicio del servidor).
                # El token ya fue validado, así que re-registramos la sesión en lugar de botar al usuario.
                now = time.time()
                sessions = [s for s in sessions if isinstance(s, dict) and "last_ping" in s and now - s["last_ping"] < 240]
                my_session = {"session_id": x_session_id, "last_ping": now}
                sessions.append(my_session)
                ACTIVE_SESSIONS[x_username] = sessions
            else:
                my_session["last_ping"] = time.time()
                ACTIVE_SESSIONS[x_username] = sessions

    return cached_metrics

@app.get("/api/processes")
async def api_processes(token: str = Depends(verify_token)):
    return cached_processes

# Endpoints por Canal (source_id = "1" o "2")
@app.get("/api/status/{source_id}")
async def api_status(source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), token: str = Depends(verify_token)):
    mgr = get_mgr(source_id)
    running = mgr.is_recording()
    elapsed = int(time.time() - mgr.started_at) if mgr.started_at and running else 0
    return {
        "source_id": source_id, "running": running, "config": mgr.config,
        "elapsed_seconds": elapsed, "auto_restarted": mgr.auto_restarted,
        "scheduled_start": mgr.scheduled_start.isoformat() if mgr.scheduled_start else None,
        "scheduled_stop":  mgr.scheduled_stop.isoformat()  if mgr.scheduled_stop  else None
    }

@app.post("/api/start/{source_id}")
async def api_start(config: RecordConfig, source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr = get_mgr(source_id)
    
    # 1. Detener preview explícito si existe
    if mgr.preview_process:
        try:
            if mgr.preview_process.returncode is None:
                mgr.preview_process.terminate()
                try:
                    await asyncio.wait_for(mgr.preview_process.wait(), timeout=1.5)
                except asyncio.TimeoutError:
                    mgr.preview_process.kill()
                    await mgr.preview_process.wait()
        except Exception: pass
        finally:
            mgr.preview_process = None

    # 2. Matar huérfanos de preview para liberar hardware
    try:
        input_name = mgr.input_name
        for p in psutil.process_iter(['pid', 'cmdline']):
            try:
                cmdline = ' '.join(p.info.get('cmdline') or [])
                if 'ffmpeg' in cmdline and 'image2pipe' in cmdline and input_name in cmdline:
                    logger.warning(f"[START] CH{source_id}: matando preview huérfano PID {p.pid} antes de grabar")
                    p.kill()
                    await asyncio.sleep(0.3)
            except (psutil.NoSuchProcess, psutil.AccessDenied): pass
    except Exception: pass
    
    ok, msg = await mgr.start(config)
    if not ok: raise HTTPException(status_code=400, detail=msg)
    user = TOKEN_TO_USER.get(token, "desconocido")
    cfg_e = await asyncio.to_thread(_load_email_config_sync)
    if cfg_e.get("notify_recording_start"):
        asyncio.create_task(send_email(
            "start", f"Canal {source_id} — Grabación iniciada",
            [f"Canal: DeckLink Duo ({source_id})", f"Usuario: {user}",
             f"Bitrate: {config.bitrate}", f"Segmentos: {config.segment_minutes} min",
             f"Destino: {config.dest_path}", f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"],
            cooldown_key=f"start_{source_id}"
        ))
    return {"status": "ok", "message": msg}

@app.post("/api/stop/{source_id}")
async def api_stop(source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr_stop = get_mgr(source_id)
    elapsed_stop = int(time.time() - mgr_stop.started_at) if mgr_stop.started_at else 0
    await mgr_stop.stop_and_clean()
    user_stop = TOKEN_TO_USER.get(token, "desconocido")
    cfg_e = await asyncio.to_thread(_load_email_config_sync)
    if cfg_e.get("notify_recording_stop"):
        h, m, s = elapsed_stop//3600, (elapsed_stop%3600)//60, elapsed_stop%60
        asyncio.create_task(send_email(
            "stop", f"Canal {source_id} — Grabación detenida",
            [f"Canal: DeckLink Duo ({source_id})", f"Usuario: {user_stop}",
             f"Duración: {h:02d}:{m:02d}:{s:02d}",
             f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"],
            cooldown_key=f"stop_{source_id}"
        ))
    return {"status": "ok"}

@app.post("/api/schedule/{source_id}")
async def api_schedule(req: ScheduleRequest, source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr = get_mgr(source_id)
    today = date.today()
    def parse_time(t: str) -> datetime:
        h, m = map(int, t.split(":")); dt = datetime.combine(today, dtime(h, m))
        if dt < datetime.now(): dt += timedelta(days=1)
        return dt
    if req.start_time:
        mgr.scheduled_start = parse_time(req.start_time); mgr.scheduled_config = req.config
    if req.stop_time:
        mgr.scheduled_stop = parse_time(req.stop_time)
    return {"status": "ok"}

@app.post("/api/schedule/cancel/{source_id}")
async def api_schedule_cancel(source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr = get_mgr(source_id)
    mgr.scheduled_start = mgr.scheduled_stop = mgr.scheduled_config = None
    return {"status": "ok"}

@app.get("/api/log/{source_id}")
async def api_log(source_id: str = FastAPIPath(..., pattern="^(1|2|3|4)$"), lines: int = Query(default=100, ge=10, le=1000), token: str = Depends(verify_token)):
    lf = get_mgr(source_id).log_file
    if not os.path.exists(lf): return {"lines": [], "size_bytes": 0}
    def read_tail():
        sz = os.path.getsize(lf)
        with open(lf, "r", errors="replace") as f: content = f.readlines()[-lines:]
        return [l.rstrip() for l in content], sz
    content, size = await asyncio.to_thread(read_tail)
    return {"lines": content, "size_bytes": size, "total_lines_shown": len(content)}

# ── Gestión de Limpieza ───────────────────────────────────────────────────────
CLEANUP_CONFIG = os.path.join(_DATA_DIR, "cleanup_config.json")
CLEANUP_SCRIPT = os.path.join(_BASE_DIR, "scripts", "cleanup.sh")

# Auto-cleanup when disk is full (delete oldest MP4 files).
DEFAULT_CLEANUP_CONFIG = {
    "retention_days": 2,
    "disk_guard": {
        "enabled": False,
        # If disk usage percent is >= trigger_percent, start deleting.
        "trigger_percent": 92,
        # Stop deleting once disk usage percent is <= target_percent.
        "target_percent": 88,
        # How often to check.
        "check_interval_sec": 30,
        # Safety: avoid deleting files modified very recently (likely in-progress segments).
        "min_file_age_sec": 300,
        # Maximum files to delete per pass (prevents long blocking loops).
        "max_delete_files": 10,
    },
}

def _merge_dict(dst: dict, src: dict) -> dict:
    """Shallow/recursive merge: src values override dst."""
    for k, v in (src or {}).items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _merge_dict(dst[k], v)
        else:
            dst[k] = v
    return dst

def _load_cleanup_config_sync() -> dict:
    cfg = json.loads(json.dumps(DEFAULT_CLEANUP_CONFIG))
    try:
        if os.path.exists(CLEANUP_CONFIG):
            with open(CLEANUP_CONFIG, "r") as f:
                loaded = json.load(f) or {}
            _merge_dict(cfg, loaded)
    except Exception as e:
        logger.error(f"Error leyendo cleanup_config: {e}")
    return cfg

def _save_cleanup_config_sync(cfg: dict) -> None:
    try:
        with open(CLEANUP_CONFIG, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        logger.error(f"Error guardando cleanup_config: {e}")

def _iter_mp4_files_sorted_oldest(base: Path) -> list[Path]:
    files: list[Path] = []
    try:
        for p in base.rglob("*.mp4"):
            try:
                if p.is_file():
                    files.append(p)
            except Exception:
                pass
    except Exception:
        return []
    files.sort(key=lambda p: p.stat().st_mtime if p.exists() else 0)
    return files

def _disk_guard_delete_oldest_sync(base: Path, cfg: dict) -> dict:
    """Delete oldest MP4s until target_percent is met or max_delete_files reached."""
    dg = (cfg or {}).get("disk_guard") or {}
    try:
        trigger = int(dg.get("trigger_percent", 92))
        target = int(dg.get("target_percent", 88))
        interval = int(dg.get("check_interval_sec", 30))
        min_age = int(dg.get("min_file_age_sec", 300))
        max_delete = int(dg.get("max_delete_files", 10))
    except Exception:
        trigger, target, interval, min_age, max_delete = 92, 88, 30, 300, 10

    # Sanity bounds
    trigger = min(99, max(1, trigger))
    target = min(99, max(1, target))
    if target > trigger:
        # Keep a sensible order to prevent endless loops.
        target = max(1, trigger - 2)
    max_delete = min(500, max(1, max_delete))
    min_age = min(24 * 3600, max(0, min_age))

    usage = psutil.disk_usage(str(base)) if base.exists() else psutil.disk_usage("/")
    deleted = []
    skipped_recent = 0

    if usage.percent < trigger:
        return {
            "trigger_percent": trigger,
            "target_percent": target,
            "disk_percent": usage.percent,
            "deleted": deleted,
            "skipped_recent": skipped_recent,
            "max_delete_files": max_delete,
        }

    now_ts = time.time()
    for p in _iter_mp4_files_sorted_oldest(base):
        if len(deleted) >= max_delete:
            break
        try:
            st = p.stat()
        except Exception:
            continue
        # Avoid touching very recent files (likely in-progress segment writes).
        if min_age and (now_ts - st.st_mtime) < min_age:
            skipped_recent += 1
            continue
        try:
            size = st.st_size
            p.unlink()
            deleted.append({"path": str(p), "size_bytes": size, "mtime": st.st_mtime})
        except Exception as e:
            logger.warning(f"[DISK_GUARD] No se pudo borrar {p}: {e}")
            continue

        usage = psutil.disk_usage(str(base))
        if usage.percent <= target:
            break

    return {
        "trigger_percent": trigger,
        "target_percent": target,
        "disk_percent": usage.percent,
        "deleted": deleted,
        "skipped_recent": skipped_recent,
        "max_delete_files": max_delete,
    }

async def disk_guard_task():
    """Background task: if disk usage crosses threshold, delete oldest MP4s."""
    while True:
        cfg = await asyncio.to_thread(_load_cleanup_config_sync)
        dg = cfg.get("disk_guard", {})
        enabled = bool(dg.get("enabled", False))
        try:
            interval = int(dg.get("check_interval_sec", 30))
        except Exception:
            interval = 30
        interval = min(3600, max(5, interval))

        if enabled:
            try:
                base = _resolve_dest_path()
                result = await asyncio.to_thread(_disk_guard_delete_oldest_sync, base, cfg)
                if result.get("deleted"):
                    n_del = len(result['deleted'])
                    logger.warning(f"[DISK_GUARD] Liberando espacio: borrados {n_del} archivo(s). Disco={result.get('disk_percent')}%")
                    cfg_e = await asyncio.to_thread(_load_email_config_sync)
                    if cfg_e.get("notify_disk_guard"):
                        try:
                            dsk_cap = psutil.disk_usage(CAPTURAS_PATH)
                        except Exception:
                            dsk_cap = psutil.disk_usage("/")
                        asyncio.create_task(send_email(
                            "disk_guard", f"Guardián de disco eliminó {n_del} archivo(s)",
                            [f"Disco: {CAPTURAS_PATH}",
                             f"Archivos eliminados: {n_del}",
                             f"Uso del disco: {result.get('disk_percent')}% → {dsk_cap.percent:.1f}%",
                             f"Libre: {dsk_cap.free//(1024**3)} GB",
                             f"Hora: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"],
                            cooldown_key="disk_guard_action"
                        ))
            except Exception as e:
                logger.error(f"[DISK_GUARD] Error: {e}")

        await asyncio.sleep(interval)

# ── Ruta base de grabaciones ──────────────────────────────────────────────────
def _resolve_dest_path() -> Path:
    """Determina la ruta base de grabaciones a partir de la configuración activa de cada canal."""
    dest = CAPTURAS_PATH
    for mgr in managers.values():
        if mgr.config and "dest_path" in mgr.config:
            dest = mgr.config["dest_path"]
            break
    return Path(dest).resolve()

@app.get("/api/cleanup/config")
async def get_cleanup_config(token: str = Depends(verify_token)):
    return await asyncio.to_thread(_load_cleanup_config_sync)

@app.post("/api/cleanup/config")
async def save_cleanup_config(cfg: dict, token: str = Depends(require_admin)):
    # Merge updates with existing config so partial updates don't wipe other keys.
    def _write_merge():
        current = _load_cleanup_config_sync()
        if isinstance(cfg, dict):
            _merge_dict(current, cfg)
        _save_cleanup_config_sync(current)
    await asyncio.to_thread(_write_merge)
    return {"status": "ok"}

@app.post("/api/cleanup/execute")
async def execute_cleanup(force_all: bool = False, specific_day: str = None, token: str = Depends(require_admin)):
    args = ["sudo", CLEANUP_SCRIPT]
    if force_all:
        args.append("--force-all")
    if specific_day:
        args.extend(["--specific-day", specific_day])
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {"status": "ok", "out": stdout.decode(), "err": stderr.decode()}

# ══════════════════════════════════════════════════════════════════════════════
# SISTEMA DE NOTIFICACIONES POR CORREO
# ══════════════════════════════════════════════════════════════════════════════
EMAIL_CONFIG_FILE = os.path.join(_DATA_DIR, "email_config.json")

DEFAULT_EMAIL_CONFIG = {
    "enabled": True,
    "smtp_host": "vtvcorreo.vtv.gob.ve",
    "smtp_port": 25,
    "smtp_user": "capturadora@vtv.gob.ve",
    "smtp_pass": SMTP_PASS_ENV,
    "smtp_tls": False,
    "from_addr": "capturadora@vtv.gob.ve",
    "from_name": "Capturadora 2.0 VTV",
    "recipients": [],
    "notify_recording_start": True,
    "notify_recording_stop": True,
    "notify_login_ok": True,
    "notify_login_fail": True,
    "notify_watchdog": True,
    "notify_disk_guard": True,
    "notify_disk_critical": True,
}

_email_config_lock = asyncio.Lock()

# Rate-limiting: key → last sent timestamp
_email_rate: dict[str, float] = {}
_EMAIL_COOLDOWN = 60  # segundos mínimos entre emails del mismo tipo

def _load_email_config_sync() -> dict:
    cfg = dict(DEFAULT_EMAIL_CONFIG)
    try:
        if os.path.exists(EMAIL_CONFIG_FILE):
            with open(EMAIL_CONFIG_FILE, "r") as f:
                loaded = json.load(f) or {}
            cfg.update(loaded)
    except Exception as e:
        logger.error(f"[EMAIL] Error leyendo email_config: {e}")
    # La variable de entorno siempre tiene prioridad sobre el archivo guardado
    if SMTP_PASS_ENV:
        cfg["smtp_pass"] = SMTP_PASS_ENV
    return cfg

def _save_email_config_sync(cfg: dict) -> None:
    try:
        with open(EMAIL_CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
    except Exception as e:
        logger.error(f"[EMAIL] Error guardando email_config: {e}")

def _build_html_email(subject: str, event_type: str, body_lines: list[str]) -> str:
    event_map = {
        "start":         ("#16a34a", "#bbf7d0", "▶", "GRABACIÓN INICIADA"),
        "stop":          ("#dc2626", "#fecaca", "⏹", "GRABACIÓN DETENIDA"),
        "login":         ("#2563eb", "#bfdbfe", "🔐", "ACCESO AL SISTEMA"),
        "login_fail":    ("#b45309", "#fde68a", "⚠", "INTENTO FALLIDO"),
        "watchdog":      ("#7c3aed", "#ddd6fe", "🔄", "REINICIO AUTOMÁTICO"),
        "disk_guard":    ("#b45309", "#fed7aa", "🗑", "GUARDIÁN DE DISCO"),
        "disk_critical": ("#dc2626", "#fecaca", "💾", "DISCO CRÍTICO"),
        "test":          ("#0891b2", "#a5f3fc", "✉", "CORREO DE PRUEBA"),
    }
    accent, pill_color, icon, event_label = event_map.get(event_type, ("#475569", "#cbd5e1", "•", subject.upper()))
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    # Build data rows — split each line on first ":" to make key/value pairs
    rows_html = ""
    for ln in body_lines:
        if ":" in ln:
            key, _, val = ln.partition(":")
            rows_html += f"""
            <tr>
              <td style="padding:10px 16px;border-bottom:1px solid #1e293b;width:38%;">
                <span style="color:#64748b;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;font-family:monospace;">{key.strip()}</span>
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid #1e293b;">
                <span style="color:#e2e8f0;font-size:13px;font-weight:600;font-family:monospace;">{val.strip()}</span>
              </td>
            </tr>"""
        else:
            rows_html += f"""
            <tr>
              <td colspan="2" style="padding:10px 16px;border-bottom:1px solid #1e293b;">
                <span style="color:#94a3b8;font-size:12px;font-style:italic;">{ln}</span>
              </td>
            </tr>"""

    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#020617;font-family:'Segoe UI',system-ui,Arial,sans-serif;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#020617;padding:40px 16px;">
<tr><td align="center">

<!-- Card -->
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#0f172a;border-radius:20px;overflow:hidden;border:1px solid #1e293b;">

  <!-- Top red VTV bar -->
  <tr><td style="background-color:#dc2626;height:4px;font-size:0;">&nbsp;</td></tr>

  <!-- Header -->
  <tr>
    <td style="padding:28px 32px 24px;background-color:#0f172a;border-bottom:1px solid #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;">
            <!-- Logo text (SVG inline not supported in all clients, use text) -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="border-left:4px solid #dc2626;padding-left:10px;vertical-align:middle;">
                  <div style="color:#ffffff;font-size:16px;font-weight:900;letter-spacing:-0.5px;text-transform:uppercase;line-height:1.1;">CAPTURADORA 2.0</div>
                  <div style="color:#475569;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;margin-top:2px;">Sistema Multicanal VTV</div>
                </td>
              </tr>
            </table>
          </td>
          <td align="right" style="vertical-align:middle;">
            <span style="display:inline-block;background-color:{accent}1a;color:{pill_color};border:1px solid {accent}4d;padding:4px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">{icon} {event_label}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Subject -->
  <tr>
    <td style="padding:20px 32px 4px;background-color:#0f172a;">
      <div style="color:#f1f5f9;font-size:20px;font-weight:900;letter-spacing:-0.3px;">{subject}</div>
    </td>
  </tr>

  <!-- Data table -->
  <tr>
    <td style="padding:8px 20px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f1e;border-radius:12px;border:1px solid #1e293b;overflow:hidden;">
        {rows_html}
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:16px 32px;background-color:#020617;border-top:1px solid #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="color:#334155;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-family:monospace;">
              C.A. Venezolana de Televisión &nbsp;·&nbsp; {now_str}
            </span><br>
            <a href="http://capturadora2.0.vtv.gob.ve/canal8" style="color:#dc2626;font-size:10px;font-weight:700;letter-spacing:0.5px;font-family:monospace;text-decoration:none;">capturadora2.0.vtv.gob.ve/canal8</a>
          </td>
          <td align="right">
            <span style="color:#dc2626;font-size:10px;font-weight:900;letter-spacing:2px;font-family:monospace;">VTV</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
<!-- /Card -->

</td></tr></table>
<!-- /Outer wrapper -->

</body>
</html>"""

async def send_email(event_type: str, subject: str, body_lines: list[str], cooldown_key: str | None = None) -> bool:
    """Envía un correo HTML de forma asíncrona (en hilo). Respeta rate-limiting."""
    global _email_rate
    now = time.time()
    key = cooldown_key or event_type
    if key in _email_rate and (now - _email_rate[key]) < _EMAIL_COOLDOWN:
        return False  # silently throttled
    try:
        cfg = await asyncio.to_thread(_load_email_config_sync)
        if not cfg.get("enabled"):
            return False
        recipients = [r.strip() for r in cfg.get("recipients", []) if r.strip()]
        if not recipients:
            logger.warning("[EMAIL] No hay destinatarios configurados")
            return False

        def _send_sync():
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[Capturadora VTV] {subject}"
            msg["From"]    = f"{cfg['from_name']} <{cfg['from_addr']}>"
            msg["To"]      = ", ".join(recipients)
            html_body = _build_html_email(subject, event_type, body_lines)
            plain = "\n".join(body_lines)
            msg.attach(MIMEText(plain, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))
            host = cfg.get("smtp_host", "127.0.0.1")
            port = int(cfg.get("smtp_port", 25))
            use_tls = bool(cfg.get("smtp_tls", False))
            user = cfg.get("smtp_user", "")
            pwd  = cfg.get("smtp_pass", "")
            if use_tls:
                server = smtplib.SMTP(host, port, timeout=10)
                server.ehlo()
                server.starttls()
                server.ehlo()
            else:
                server = smtplib.SMTP(host, port, timeout=10)
                server.ehlo()
            if user and pwd and server.has_extn("AUTH"):
                server.login(user, pwd)
            server.sendmail(cfg["from_addr"], recipients, msg.as_string())
            server.quit()

        await asyncio.to_thread(_send_sync)
        _email_rate[key] = now
        logger.info(f"[EMAIL] Enviado '{subject}' → {recipients}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL] Error enviando correo '{subject}': {e}")
        return False

# ── Endpoints de configuración de notificaciones ──────────────────────────────
@app.get("/api/admin/email-config")
async def get_email_config(token: str = Depends(require_admin)):
    cfg = await asyncio.to_thread(_load_email_config_sync)
    cfg.pop("smtp_pass", None)  # no exponer contraseña en GET
    return cfg

@app.post("/api/admin/email-config")
async def save_email_config(cfg: dict = Body(...), token: str = Depends(require_admin)):
    async with _email_config_lock:
        current = await asyncio.to_thread(_load_email_config_sync)
        # Si no se envió contraseña (campo vacío o ausente), conservar la existente
        if not cfg.get("smtp_pass"):
            cfg["smtp_pass"] = current.get("smtp_pass", "")
        current.update(cfg)
        await asyncio.to_thread(_save_email_config_sync, current)
    return {"status": "ok"}

@app.post("/api/admin/email-test")
async def test_email(token: str = Depends(require_admin)):
    cfg = await asyncio.to_thread(_load_email_config_sync)
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Las notificaciones están desactivadas.")
    if not cfg.get("recipients"):
        raise HTTPException(status_code=400, detail="No hay destinatarios configurados.")
    ok = await send_email(
        "test",
        "Prueba de Notificaciones",
        [
            "Este es un correo de prueba del sistema Capturadora 2.0.",
            "Si lo recibes, la configuración SMTP es correcta.",
            f"Servidor SMTP: {cfg.get('smtp_host')}:{cfg.get('smtp_port')}",
            f"Desde: {cfg.get('from_addr')}",
        ],
        cooldown_key="test_manual"
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Error al enviar el correo de prueba. Revisa los logs del servidor.")
    return {"status": "ok"}


class VerifyPasswordRequest(BaseModel):
    password: str

@app.post("/api/verify-password")
async def verify_admin_password(req: VerifyPasswordRequest, token: str = Depends(require_admin)):
    """Verifica que la contraseña proporcionada corresponde a algún usuario con rol admin.
    Permite que el frontend valide la contraseña SIN exponerla en el código fuente del cliente."""
    all_users = list(USERS.values()) + list(USERS_DB["users"].values())
    user_data = next((u for u in all_users if verify_password(req.password, u["password"]) and u["role"] == "admin"), None)
    if not user_data:
        raise HTTPException(status_code=401, detail="Contraseña incorrecta")
    return {"status": "ok"}

@app.get("/api/files")
async def api_files(token: str = Depends(verify_token)):
    base = _resolve_dest_path()
    dest = str(base)

    def list_files():
        if not base.exists():
            return []

        results = []
        cache_updated = False
        for f in base.rglob("*.mp4"):
            stat = f.stat()
            mtime = stat.st_mtime
            path_str = str(f)

            dur_sec = 0.0
            cache_entry = DURATION_CACHE.get(path_str)
            if cache_entry and cache_entry[0] == mtime:
                # Cache hit - actualizar último acceso
                dur_sec = cache_entry[1]
                cache_entry[2] = time.time()
                cache_updated = True
            else:
                # Cache miss - calcular duración
                try:
                    res = subprocess.check_output([
                        "ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1", path_str
                    ], stderr=subprocess.STDOUT, timeout=3).decode().strip()
                    dur_sec = float(res) if res != "N/A" else 0.0
                except Exception as e:
                    logger.warning(f"Error obteniendo duración de {path_str}: {e}")
                DURATION_CACHE[path_str] = [mtime, dur_sec, time.time()]
                cache_updated = True

            results.append({
                "name": str(f.relative_to(base)),
                "size_bytes": stat.st_size,
                "created": datetime.fromtimestamp(mtime).isoformat(),
                "duration": dur_sec
            })

        if cache_updated:
            _evict_cache_if_needed()
            try:
                with open(CACHE_FILE, "w") as cf:
                    json.dump(DURATION_CACHE, cf)
            except Exception as e:
                logger.error(f"Error guardando duration_cache: {e}")

        return sorted(results, key=lambda x: x["created"], reverse=True)

    files = await asyncio.to_thread(list_files)
    return {"dest_path": dest, "files": files, "count": len(files)}

def get_base_path() -> Path:
    return _resolve_dest_path()

def resolve_safe_path(filename: str) -> Path:
    base = get_base_path()
    # Resolve the path first, then verify it stays inside the base directory.
    # This is the ONLY reliable traversal check — do NOT rely on string manipulation.
    target = (base / filename).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=403, detail="Ruta inválida")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return target

@app.get("/api/files/download")
async def api_download(file: str, token: str = Depends(verify_token)):
    target = resolve_safe_path(file)
    return FileResponse(target, filename=target.name, content_disposition_type="attachment")

class DeleteReq(BaseModel):
    filename: str
    password: str

@app.post("/api/files/delete")
async def api_delete(req: DeleteReq, token: str = Depends(require_admin)):
    user_data = next((u for u in USERS.values() if verify_password(req.password, u["password"])), None)
    if not user_data:
        raise HTTPException(status_code=401, detail="Clave incorrecta")
    target = resolve_safe_path(req.filename)
    try:
        target.unlink()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/stream")
async def api_stream(req: Request, file: str, token: str = Depends(verify_token)):
    target = resolve_safe_path(file)
    file_size = target.stat().st_size
    range_header = req.headers.get("Range")
    
    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
            end = min(end, file_size - 1)
            length = (end - start) + 1

            def file_iterator(path, offset, bytes_to_read):
                with open(path, "rb") as f:
                    f.seek(offset)
                    chunk_size = 1048576 # 1MB
                    while bytes_to_read > 0:
                        data = f.read(min(chunk_size, bytes_to_read))
                        if not data: break
                        bytes_to_read -= len(data)
                        yield data

            headers = {"Content-Range": f"bytes {start}-{end}/{file_size}", "Accept-Ranges": "bytes", "Content-Length": str(length), "Content-Type": "video/mp4"}
            return StreamingResponse(file_iterator(target, start, length), status_code=206, headers=headers)
            
    return FileResponse(target, media_type="video/mp4")

@app.get("/api/preview/{source_id}")
async def api_preview(source_id: str, token: str = Depends(verify_token)):
    logger.info(f"[PREVIEW] Petición recibida para CH{source_id}")
    mgr = managers.get(source_id)
    if not mgr:
        raise HTTPException(status_code=404, detail="Canal no encontrado")

    if mgr.is_recording():
        logger.warning(f"[PREVIEW] CH{source_id} está ocupado grabando")
        raise HTTPException(status_code=400, detail="Dispositivo ocupado grabando Master")

    # ── Matar cualquier proceso de preview anterior huérfano del mismo canal ──
    # Esto evita el "Input/output error" cuando el cliente cierra el modal sin
    # hacer clic en Cerrar y el proceso FFmpeg queda bloqueando el dispositivo.
    if mgr.preview_process is not None:
        try:
            mgr.preview_process.terminate()
            await asyncio.wait_for(mgr.preview_process.wait(), timeout=3.0)
            logger.info(f"[PREVIEW] CH{source_id}: proceso anterior terminado limpiamente")
        except Exception:
            try: mgr.preview_process.kill()
            except Exception: pass
        mgr.preview_process = None
        await asyncio.sleep(0.4)  # Dar tiempo al SO para liberar el dispositivo

    # También matar cualquier proceso FFmpeg del sistema que bloquee este input
    input_name = mgr.input_name
    try:
        for p in psutil.process_iter(['pid', 'cmdline']):
            try:
                cmdline = ' '.join(p.info.get('cmdline') or [])
                if 'ffmpeg' in cmdline and 'image2pipe' in cmdline and input_name in cmdline:
                    logger.warning(f"[PREVIEW] CH{source_id}: matando FFmpeg preview huérfano PID {p.pid}")
                    p.kill()
                    await asyncio.sleep(0.3)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
    except Exception as e:
        logger.debug(f"[PREVIEW] Error buscando procesos huérfanos: {e}")

    # Comando FFmpeg para capturar frames MJPEG continuos (streaming preview)
    # format_code Hi59 = 1080i 29.97fps (SDI digital HD)
    # bwdif deinterlaza la señal antes de escalar para preview
    cmd = [
        "ffmpeg", "-f", "decklink", "-duplex_mode", "half",
        "-video_input", "sdi", "-format_code", "Hi59",  # 1080i 29.97fps SDI HD
        "-i", mgr.input_name,
        "-vf", "bwdif=mode=send_field:parity=auto,scale=640:-1",  # deinterlace primero, luego escalar
        "-vcodec", "mjpeg", "-q:v", "5",  # q:v 5 = buena calidad (1=mejor, 31=peor)
        "-f", "image2pipe", "-"
    ]

    logger.info(f"[PREVIEW] Iniciando FFmpeg: {' '.join(cmd)}")
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    mgr.preview_process = process

    async def frame_generator():
        buffer = b""
        try:
            # El streaming MJPEG manual requiere enviar frames COMPLETOS para evitar el efecto "recortado"
            # Buscamos los marcadores de inicio (\xff\xd8) y fin (\xff\xd9) de JPEG
            while True:
                chunk = await process.stdout.read(16384)
                if not chunk:
                    err = await process.stderr.read()
                    if err: logger.error(f"[PREVIEW] FFmpeg error: {err.decode()}")
                    break
                
                buffer += chunk
                
                # Procesamos todos los frames completos que tengamos en el buffer
                while True:
                    start = buffer.find(b"\xff\xd8")
                    if start == -1:
                        # Si no hay inicio, limpiamos el buffer (basura inicial o fin de frame anterior)
                        buffer = b""
                        break
                    
                    # Buscamos el fin del frame a partir del inicio
                    end = buffer.find(b"\xff\xd9", start)
                    if end == -1:
                        # Frame incompleto, esperamos al siguiente chunk
                        # Pero si el buffer es demasiado grande (viviendo en el pasado), recortamos hasta el inicio
                        if len(buffer) > 500000: buffer = buffer[start:] 
                        break
                    
                    # Extraemos el frame íntegro
                    frame = buffer[start:end+2]
                    buffer = buffer[end+2:]
                    
                    # Enviamos con boundary de multipart/x-mixed-replace
                    yield b"--ffserver\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
                    
        except asyncio.CancelledError:
            pass
        finally:
            if mgr.preview_process == process:
                mgr.preview_process = None
            try:
                if process.returncode is None:
                    process.terminate()
                    try:
                        await asyncio.wait_for(process.wait(), timeout=1.5)
                    except asyncio.TimeoutError:
                        logger.warning(f"[PREVIEW] CH{source_id} FFmpeg ignoró SIGTERM. Matando (SIGKILL)...")
                        process.kill()
                        await process.wait()
            except Exception as e:
                logger.debug(f"[PREVIEW] Error limpiando proceso preview: {e}")

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=ffserver")

@app.post("/api/preview/stop/{source_id}")
async def api_preview_stop(source_id: str, token: str = Depends(verify_token)):
    mgr = get_mgr(source_id)
    if mgr.preview_process:
        try:
            if mgr.preview_process.returncode is None:
                mgr.preview_process.terminate()
                try:
                    await asyncio.wait_for(mgr.preview_process.wait(), timeout=1.5)
                except asyncio.TimeoutError:
                    logger.warning(f"[PREVIEW] CH{source_id} (stop) FFmpeg ignoró SIGTERM. Matando (SIGKILL)...")
                    mgr.preview_process.kill()
                    await mgr.preview_process.wait()
            logger.info(f"[PREVIEW] CH{source_id} detenido manualmente")
        except Exception as e:
            logger.error(f"[PREVIEW] Error al detener: {e}")
        finally:
            mgr.preview_process = None
    return {"status": "ok"}

# ── Detección automática de formato de señal ──────────────────────────────────
# Formatos soportados por el DeckLink Duo ordenados por prioridad de detección
DECKLINK_FORMATS = [
    {"code": "Hi59", "desc": "1920x1080i @ 29.97fps (SDI HD — más común en broadcast)"},
    {"code": "Hi50", "desc": "1920x1080i @ 25fps (SDI HD — PAL)"},
    {"code": "Hi60", "desc": "1920x1080i @ 30fps"},
    {"code": "Hp29", "desc": "1920x1080p @ 29.97fps"},
    {"code": "Hp25", "desc": "1920x1080p @ 25fps"},
    {"code": "Hp30", "desc": "1920x1080p @ 30fps"},
    {"code": "hp59", "desc": "1280x720p @ 59.94fps"},
    {"code": "hp50", "desc": "1280x720p @ 50fps"},
    {"code": "ntsc",  "desc": "720x486i @ 29.97fps (NTSC SD)"},
    {"code": "pal",   "desc": "720x576i @ 25fps (PAL SD)"},
]

async def _probe_format(input_name: str, fmt_code: str, timeout_sec: float = 6.0) -> dict:
    """Prueba un formato específico y detecta si hay señal activa."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-f", "decklink", "-duplex_mode", "half",
            "-video_input", "sdi", "-format_code", fmt_code,
            "-i", input_name, "-t", "2",
            "-f", "null", "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        try:
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_sec)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            stderr = b""
        output = stderr.decode(errors="replace")
        no_signal = "No input signal detected" in output
        # Si existe "Frame received" pero SIN "No input signal" → hay señal real
        has_frames = "Frame received" in output
        has_signal = has_frames and not no_signal
        return {"has_signal": has_signal, "no_signal_msg": no_signal, "output": output[:500]}
    except Exception as e:
        return {"has_signal": False, "no_signal_msg": False, "output": str(e)}

@app.get("/api/detect-format/{source_id}")
async def api_detect_format(source_id: str, token: str = Depends(verify_token)):
    """Detecta automáticamente el formato de señal SDI en el canal especificado.
    Prueba cada formato disponible y devuelve cuáles tienen señal activa."""
    mgr = managers.get(source_id)
    if not mgr:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    if mgr.is_recording():
        raise HTTPException(status_code=400, detail="Canal ocupado grabando — detén la grabación antes de detectar")

    logger.info(f"[DETECT] Iniciando detección de formato en CH{source_id} ({mgr.input_name})")
    results = []

    for fmt in DECKLINK_FORMATS:
        logger.info(f"[DETECT] Probando {fmt['code']} en {mgr.input_name}...")
        probe = await _probe_format(mgr.input_name, fmt["code"])
        results.append({
            "format_code": fmt["code"],
            "description": fmt["desc"],
            "has_signal": probe["has_signal"],
            "no_signal": probe["no_signal_msg"],
        })
        # Si encontramos señal activa, reportamos inmediatamente
        if probe["has_signal"]:
            logger.info(f"[DETECT] ✅ SEÑAL DETECTADA en CH{source_id} con formato {fmt['code']}")

    detected = [r for r in results if r["has_signal"]]
    logger.info(f"[DETECT] Detección completada. Formatos con señal: {[r['format_code'] for r in detected]}")

    return {
        "source_id": source_id,
        "input_name": mgr.input_name,
        "detected_formats": detected,
        "all_results": results,
        "recommendation": detected[0]["format_code"] if detected else None,
        "summary": f"{'✅ Señal detectada: ' + detected[0]['format_code'] if detected else '❌ Sin señal en ningún formato — verifica el cable SDI y la fuente de video'}"
    }

# ── Admin: Gestión de Usuarios y Grupos ──────────────────────────────────────
@app.get("/api/admin/groups")
async def get_groups():
    """Devuelve los nombres actuales de los grupos (público para la pantalla de login)."""
    return {
        "group1_name": USERS_DB["groups"]["1"]["name"],
        "group2_name": USERS_DB["groups"]["2"]["name"],
        "group3_name": USERS_DB["groups"]["3"]["name"],
        "group4_name": USERS_DB["groups"]["4"]["name"]
    }

@app.post("/api/admin/groups")
async def update_groups(req: GroupNamesRequest, token: str = Depends(require_admin)):
    if not req.group1_name.strip() or not req.group2_name.strip() or not req.group3_name.strip() or not req.group4_name.strip():
        raise HTTPException(status_code=400, detail="Los nombres de grupo no pueden estar vacíos.")
    async with users_db_lock:
        USERS_DB["groups"]["1"]["name"] = req.group1_name.strip()
        USERS_DB["groups"]["2"]["name"] = req.group2_name.strip()
        USERS_DB["groups"]["3"]["name"] = req.group3_name.strip()
        USERS_DB["groups"]["4"]["name"] = req.group4_name.strip()
    await _save_users_db()
    return {"status": "ok", "group1_name": req.group1_name.strip(), "group2_name": req.group2_name.strip(), "group3_name": req.group3_name.strip(), "group4_name": req.group4_name.strip()}

@app.get("/api/admin/users")
async def list_users(token: str = Depends(require_admin)):
    users = []
    for uname, udata in USERS_DB["users"].items():
        users.append({
            "username": uname,
            "role": udata["role"],
            "group": udata.get("group", ""),
            "group_name": USERS_DB["groups"].get(udata.get("group", ""), {}).get("name", "")
        })
    return {"users": users}

@app.post("/api/admin/users")
async def create_user(req: CreateUserRequest, token: str = Depends(require_admin)):
    if req.group not in ("1", "2", "3", "4"):
        raise HTTPException(status_code=400, detail="El grupo debe ser '1', '2', '3' o '4'.")
    if not req.username.strip():
        raise HTTPException(status_code=400, detail="El nombre de usuario no puede estar vacío.")
    if not req.password:
        raise HTTPException(status_code=400, detail="La contraseña no puede estar vacía.")
    uname = req.username.strip().lower()
    # No se puede duplicar con usuarios estáticos
    if uname in USERS or uname in USERS_DB["users"]:
        raise HTTPException(status_code=409, detail=f"El usuario '{uname}' ya existe.")
    new_token = secrets.token_hex(24)
    role = f"group{req.group}"
    async with users_db_lock:
        USERS_DB["users"][uname] = {
            "password": hash_password(req.password),
            "token": new_token,
            "role": role,
            "group": req.group
        }
    async with sessions_lock:
        ACTIVE_SESSIONS[uname] = []
    await _save_users_db()
    _rebuild_dynamic_maps()
    logger.info(f"[ADMIN] Usuario creado: {uname} ({role})")
    return {"status": "ok", "username": uname, "role": role}

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, token: str = Depends(require_admin)):
    async with users_db_lock:
        if username not in USERS_DB["users"]:
            raise HTTPException(status_code=404, detail="Usuario no encontrado.")
        del USERS_DB["users"][username]
    async with sessions_lock:
        ACTIVE_SESSIONS.pop(username, None)
    await _save_users_db()
    _rebuild_dynamic_maps()
    logger.info(f"[ADMIN] Usuario eliminado: {username}")
    return {"status": "ok"}

@app.get("/api/admin/stats")
async def get_stats(token: str = Depends(require_admin)):
    def _compute_recording_stats():
        # Contadores para los 4 canales
        ch_stats = {}
        for ch_id in ("1", "2", "3", "4"):
            ch_stats[ch_id] = {"files": 0, "size": 0, "duration": 0.0}

        for path_str, cache_val in list(DURATION_CACHE.items()):
            dur = cache_val[1]
            try:
                sz = os.path.getsize(path_str)
            except Exception:
                sz = 0
            for ch_id in ("1", "2", "3", "4"):
                if f"_CH{ch_id}_" in path_str:
                    ch_stats[ch_id]["files"] += 1
                    ch_stats[ch_id]["size"] += sz
                    ch_stats[ch_id]["duration"] += dur
                    break

        log_sizes = {}
        for ch_id in ("1", "2", "3", "4"):
            lf = managers[ch_id].log_file
            log_sizes[ch_id] = os.path.getsize(lf) if os.path.exists(lf) else 0

        return ch_stats, log_sizes

    ch_stats, log_sizes = await asyncio.to_thread(_compute_recording_stats)

    recent_logins = ACCESS_LOG[-50:]
    user_counts = {}
    user_fails = {}
    for entry in ACCESS_LOG:
        u = entry.get("username", "Desconocido")
        is_fail = (entry.get("role") == "fallido")
        
        if u not in user_counts: user_counts[u] = 0
        if u not in user_fails: user_fails[u] = 0
        
        if is_fail:
            user_fails[u] += 1
        else:
            user_counts[u] += 1

    return {
        "recordings": {
            f"ch{ch_id}": {
                "files": ch_stats[ch_id]["files"],
                "size_bytes": ch_stats[ch_id]["size"],
                "duration_sec": ch_stats[ch_id]["duration"]
            } for ch_id in ("1", "2", "3", "4")
        },
        "logs": {
            f"ch{ch_id}_bytes": log_sizes[ch_id] for ch_id in ("1", "2", "3", "4")
        },
        "access": {
            "total_logins": len(ACCESS_LOG),
            "recent": recent_logins,
            "distribution": user_counts,
            "distribution_fails": user_fails
        }
    }

# ── Endpoint para descargar certificado CA (debe ir ANTES del mount) ─────────
@app.get("/download-certificate")
async def download_ca_cert():
    """Endpoint para descargar el certificado CA root y eliminar warnings en otros dispositivos"""
    ca_file = os.path.join(_BASE_DIR, "certs", "vtv-ca-root.pem")
    if os.path.exists(ca_file):
        return FileResponse(
            ca_file, 
            media_type="application/x-pem-file",
            filename="vtv-ca-root.pem",
            headers={"Content-Disposition": "attachment; filename=vtv-ca-root.pem"}
        )
    raise HTTPException(status_code=404, detail="Certificado CA no encontrado")

# Static files debe ir al FINAL para no capturar otras rutas
app.mount("/", StaticFiles(directory=os.path.join(_BASE_DIR, "static"), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    
    # Servidor HTTP para red interna VTV
    logger.info("🌐 Iniciando servidor HTTP en puerto 8000")
    logger.info("� Red interna VTV - Sin cifrado SSL")
    logger.info("� Para HTTPS, consulta HTTPS_SETUP.md")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        log_level="info"
    )
