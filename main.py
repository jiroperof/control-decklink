import subprocess, os, re, signal, asyncio, logging, psutil, time, json, shlex, uuid, secrets
from datetime import datetime, date, timedelta
from datetime import time as dtime
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Request, Query, Header, Path as FastAPIPath
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S")
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
    "gpu": 0, "vram": 0, "vram_total": 0, "net": 0, "net_mbps": 0,
    "cpu_name": CPU_MODEL, "gpu_name": GPU_MODEL
}
cached_processes = {"processes": [], "count": 0}

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "duration_cache.json")
DURATION_CACHE: dict = {}
try:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            DURATION_CACHE = json.load(f)
except Exception as e:
    logger.error(f"Error cargando duration_cache: {e}")

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

# ── Usuarios y roles ──────────────────────────────────────────────────────────
USERS = {
    ADMIN_USER:   {"password": ADMIN_PASS,   "token": ACCESS_TOKEN,   "role": "admin"},
    OPERATOR_USER:{"password": OPERATOR_PASS,"token": OPERATOR_TOKEN, "role": "operator"},
}

# ── Base de datos de usuarios dinámicos ───────────────────────────────────────
_BASE_USERS_DIR = os.path.dirname(os.path.abspath(__file__))
USERS_DB_FILE = os.path.join(_BASE_USERS_DIR, "users_db.json")

DEFAULT_USERS_DB = {
    "groups": {
        "1": {"name": "Capturadora2.0I"},
        "2": {"name": "Capturadora2.0II"}
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

def _save_users_db():
    try:
        with open(USERS_DB_FILE, "w") as f:
            json.dump(USERS_DB, f, indent=2)
    except Exception as e:
        logger.error(f"Error guardando users_db: {e}")

USERS_DB = _load_users_db()

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
    ADMIN_USER: {"session_id": None, "last_ping": 0},
    OPERATOR_USER: {"session_id": None, "last_ping": 0}
}
TOKEN_TO_USER = {u["token"]: name for name, u in USERS.items()}

# Inicializar con usuarios dinámicos existentes
_rebuild_dynamic_maps()

# Brute force protection
LOGIN_ATTEMPTS = {}

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
    group: str  # "1" or "2"

class GroupNamesRequest(BaseModel):
    group1_name: str
    group2_name: str

# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_token(x_token: str = Header(None)):
    if x_token not in TOKEN_TO_ROLE:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return x_token

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
    return False

# ── RecordingManager Multicanal ───────────────────────────────────────────────
class RecordingManager:
    def __init__(self, source_id: str, input_name: str):
        self.source_id = source_id
        self.input_name = input_name
        _base_dir = os.path.dirname(os.path.abspath(__file__))
        self.log_file = os.path.join(_base_dir, f"ffmpeg_debug_{source_id}.log")
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
            os.rename(self.log_file, f"ffmpeg_debug_{self.source_id}_{ts}.log")

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
                except Exception:
                    pass  # stdin puede estar cerrado
                # SIGTERM al grupo de procesos como fallback
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except Exception:
                    pass
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
                except Exception:
                    pass
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
                self.preview_process.terminate()
                # No podemos await aquí, pero marcamos como None
            except Exception:
                pass
            self.preview_process = None
            time.sleep(1)  # dar tiempo al dispositivo de liberarse

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
            "-f", "decklink", "-duplex_mode", "half", "-video_input", "sdi", "-i", self.input_name,
            # Deinterlace + colorspace seguro
            "-vf", "bwdif=mode=send_field:parity=auto,format=yuv420p",
            "-af", "aresample=async=1000",
            # Codec de video: NVENC sin forzar level para evitar fallos (auto-level)
            "-c:v", "h264_nvenc", "-preset", "p4", "-tune", "hq", "-rc", "vbr",
            "-b:v", cfg.bitrate, "-maxrate:v", f"{int(bnum * 1.5)}M", "-bufsize:v", "120M",
            "-r", "30000/1001",        # 29.97 fps (nativo Decklink NTSC)
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

# Registramos los dos canales
managers = {
    "1": RecordingManager("1", "DeckLink Duo (1)"),
    "2": RecordingManager("2", "DeckLink Duo (2)")
}

def get_mgr(source_id: str) -> RecordingManager:
    if source_id not in managers:
        raise HTTPException(status_code=404, detail="Canal no encontrado (usa 1 o 2)")
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
                if AUTO_RESTART and old_cfg:
                    try:
                        ok, msg = await mgr.start(RecordConfig(**old_cfg))
                        mgr.auto_restarted = ok
                        logger.info(f"[CH{ch}] Auto-reinicio: {'OK' if ok else 'FALLO'} — {msg}")
                    except Exception as e:
                        logger.error(f"[CH{ch}] Error en auto-reinicio: {e}")

async def schedule_checker_task():
    while True:
        await asyncio.sleep(10)  # Granularidad de 10s para mayor precisión en horarios programados
        now = datetime.now()
        for ch, mgr in managers.items():
            if mgr.scheduled_start and not mgr.is_recording() and now >= mgr.scheduled_start:
                cfg = mgr.scheduled_config; mgr.scheduled_start = None
                if cfg: await mgr.start(cfg)
            if mgr.scheduled_stop and mgr.is_recording() and now >= mgr.scheduled_stop:
                mgr.scheduled_stop = None
                await mgr.stop_and_clean()

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

            cached_metrics.update({
                "cpu": cpu_val, 
                "ram": mem.percent, "ram_total": round(mem.total / (1024**3), 1),
                "disk": dsk.percent, "disk_total": round(dsk.total / (1024**3), 1),
                "gpu": gpu["load"], "vram": gpu["vram"], "vram_total": gpu["total_gb"],
                "net": min(100, round((mbps/1000)*100, 1)), "net_mbps": round(mbps, 1)
            })

            # Processes
            procs = await asyncio.to_thread(_get_processes_sync)
            cached_processes["processes"] = procs
            cached_processes["count"] = len(procs)

        except Exception as e:
            logger.error(f"Error en monitor task: {e}")

        await asyncio.sleep(2)

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
    yield
    for mgr in managers.values():
        if mgr.process: mgr._stop_sync()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="VTV - Capturadora Multicanal 2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.1", "recording": {k: v.is_recording() for k,v in managers.items()}}

@app.post("/api/login")
async def login(data: LoginRequest, request: Request):
    ip = request.client.host
    now = time.time()

    # Limpiar entradas de LOGIN_ATTEMPTS con más de 10 minutos de antigüedad (previene memory leak)
    stale = [k for k, v in LOGIN_ATTEMPTS.items() if now - v.get("lock_until", 0) > 600 and v.get("count", 0) == 0]
    for k in stale:
        LOGIN_ATTEMPTS.pop(k, None)

    # Rate limiting check
    attempt = LOGIN_ATTEMPTS.get(ip, {"count": 0, "lock_until": 0})
    if now < attempt["lock_until"]:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta en 5 min.")

    user_data = None
    real_user = data.username
    
    # Buscar en usuarios estáticos
    for uname, uinfo in USERS.items():
        if uname == data.username or (data.username == 'admin' and uinfo['role'] == 'admin') or (data.username == 'operador' and uinfo['role'] == 'operator'):
            user_data = uinfo
            real_user = uname
            break

    # Buscar en usuarios dinámicos si no se encontró
    if user_data is None:
        dyn = USERS_DB["users"].get(data.username)
        if dyn:
            user_data = dyn
            real_user = data.username

    if user_data and user_data["password"] == data.password:
        LOGIN_ATTEMPTS[ip] = {"count": 0, "lock_until": 0} # reset
        new_sess = str(uuid.uuid4())
        
        # Gestión de sesiones concurrentes por Rol
        role = user_data["role"]
        max_sess = 3 if role == "operator" else 1
        sessions = ACTIVE_SESSIONS.get(real_user, [])
        
        # Retrocompatibilidad rápida para el viejo esquema en memoria
        if isinstance(sessions, dict):
            sessions = [sessions]
        
        # Limpiar sesiones huérfanas (sin ping por más de 4 minutos)
        sessions = [s for s in sessions if type(s) is dict and "last_ping" in s and now - s["last_ping"] < 240]
        
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
    raise HTTPException(status_code=401, detail="Credenciales incorrectas")

@app.get("/api/metrics")
async def api_metrics(x_username: str = Header(None), x_session_id: str = Header(None), token: str = Depends(verify_token)):
    if x_username and x_session_id:
        sessions = ACTIVE_SESSIONS.get(x_username, [])
        if isinstance(sessions, dict):
            sessions = [sessions]

        my_session = next((s for s in sessions if type(s) is dict and s.get("session_id") == x_session_id), None)

        if not my_session:
            # Sesión no encontrada en memoria (p.ej. después de reinicio del servidor).
            # El token ya fue validado, así que re-registramos la sesión en lugar de botar al usuario.
            now = time.time()
            sessions = [s for s in sessions if type(s) is dict and "last_ping" in s and now - s["last_ping"] < 240]
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
async def api_status(source_id: str = FastAPIPath(..., pattern="^(1|2)$"), token: str = Depends(verify_token)):
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
async def api_start(config: RecordConfig, source_id: str = FastAPIPath(..., pattern="^(1|2)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr = get_mgr(source_id)
    ok, msg = await mgr.start(config)
    if not ok: raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "message": msg}

@app.post("/api/stop/{source_id}")
async def api_stop(source_id: str = FastAPIPath(..., pattern="^(1|2)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    await get_mgr(source_id).stop_and_clean()
    return {"status": "ok"}

@app.post("/api/schedule/{source_id}")
async def api_schedule(req: ScheduleRequest, source_id: str = FastAPIPath(..., pattern="^(1|2)$"), token: str = Depends(verify_token)):
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
async def api_schedule_cancel(source_id: str = FastAPIPath(..., pattern="^(1|2)$"), token: str = Depends(verify_token)):
    if not require_channel_access(source_id, token):
        raise HTTPException(status_code=403, detail="Acceso denegado a este canal.")
    mgr = get_mgr(source_id)
    mgr.scheduled_start = mgr.scheduled_stop = mgr.scheduled_config = None
    return {"status": "ok"}

@app.get("/api/log/{source_id}")
async def api_log(source_id: str = FastAPIPath(..., pattern="^(1|2)$"), lines: int = Query(default=100, ge=10, le=1000), token: str = Depends(verify_token)):
    lf = get_mgr(source_id).log_file
    if not os.path.exists(lf): return {"lines": [], "size_bytes": 0}
    def read_tail():
        sz = os.path.getsize(lf)
        with open(lf, "r", errors="replace") as f: content = f.readlines()[-lines:]
        return [l.rstrip() for l in content], sz
    content, size = await asyncio.to_thread(read_tail)
    return {"lines": content, "size_bytes": size, "total_lines_shown": len(content)}

# ── Gestión de Limpieza ───────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLEANUP_CONFIG = os.path.join(_BASE_DIR, "cleanup_config.json")
CLEANUP_SCRIPT = os.path.join(_BASE_DIR, "scripts", "cleanup.sh")

# ── Ruta base de grabaciones ──────────────────────────────────────────────────
def _resolve_dest_path() -> Path:
    """Determina la ruta base de grabaciones a partir de la configuración activa de cada canal."""
    dest = "/home/administrador/Capturas"
    for mgr in managers.values():
        if mgr.config and "dest_path" in mgr.config:
            dest = mgr.config["dest_path"]
            break
    return Path(dest).resolve()

@app.get("/api/cleanup/config")
async def get_cleanup_config(token: str = Depends(verify_token)):
    if not os.path.exists(CLEANUP_CONFIG): return {"retention_days": 2}
    with open(CLEANUP_CONFIG, "r") as f: return json.load(f)

@app.post("/api/cleanup/config")
async def save_cleanup_config(cfg: dict, token: str = Depends(require_admin)):
    with open(CLEANUP_CONFIG, "w") as f: json.dump(cfg, f, indent=2)
    return {"status": "ok"}

@app.post("/api/cleanup/execute")
async def execute_cleanup(force_all: bool = False, token: str = Depends(require_admin)):
    args = ["sudo", CLEANUP_SCRIPT]
    if force_all:
        args.append("--force-all")
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return {"status": "ok", "out": stdout.decode(), "err": stderr.decode()}

class VerifyPasswordRequest(BaseModel):
    password: str

@app.post("/api/verify-password")
async def verify_password(req: VerifyPasswordRequest, token: str = Depends(require_admin)):
    """Verifica que la contraseña proporcionada corresponde a algún usuario con rol admin.
    Permite que el frontend valide la contraseña SIN exponerla en el código fuente del cliente."""
    user_data = next((u for u in USERS.values() if u["password"] == req.password and u["role"] == "admin"), None)
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
            if path_str in DURATION_CACHE and DURATION_CACHE[path_str][0] == mtime:
                dur_sec = DURATION_CACHE[path_str][1]
            else:
                try:
                    res = subprocess.check_output([
                        "ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1", path_str
                    ], stderr=subprocess.STDOUT, timeout=1).decode().strip()
                    dur_sec = float(res) if res != "N/A" else 0.0
                except Exception:
                    pass
                DURATION_CACHE[path_str] = [mtime, dur_sec]
                cache_updated = True

            results.append({
                "name": str(f.relative_to(base)),
                "size_bytes": stat.st_size,
                "created": datetime.fromtimestamp(mtime).isoformat(),
                "duration": dur_sec
            })

        if cache_updated:
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
    safe_filename = filename.lstrip("/").replace("../", "")
    target = (base / safe_filename).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Ruta inválida")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return target

@app.get("/api/files/download")
async def api_download(file: str, token: str = Query(...)):
    if token not in TOKEN_TO_ROLE: raise HTTPException(status_code=401, detail="Token inválido")
    target = resolve_safe_path(file)
    return FileResponse(target, filename=target.name, content_disposition_type="attachment")

class DeleteReq(BaseModel):
    filename: str
    password: str

@app.post("/api/files/delete")
async def api_delete(req: DeleteReq, token: str = Depends(require_admin)):
    user_data = next((u for u in USERS.values() if u["password"] == req.password), None)
    if not user_data:
        raise HTTPException(status_code=401, detail="Clave incorrecta")
    target = resolve_safe_path(req.filename)
    try:
        target.unlink()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/files/stream")
async def api_stream(req: Request, file: str, token: str = Query(...)):
    if token not in TOKEN_TO_ROLE: raise HTTPException(status_code=401, detail="Token inválido")
    target = resolve_safe_path(file)
    file_size = target.stat().st_size
    range_header = req.headers.get("Range")
    
    if range_header:
        match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
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
async def api_preview(source_id: str, token: str = Query(...)):
    logger.info(f"[PREVIEW] Petición recibida para CH{source_id}")
    # Verificación de token manual ya que es para un <img> tag
    if token not in TOKEN_TO_ROLE:
        logger.warning(f"[PREVIEW] Token inválido: {token}")
        raise HTTPException(status_code=401, detail="Invalid token")
        
    mgr = managers.get(source_id)
    if not mgr:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    if mgr.is_recording():
        logger.warning(f"[PREVIEW] CH{source_id} está ocupado grabando")
        raise HTTPException(status_code=400, detail="Dispositivo ocupado grabando Master")

    # Comando FFmpeg para capturar frames de JPEG puros (uno tras otro)
    cmd = [
        "ffmpeg", "-f", "decklink", "-duplex_mode", "half", "-i", mgr.input_name,
        "-vf", "scale=640:-1", 
        "-vcodec", "mjpeg", "-q:v", "20", # q:v 20 para reducir ancho de banda
        "-f", "image2pipe", "-"
    ]
    
    logger.info(f"[PREVIEW] Iniciando FFmpeg (MANUAL): {' '.join(cmd)}")
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
                process.terminate()
                await process.wait()
            except:
                pass

    return StreamingResponse(frame_generator(), media_type="multipart/x-mixed-replace; boundary=ffserver")

@app.post("/api/preview/stop/{source_id}")
async def api_preview_stop(source_id: str, token: str = Depends(verify_token)):
    mgr = get_mgr(source_id)
    if mgr.preview_process:
        try:
            mgr.preview_process.terminate()
            await mgr.preview_process.wait()
            logger.info(f"[PREVIEW] CH{source_id} detenido manualmente")
        except Exception as e:
            logger.error(f"[PREVIEW] Error al detener: {e}")
        finally:
            mgr.preview_process = None
    return {"status": "ok"}

# ── Admin: Gestión de Usuarios y Grupos ──────────────────────────────────────
@app.get("/api/admin/groups")
async def get_groups():
    """Devuelve los nombres actuales de los grupos (público para la pantalla de login)."""
    return {
        "group1_name": USERS_DB["groups"]["1"]["name"],
        "group2_name": USERS_DB["groups"]["2"]["name"]
    }

@app.post("/api/admin/groups")
async def update_groups(req: GroupNamesRequest, token: str = Depends(require_admin)):
    if not req.group1_name.strip() or not req.group2_name.strip():
        raise HTTPException(status_code=400, detail="Los nombres de grupo no pueden estar vacíos.")
    USERS_DB["groups"]["1"]["name"] = req.group1_name.strip()
    USERS_DB["groups"]["2"]["name"] = req.group2_name.strip()
    _save_users_db()
    return {"status": "ok", "group1_name": req.group1_name.strip(), "group2_name": req.group2_name.strip()}

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
    if req.group not in ("1", "2"):
        raise HTTPException(status_code=400, detail="El grupo debe ser '1' o '2'.")
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
    USERS_DB["users"][uname] = {
        "password": req.password,
        "token": new_token,
        "role": role,
        "group": req.group
    }
    ACTIVE_SESSIONS[uname] = []
    _save_users_db()
    _rebuild_dynamic_maps()
    logger.info(f"[ADMIN] Usuario creado: {uname} ({role})")
    return {"status": "ok", "username": uname, "role": role}

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, token: str = Depends(require_admin)):
    if username not in USERS_DB["users"]:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    del USERS_DB["users"][username]
    ACTIVE_SESSIONS.pop(username, None)
    _save_users_db()
    _rebuild_dynamic_maps()
    logger.info(f"[ADMIN] Usuario eliminado: {username}")
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
