        // ... logic functions here or appended below


        // ── Efecto Animado del Header (Scroll) ─────────────────────────────────────────
        window.addEventListener('scroll', () => {
            const header = document.getElementById('mainHeader');
            const logo = document.getElementById('logoImg');
            const title = document.getElementById('headerTitle');
            const subtitle = document.getElementById('headerSubtitle');
            const titleBox = document.getElementById('headerTitleBox');
            if (!header) return;

            if (window.scrollY > 20) {
                header.classList.add('shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]', 'border-slate-700/60', 'bg-slate-900/95', 'py-1');
                header.classList.remove('bg-slate-900/80', 'border-transparent', 'shadow-sm', 'py-1.5');
                if (logo) { logo.classList.replace('h-6', 'h-5'); logo.classList.replace('md:h-7', 'md:h-6'); }
                if (title) { title.classList.replace('text-base', 'text-sm'); title.classList.replace('md:text-lg', 'md:text-base'); title.classList.replace('tracking-tighter', 'tracking-normal'); }
                if (subtitle) subtitle.classList.add('opacity-60');
            } else {
                header.classList.remove('shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]', 'border-slate-700/60', 'bg-slate-900/95', 'py-1', 'pt-6', 'pb-6', 'pt-3', 'pb-3');
                header.classList.add('bg-slate-900/80', 'border-transparent', 'shadow-sm', 'py-1.5');
                if (logo) { logo.classList.replace('h-5', 'h-6'); logo.classList.replace('md:h-6', 'md:h-7'); logo.classList.replace('h-8', 'h-6'); logo.classList.replace('h-11', 'h-6'); }
                if (title) { title.classList.replace('text-sm', 'text-base'); title.classList.replace('md:text-base', 'md:text-lg'); title.classList.replace('tracking-normal', 'tracking-tighter'); title.classList.replace('text-xl', 'text-base'); title.classList.replace('text-2xl', 'text-base'); }
                if (subtitle) subtitle.classList.remove('opacity-60');
            }
        });

        // ── Toasts y Alertas Sonoras ──────────────────────────────────────────────────
        function showToast(msg, type = 'info') {
            const container = document.getElementById('toastContainer');
            if (!container) return;
            const t = document.createElement('div');
            
            let bg = 'bg-slate-800/90', border = 'border-slate-600', icon = 'ℹ️', textColor = 'text-white';
            if (type === 'success') { bg = 'bg-green-900/90'; border = 'border-green-600'; icon = '✅'; textColor = 'text-green-100'; }
            if (type === 'error') { bg = 'bg-red-900/90'; border = 'border-red-600'; icon = '❌'; textColor = 'text-red-100'; }
            if (type === 'warning') { bg = 'bg-yellow-900/90'; border = 'border-yellow-600'; icon = '⚠️'; textColor = 'text-yellow-100'; }
            
            t.className = `toast ${bg} ${border} ${textColor} border backdrop-blur-md shadow-2xl rounded-2xl p-4 flex items-center gap-3 text-sm font-bold w-[340px]`;
            t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
            
            container.appendChild(t);
            setTimeout(() => {
                t.classList.add('hiding');
                t.addEventListener('animationend', () => t.remove());
            }, 4000);
        }
        
        let lastErrorBeep = 0;
        function playErrorBeep() {
            if (Date.now() - lastErrorBeep < 10000) return; // 10s cooldown
            lastErrorBeep = Date.now();
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if(!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "square";
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
            
            document.body.classList.add('ring-4', 'ring-red-600', 'ring-inset', 'transition-all', 'duration-100');
            setTimeout(() => document.body.classList.remove('ring-4', 'ring-red-600', 'ring-inset'), 800);
        }

        // ── Constantes y Estado Global ────────────────────────────────────────────────
        const TOKEN_KEY = 'vtv_token';
        const ROLE_KEY = 'vtv_role';
        const USER_KEY = 'vtv_user';
        const SESSION_KEY = 'vtv_session';
        const EXPIRE_KEY = 'vtv_exp';
        const CHANNEL_KEY = 'vtv_channel';
        const SESSION_HOURS = 8;
        const MAX_FAILS = 5;

        let TOKEN = null, failCount = 0, logAutoTimer = null;
        let ROLE = null;
        let USERNAME = null, SESSION_ID = null;
        let USER_CHANNEL = null; // "1", "2", or null
        let metricsTimer = null, statusTimer = null;
        let activePreviewId = null;
        let _lastLogSize = { '1': 0, '2': 0 };
        let _lastProcHash = null;

        let channels = {
            '1': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false },
            '2': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false }
        };

        // ── Auto-Logout por Inactividad ───────────────────────────────────────────────
        let idleSeconds = 0;
        function resetIdleTimer() { idleSeconds = 0; }
        ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'].forEach(e => {
            window.addEventListener(e, resetIdleTimer, true);
        });
        
        setInterval(() => {
            if (!TOKEN) return;
            idleSeconds++;
            if (idleSeconds >= 180) { // 3 minutos
                showToast("Sesión expirada por inactividad (3 minutos).", "warning");
                logout();
            }
        }, 1000);

        // ── Init ──────────────────────────────────────────────────────────────────────
        (function init() {
            const t = localStorage.getItem(TOKEN_KEY);
            const exp = parseInt(localStorage.getItem(EXPIRE_KEY) || '0', 10);
            if (t && Date.now() < exp) { TOKEN = t; showDashboard(); }
            else {
                clearSession();
                const u = document.getElementById('user');
                if (u) {
                    u.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('pass').focus(); });
                }
                const p = document.getElementById('pass');
                if (p) {
                    p.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
                }
            }
        })();

        // Carga los nombres de grupos desde el servidor para el login
        async function loadGroupNamesIntoLogin() {
            try {
                const res = await fetch('/api/admin/groups', { headers: { 'X-Token': 'public' } });
                // Si responde 401 normal (sin token), intentamos sin header
                const r2 = res.ok ? res : await fetch('/api/health');
                if (!res.ok) return;
                const d = await res.json();
                const g1 = document.getElementById('btnRoleG1Label');
                const g2 = document.getElementById('btnRoleG2Label');
                const o1 = document.getElementById('newUserGroupOpt1');
                const o2 = document.getElementById('newUserGroupOpt2');
                const i1 = document.getElementById('inputG1Name');
                const i2 = document.getElementById('inputG2Name');
                if (g1) g1.textContent = d.group1_name;
                if (g2) g2.textContent = d.group2_name;
                if (o1) o1.textContent = `Grupo 1 — ${d.group1_name}`;
                if (o2) o2.textContent = `Grupo 2 — ${d.group2_name}`;
                if (i1) i1.value = d.group1_name;
                if (i2) i2.value = d.group2_name;
            } catch(_) {}
        }


        function restrictUIByRole() {
            const role = localStorage.getItem(ROLE_KEY);
            const isAdmin = role === 'admin';
            const isGroup = role === 'group1' || role === 'group2';
            USER_CHANNEL = localStorage.getItem(CHANNEL_KEY) || null;
            
            // Mostrar botón Administración y Estadísticas solo al admin
            const btnAdmin = document.getElementById('btnAdminPanel');
            const btnStats = document.getElementById('btnStatsPanel');
            if (btnAdmin) btnAdmin.classList.toggle('hidden', !isAdmin);
            if (btnStats) btnStats.classList.toggle('hidden', !isAdmin);

            // Elementos Globales (Limpiar Disco)
            const btnClean = document.getElementById('btnCleanupConfig');
            if(btnClean) {
                btnClean.disabled = !isAdmin;
                if(!isAdmin) btnClean.classList.add('hidden');
            }

            // Ocultar sección completa de Logs para usuarios de grupos
            const logSectionMain = document.getElementById('logSectionMain');
            if (logSectionMain) logSectionMain.classList.toggle('hidden', isGroup);

            // Elementos de Layout Compartidos
            const grid = document.getElementById('gridCards');

            // Reset layout to defaults first
            if (grid) {
                grid.classList.remove('xl:grid-cols-[1fr_1fr]', 'xl:grid-cols-[1fr_260px]', 'lg:grid-cols-[1fr_260px]');
                grid.classList.add('xl:grid-cols-[1fr_1fr_260px]', 'lg:grid-cols-[1fr_1fr]');
                grid.style.maxWidth = 'none';
                grid.style.margin = '0';
            }

            if (!isAdmin) {
                // Para operator: ocultar bloques admin
                // Para group1/group2: también ocultar bloques admin (tienen sus propios permisos via API)
                document.querySelectorAll('.admin-ui-block').forEach(el => el.classList.add('hidden'));

                if (!isGroup) {
                    // Solo operador: compactar layout
                    document.querySelectorAll('.glass-panel.h-full').forEach(el => el.classList.remove('h-full'));
                    document.querySelectorAll('.mt-auto').forEach(el => el.classList.remove('mt-auto'));
                    if(grid) {
                        grid.classList.remove('xl:grid-cols-[1fr_1fr_260px]');
                        grid.classList.add('xl:grid-cols-[1fr_1fr]');
                    }
                    const resPanel = document.getElementById('resPanel');
                    if(resPanel) {
                        resPanel.classList.add('lg:col-span-2', 'xl:col-span-2', 'mt-4');
                        const resGlass = resPanel.querySelector('.glass-panel');
                        if(resGlass) {
                            resGlass.classList.remove('p-6');
                            resGlass.classList.add('p-3', 'md:p-4');
                        }
                        const metricsContainer = resPanel.querySelector('.flex.flex-col.gap-3');
                        if(metricsContainer) {
                            metricsContainer.className = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-4 px-2';
                        }
                    }
                }
            }

            // Para grupos: mostrar bloques admin (ellos SÍ pueden iniciar/detener)
            if (isGroup) {
                document.querySelectorAll('.admin-ui-block').forEach(el => el.classList.remove('hidden'));
                
                // Ajustar grid para centrar el único canal visible
                if (grid) {
                    grid.classList.remove('xl:grid-cols-[1fr_1fr_260px]', 'lg:grid-cols-[1fr_1fr]');
                    grid.classList.add('xl:grid-cols-[1fr_260px]', 'lg:grid-cols-[1fr_260px]');
                    grid.style.maxWidth = '1000px';
                    grid.style.margin = '0 auto';
                }

                // Ocultar el canal que NO les pertenece
                applyChannelFilter();
            }
        }

        function showDashboard() {
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('mainSection').classList.remove('hidden');
            USERNAME = localStorage.getItem(USER_KEY) || '';
            SESSION_ID = localStorage.getItem(SESSION_KEY) || '';
            USER_CHANNEL = localStorage.getItem(CHANNEL_KEY) || null;
            document.getElementById('roleBadge').textContent = USERNAME;
            // Mostrar IP dinámica del host actual en vez de una IP hardcodeada
            const ipLabel = document.getElementById('networkIpLabel');
            if (ipLabel) ipLabel.textContent = 'IP: ' + (window.location.hostname || 'localhost');
            restrictUIByRole();
            renderAllChannels();
            startUpdates();
        }

        function clearSession() {
            [TOKEN_KEY, ROLE_KEY, USER_KEY, SESSION_KEY, EXPIRE_KEY, CHANNEL_KEY].forEach(k => localStorage.removeItem(k));
            TOKEN = null; USERNAME = null; SESSION_ID = null; USER_CHANNEL = null;
            // Reset login form
            const u = document.getElementById('user');
            const p = document.getElementById('pass');
            if (u) u.value = '';
            if (p) p.value = '';
            const err = document.getElementById('loginError');
            if (err) err.classList.add('hidden');
            document.getElementById('loginSection').classList.remove('hidden');
            document.getElementById('mainSection').classList.add('hidden');
            setTimeout(() => { if (u) u.focus(); }, 100);
        }

        // ── Interfaz Multi-Canal ──────────────────────────────────────────────────────
        function renderAllChannels() {
            ['1', '2'].forEach(id => {
                const c = channels[id];
                const isAdmin = localStorage.getItem(ROLE_KEY) === 'admin';

                const sStart = document.getElementById('scheduleStart_' + id);
                const sStop = document.getElementById('scheduleStop_' + id);
                if (sStart && document.activeElement !== sStart && c.sch_start) sStart.value = c.sch_start.substring(11, 16);
                if (sStop && document.activeElement !== sStop && c.sch_stop) sStop.value = c.sch_stop.substring(11, 16);

                const b = document.getElementById('bitrate_' + id);
                const m = document.getElementById('minutes_' + id);
                const dp = document.getElementById('destPath_' + id);
                if (b) b.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);
                if (m) m.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);
                if (dp) dp.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);

                const btnD = document.getElementById('btnMinDec_' + id);
                const btnI = document.getElementById('btnMinInc_' + id);
                if (btnD) btnD.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);
                if (btnI) btnI.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);

                const btnReset = document.getElementById('btnResetDest_' + id);
                if (btnReset) btnReset.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);

                const btnS = document.getElementById('btnStart_' + id);
                const btnSt = document.getElementById('btnStop_' + id);
                if (btnS) btnS.disabled = c.running || (!isAdmin && USER_CHANNEL !== id);
                if (btnSt) btnSt.disabled = !c.running || (!isAdmin && USER_CHANNEL !== id);

                const btnP = document.getElementById('btnPreview_' + id);
                if (btnP) btnP.disabled = c.running;

                const durBox = document.getElementById('durationBox_' + id);
                if (durBox) {
                    if (c.running) {
                        durBox.classList.remove('opacity-50');
                        durBox.classList.add('opacity-100');
                        const dVal = document.getElementById('durationVal_' + id);
                        if (dVal) dVal.textContent = fmtDuration(c.elapsed);
                    } else {
                        durBox.classList.remove('opacity-100');
                        durBox.classList.add('opacity-50');
                        const dVal = document.getElementById('durationVal_' + id);
                        if (dVal) dVal.textContent = "00:00:00";
                    }
                }

                const ab = document.getElementById('autoRestartBanner_' + id);
                if (ab) ab.classList.toggle('hidden', !c.auto);

                const sb = document.getElementById('scheduleBanner_' + id);
                if (sb) {
                    if (c.sch_start || c.sch_stop) {
                        let msg = `⏰ P. Activa:`;
                        if (c.sch_start) msg += ` Inicio ${fmtIso(c.sch_start)}`;
                        if (c.sch_stop) msg += ` | Stop ${fmtIso(c.sch_stop)}`;
                        sb.textContent = msg; sb.classList.remove('hidden');
                    } else { sb.classList.add('hidden'); }
                }
            });

            if (logAutoTimer || (!document.getElementById('logBox_1').textContent && !document.getElementById('logBox_2').textContent)) loadLog();
        }

        // ── Auth ────────────────────────────────────────────────────────────────────
        async function login(force = false) {
            const btn = document.getElementById('btnLogin');
            const roleVal = document.getElementById('user').value;
            const p = document.getElementById('pass').value;
            const err = document.getElementById('loginError');
            if (!roleVal || !p) { err.textContent = 'Llena todos los campos'; err.classList.remove('hidden'); return; }

            btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Verificando…';
            err.classList.add('hidden');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: roleVal, password: p, force: force })
                });

                if (!res.ok) {
                    const e = await res.json();
                    err.textContent = res.status === 429 ? "Bloqueo por seguridad (Intenta en 5 min)." : e.detail; 
                    err.classList.remove('hidden');
                    btn.disabled = false; btn.innerHTML = 'Iniciar Sesión';
                    if(res.status === 429) {
                        playErrorBeep();
                    }
                    return;
                }
                const data = await res.json();
                TOKEN = data.token;
                ROLE = data.role;
                USERNAME = data.username;
                SESSION_ID = data.session_id;
                USER_CHANNEL = data.channel || null;

                localStorage.setItem(TOKEN_KEY, TOKEN);
                localStorage.setItem(ROLE_KEY, ROLE);
                localStorage.setItem(USER_KEY, USERNAME);
                localStorage.setItem('vtv_session', SESSION_ID);
                localStorage.setItem(EXPIRE_KEY, Date.now() + SESSION_HOURS * 3600 * 1000);
                if (USER_CHANNEL) localStorage.setItem(CHANNEL_KEY, USER_CHANNEL);
                else localStorage.removeItem(CHANNEL_KEY);

                showDashboard();
                showToast("¡Sesión iniciada correctamente!", "success");
            } catch (_) {
                err.textContent = 'Error de conexión con el servidor.'; err.classList.remove('hidden');
            } finally {
                btn.disabled = false; btn.innerHTML = 'Iniciar Sesión';
            }
        }
        function showLoginErr(msg) {
            const el = document.getElementById('loginError');
            if (el) { el.textContent = msg; el.classList.remove('hidden'); }
        }
        ['user', 'pass'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
        });

        // ── Logout ────────────────────────────────────────────────────────────────────
        function logout() {
            clearInterval(metricsTimer); clearInterval(statusTimer);
            clearInterval(logAutoTimer);
            Object.values(channels).forEach(c => clearInterval(c.timer));
            clearSession(); location.reload();
        }

        // ── Polling Global y Mantenimiento ─────────────────────────────────────────────
        function startUpdates() {
            updateMetrics(); updateStatus(); updateProcesses();
            metricsTimer = setInterval(() => { updateMetrics(); updateProcesses(); }, 2000);
            statusTimer = setInterval(updateStatus, 5000);
        }

        function onNetOk() { if (failCount > 0) { failCount = 0; document.getElementById('networkError').classList.add('hidden'); } }
        function onNetFail() {
            failCount++;
            document.getElementById('networkError').classList.remove('hidden');
            if (failCount >= MAX_FAILS) {
                clearInterval(metricsTimer); clearInterval(statusTimer);
                document.getElementById('networkError').textContent = '⚠ Servidor no responde. Recarga la página para reintentar.';
            }
        }

        async function updateMetrics() {
            try {
                const res = await fetch('/api/metrics', { headers: { 'X-Token': TOKEN, 'X-Username': USERNAME || '', 'X-Session-Id': SESSION_ID || '' } });
                if (res.status === 403) {
                    logout();
                    alert("Sesión finalizada.");
                    return;
                }
                if (!res.ok) { onNetFail(); return; }
                const d = await res.json();
                updateBar('cpu', d.cpu, 'cpu'); updateBar('ram', d.ram, 'ram');
                updateBar('gpu', d.gpu, 'gpu'); updateBar('vram', d.vram, 'vram');
                updateBar('disk', d.disk, 'disk');

                // Lógica de Tiempo Restante Predictivo
                const freeGB = d.disk_total * (1 - (d.disk / 100));
                let br1 = document.getElementById('bitrate_1')?.value || "15M";
                let br2 = document.getElementById('bitrate_2')?.value || "15M";
                let num1 = parseInt(br1.replace('M',''));
                let num2 = parseInt(br2.replace('M',''));
                
                let isC1Running = channels['1']?.running ? 1 : 0;
                let isC2Running = channels['2']?.running ? 1 : 0;
                
                let activeBitrateMbps = (num1 * isC1Running) + (num2 * isC2Running);
                if (activeBitrateMbps === 0) activeBitrateMbps = num1; // Si ambos parados, dar estimado base
                
                let MBps = (activeBitrateMbps * 1.5) / 8; // x1.5 x maxrate de ffmpeg vbr
                if (MBps === 0) MBps = 1;
                
                let hoursLeft = (freeGB * 1024) / MBps / 3600;
                
                const dr = document.getElementById('diskRemaining');
                if (dr) {
                    if (hoursLeft > 99) dr.textContent = "⏱ +99h restantes";
                    else if (hoursLeft < 1) dr.textContent = "⏱ " + Math.floor(hoursLeft * 60) + "min restantes";
                    else dr.textContent = "⏱ " + hoursLeft.toFixed(1) + "h restantes";
                    
                    if (freeGB < 50 && (isC1Running + isC2Running) > 0) playErrorBeep();
                }

                // Network specific update
                const nV = document.getElementById('netVal'); if (nV) nV.textContent = d.net_mbps + ' Mbps';
                const nB = document.getElementById('netBar'); if (nB) nB.style.width = d.net + '%';

                const cM = document.getElementById('cpuModel'); if (cM) cM.textContent = d.cpu_name || 'N/A';
                const rM = document.getElementById('ramModel'); if (rM) rM.textContent = (d.ram_total || '0') + ' GB';
                const gM = document.getElementById('gpuModel'); if (gM) gM.textContent = d.gpu_name || 'N/A';
                const vM = document.getElementById('vramModel'); if (vM) vM.textContent = (d.vram_total || '0') + ' GB';
                const dM = document.getElementById('diskModel'); if (dM) dM.textContent = (d.disk_total || '0') + ' GB';

                onNetOk();
            } catch (_) { onNetFail(); }
        }

        async function updateStatus() {
            try {
                const [r1, r2] = await Promise.all([
                    fetch('/api/status/1', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/2', { headers: { 'X-Token': TOKEN } })
                ]);
                if (!r1.ok || !r2.ok) { onNetFail(); return; }

                applyStatusData('1', await r1.json());
                applyStatusData('2', await r2.json());

                renderAllChannels();
                onNetOk();
            } catch (_) { onNetFail(); }
        }

        function applyStatusData(id, data) {
            let c = channels[id];
            c.running = data.running;
            c.sch_start = data.scheduled_start;
            c.sch_stop = data.scheduled_stop;
            c.auto = data.auto_restarted;

            // Deshabilitar Vista Previa si ya está grabando
            const btnP = document.getElementById('btnPreview_' + id);
            if (btnP) btnP.disabled = c.running;

            if (data.config) {
                c.cfg = data.config;
                if (!c.init_ui || c.running) {
                    const b = document.getElementById('bitrate_' + id);
                    const m = document.getElementById('minutes_' + id);
                    const d = document.getElementById('destPath_' + id);
                    if (b && c.cfg.bitrate) b.value = c.cfg.bitrate;
                    if (m && c.cfg.segment_minutes) m.value = c.cfg.segment_minutes;
                    if (d && c.cfg.dest_path) d.value = c.cfg.dest_path;
                    c.init_ui = true;
                }
            }

            const b = document.getElementById(`badgeCH${id}`);
            if (b) {
                const isHidden = b.classList.contains('hidden');
                if (c.running) {
                    b.className = 'px-3 py-1 rounded border border-red-500 bg-red-600 text-white animate-pulse font-black text-[10px] tracking-widest' + (isHidden ? ' hidden' : '');
                    b.innerText = `● GRABANDO ${id}`;
                } else {
                    b.className = 'px-3 py-1 rounded border border-slate-600 bg-slate-700 text-slate-400 font-bold text-[10px] tracking-widest' + (isHidden ? ' hidden' : '');
                    b.innerText = `GRABANDO ${id}`;
                }
            }

            if (c.running) {
                let base = data.elapsed_seconds || 0;
                if (!c.timer || Math.abs(c.elapsed - base) > 3) {
                    clearInterval(c.timer);
                    c.elapsed = base;
                    c.timer = setInterval(() => {
                        c.elapsed++;
                        const el = document.getElementById('durationVal_' + id);
                        if (el) el.textContent = fmtDuration(c.elapsed);
                    }, 1000);
                }
            } else {
                clearInterval(c.timer); c.timer = null; c.elapsed = 0;
            }
        }

        // ── Barras con alertas de umbral ──────────────────────────────────────────────
        function updateBar(id, val, type) {
            const rounded = Math.round(val);
            const vEl = document.getElementById(id + 'Val');
            if (vEl) vEl.textContent = rounded + '%';
            const bar = document.getElementById(id + 'Bar');
            if (bar) bar.style.width = rounded + '%';

            if (type === 'disk') {
                const title = document.getElementById('diskTitle');
                const alert = document.getElementById('diskAlert');
                if (title && alert) {
                    title.classList.remove('text-green-500', 'text-yellow-500', 'text-red-500');
                    if (rounded >= 59) {
                        title.classList.add('text-red-500');
                        alert.classList.remove('hidden');
                    } else if (rounded >= 36) {
                        title.classList.add('text-yellow-500');
                        alert.classList.add('hidden');
                    } else {
                        title.classList.add('text-green-500');
                        alert.classList.add('hidden');
                    }
                }
            }

            const colors = {
                cpu: rounded >= 95 ? 'bg-red-600' : rounded >= 85 ? 'bg-orange-500' : 'bg-green-500',
                ram: rounded >= 95 ? 'bg-red-600' : rounded >= 85 ? 'bg-orange-500' : 'bg-blue-500',
                disk: rounded >= 59 ? 'bg-red-600' : rounded >= 36 ? 'bg-yellow-500' : 'bg-green-500',
                gpu: 'bg-red-600',
                vram: 'bg-red-400',
            };
            if (bar) bar.className = `bar h-full ${colors[type] || 'bg-slate-500'}`;
        }

        // ── Monitor de procesos ───────────────────────────────────────────────────────
        const PROC_COLORS = { ffmpeg: 'text-red-400', python: 'text-blue-400', python3: 'text-blue-400', nvenc: 'text-yellow-400' };
        function procColor(name) {
            const n = (name || '').toLowerCase();
            for (const [key, cls] of Object.entries(PROC_COLORS)) { if (n.includes(key)) return cls; }
            return 'text-slate-300';
        }
        function procStatusDot(status) {
            if (status === 'running') return '<span class="text-green-400">●</span>';
            if (status === 'sleeping') return '<span class="text-slate-500">●</span>';
            return '<span class="text-yellow-400">●</span>';
        }
        async function updateProcesses() {
            try {
                const res = await fetch('/api/processes', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) return;
                const d = await res.json();

                // Prevent unnecessary DOM Reflows/Repaints
                const rawString = JSON.stringify(d.processes);
                if (_lastProcHash === rawString) return;
                _lastProcHash = rawString;

                const cnt = document.getElementById('procCount');
                if (cnt) cnt.textContent = `${d.count} proceso(s)`;
                const el = document.getElementById('procList');
                if (!el) return;
                if (!d.processes.length) { el.innerHTML = '<p class="text-slate-600 italic">Sin procesos detectados.</p>'; return; }
                el.innerHTML = d.processes.map(p => `
            <div class="flex items-center justify-between bg-slate-900/60 rounded-lg px-3 py-1.5 border border-slate-700/40">
                <div class="flex items-center gap-2 min-w-0">
                    ${procStatusDot(p.status)}
                    <span class="font-bold ${procColor(p.name)} truncate max-w-[80px]">${p.name}</span>
                    <span class="text-slate-600 text-[10px]">PID ${p.pid}</span>
                </div>
                <div class="flex gap-2 text-slate-400 shrink-0 ml-1 tabular-nums">
                    <span title="CPU" class="w-12 text-right text-[10px]">⚡${p.cpu}%</span>
                    <span title="RAM" class="w-16 text-right text-[10px]">🧠${p.mem_mb}MB</span>
                </div>
            </div>`).join('');
            } catch (_) { }
        }

        // ── Acciones (Por Canal) ──────────────────────────────────────────────────────
        async function execute(id, type) {
            const bs = document.getElementById('btnStart_' + id), bd = document.getElementById('btnStop_' + id);
            if (bs) bs.disabled = true;
            if (bd) bd.disabled = true;
            try {
                const body = type === 'start' ? JSON.stringify({
                    bitrate: document.getElementById('bitrate_' + id).value,
                    segment_minutes: parseInt(document.getElementById('minutes_' + id).value, 10),
                    dest_path: document.getElementById('destPath_' + id).value.trim() || '/home/administrador/Capturas',
                }) : null;

                channels[id].running = (type === 'start');
                renderAllChannels();

                const res = await fetch(`/api/${type}/${id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body
                });
                if (!res.ok) { 
                    try {
                        const e = await res.json(); 
                        showToast('Error: ' + (typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)), 'error'); 
                    } catch (parserErr) {
                        showToast('Error HTTP ' + res.status, 'error');
                    }
                }
            } catch (err) { showToast('Fallo Interno UI: ' + err.message, 'error'); console.error(err); }
            finally { updateStatus(); }
        }

        async function setSchedule(id) {
            const start = document.getElementById('scheduleStart_' + id).value;
            const stop = document.getElementById('scheduleStop_' + id).value;
            if (!start && !stop) { showToast('Ingresa al menos un horario para programar.', 'warning'); return; }
            try {
                const body = {
                    start_time: start || null,
                    stop_time: stop || null,
                    config: start ? {
                        bitrate: document.getElementById('bitrate_' + id).value,
                        segment_minutes: parseInt(document.getElementById('minutes_' + id).value, 10),
                        dest_path: document.getElementById('destPath_' + id).value.trim() || '/home/administrador/Capturas',
                    } : null
                };
                const res = await fetch(`/api/schedule/${id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify(body)
                });
                if (res.ok) { showToast(`Programación CH${id} guardada.`, 'success'); updateStatus(); }
                else { const e = await res.json(); showToast('Error: ' + (e.detail || 'Desconocido'), 'error'); }
            } catch (_) { showToast('Error de conexión.', 'error'); }
        }

        async function cancelSchedule(id) {
            try {
                await fetch(`/api/schedule/cancel/${id}`, { method: 'POST', headers: { 'X-Token': TOKEN } });
                document.getElementById('scheduleStart_' + id).value = '';
                document.getElementById('scheduleStop_' + id).value = '';
                updateStatus();
            } catch (_) { showToast('Error al cancelar programación.', 'error'); }
        }

        // ── Log viewer ────────────────────────────────────────────────────────────────
        async function loadLog() {
            const linesEl = document.getElementById('logLines');
            const lines = linesEl ? linesEl.value : 100;
            // Para usuarios de grupo, solo cargar el log de su canal
            const channelsToLoad = USER_CHANNEL ? [USER_CHANNEL] : ['1', '2'];
            await Promise.all(channelsToLoad.map(async (id) => {
                try {
                    const res = await fetch(`/api/log/${id}?lines=${lines}`, { headers: { 'X-Token': TOKEN } });
                    if (!res.ok) return;
                    const d = await res.json();

                    if (d.size_bytes === _lastLogSize[id]) return;
                    _lastLogSize[id] = d.size_bytes;

                    const box = document.getElementById('logBox_' + id);
                    if (box) {
                        box.textContent = d.lines.join('\n') || `(log vacío para CH${id})`;
                        box.scrollTop = box.scrollHeight;
                    }
                    const sz = document.getElementById('logSize_' + id);
                    if (sz) sz.textContent = `[${fmtBytes(d.size_bytes)} — ${d.total_lines_shown} líneas]`;
                } catch (_) { }
            }));
        }
        function toggleLogAuto() {
            clearInterval(logAutoTimer); logAutoTimer = null;
            const chk = document.getElementById('logAutoRefresh');
            if (chk && chk.checked) {
                loadLog(); logAutoTimer = setInterval(loadLog, 5000);
            }
        }

        // ── Historial de archivos ─────────────────────────────────────────────────────
        async function loadFiles() {
            const el = document.getElementById('filesTable');
            if (!el) return;
            el.innerHTML = '<span class="italic text-slate-500">Cargando...</span>';
            try {
                const res = await fetch('/api/files', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) { el.innerHTML = '<span class="text-red-400">Error al cargar archivos.</span>'; return; }
                const d = await res.json();
                const cnt = document.getElementById('filesCount');

                // Filtrar por canal si el usuario es de un grupo
                let files = d.files;
                if (USER_CHANNEL) {
                    files = files.filter(f => f.name.includes(`CH${USER_CHANNEL}`));
                }

                if (cnt) cnt.textContent = `${files.length} archivo(s) en ${d.dest_path}`;
                if (!files.length) { el.innerHTML = '<span class="italic text-slate-500">No hay archivos grabados aún.</span>'; return; }
                const isOp = localStorage.getItem(ROLE_KEY) === 'operator';
                el.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-xs min-w-[600px]">
            <thead><tr class="text-left text-slate-500 border-b border-slate-700 pb-2">
                <th class="pb-3 pr-4 uppercase">Archivo (Pestaña Global)</th>
                <th class="pb-3 pr-4 uppercase text-right">Duración</th>
                <th class="pb-3 pr-4 uppercase text-right">Tamaño</th>
                <th class="pb-3 pr-4 uppercase text-right">Fecha</th>
                <th class="pb-3 uppercase text-right">Acciones</th>
            </tr></thead>
            <tbody>${files.map(f => {
                const enc = encodeURIComponent(f.name);
                return `
            <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td class="py-2 pr-4 flex-1 truncate max-w-[200px] ${f.name.includes('CH1') ? 'text-red-400' : f.name.includes('CH2') ? 'text-blue-400' : 'text-green-400'}">${f.name}</td>
                <td class="py-2 pr-4 text-slate-400 text-right font-bold whitespace-nowrap">${f.duration > 0 ? fmtDuration(Math.round(f.duration)) : 'N/A'}</td>
                <td class="py-2 pr-4 text-slate-300 text-right whitespace-nowrap">${fmtBytes(f.size_bytes)}</td>
                <td class="py-2 pr-4 text-slate-400 text-right whitespace-nowrap">${fmtIso(f.created)}</td>
                <td class="py-2 text-right whitespace-nowrap flex gap-1 justify-end">
                    <button onclick="playVideo('${enc}')" class="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-2 py-1 rounded transition-colors" title="Reproducir">▶️</button>
                    <a href="/api/files/download?file=${enc}&token=${TOKEN}" class="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white px-2 py-1 rounded transition-colors" title="Descargar" download>⬇️</a>
                    ${!isOp ? `<button onclick="deleteVideo('${enc}')" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-2 py-1 rounded transition-colors" title="Eliminar"><svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                </td>
            </tr>`}).join('')}
            </tbody></table></div>`;
            } catch (_) { el.innerHTML = '<span class="text-red-400">Error de conexión.</span>'; }
        }

        // ── Collapsibles y Utilidades ─────────────────────────────────────────────────
        function toggleSection(id) {
            const body = document.getElementById(id);
            if (!body) return;
            const isOpen = body.classList.contains('open');
            body.classList.toggle('open', !isOpen);
            body.classList.toggle('closed', isOpen);
            const baseId = id.replace('Body', '');
            const chevron = document.getElementById(baseId + 'Chevron') || document.getElementById(id + 'Chevron');
            if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
        }

        function fmtDuration(s) {
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
        function fmtBytes(b) {
            if (b < 1024) return b + ' B';
            if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
            if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
            return (b / 1073741824).toFixed(2) + ' GB';
        }
        function fmtIso(iso) {
            try { return new Date(iso).toLocaleString('es-VE', { hour12: false }); } catch (_) { return iso; }
        }


        function adjMin(id, delta) {
            const el = document.getElementById('minutes_' + id);
            if (!el || el.disabled) return;
            let val = parseInt(el.value, 10);
            if (isNaN(val)) val = 1;
            val += delta;
            if (val < 1) val = 1;
            if (val > 120) val = 120;
            el.value = val;
        }

        function resetDestPath(id) {
            const el = document.getElementById('destPath_' + id);
            if (el && !el.disabled) el.value = '/home/administrador/Capturas';
        }

        // --- GESTORIAL DE LIMPIEZA ---
        async function openCleanupModal() {
            const res = await fetch('/api/cleanup/config', { headers: { 'X-Token': TOKEN } });
            const cfg = await res.json();
            document.getElementById('cleanupDays').value = cfg.retention_days;
            document.getElementById('modalCleanup').classList.remove('hidden');
        }
        function closeCleanupModal() {
            document.getElementById('modalCleanup').classList.add('hidden');
            document.getElementById('cleanupPass').value = '';
        }
        function changeCleanupDays(delta) {
            const input = document.getElementById('cleanupDays');
            let val = parseInt(input.value) + delta;
            if (val < 1) val = 1; if (val > 30) val = 30;
            input.value = val;
        }
        async function saveCleanupConfig() {
            const pass = document.getElementById('cleanupPass').value;
            if (!pass) { showToast('Ingresa la contraseña de administrador.', 'warning'); return; }

            // Verificación en el SERVIDOR, nunca en el cliente
            try {
                const chk = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ password: pass })
                });
                if (!chk.ok) { showToast('Contraseña incorrecta.', 'error'); return; }
            } catch (_) { showToast('Error de conexión al verificar contraseña.', 'error'); return; }

            const days = parseInt(document.getElementById('cleanupDays').value);
            await fetch('/api/cleanup/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                body: JSON.stringify({ retention_days: days })
            });
            showToast('Configuración guardada y protegida.', 'success');
            closeCleanupModal();
        }
        async function runManualCleanup() {
            const pass = document.getElementById('cleanupPass').value;
            if (!pass) { showToast('Ingresa la contraseña de administrador.', 'warning'); return; }

            // Verificación en el SERVIDOR
            try {
                const chk = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ password: pass })
                });
                if (!chk.ok) { showToast('Contraseña incorrecta.', 'error'); return; }
            } catch (_) { showToast('Error de conexión al verificar contraseña.', 'error'); return; }

            if (!confirm('¿Estás seguro de querer borrar todos los videos anteriores a hoy?')) return;
            const btn = document.getElementById('btnManualCleanup');
            const oldText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Borrando Todo...';
            try {
                // El backend ejecuta el script con el config actual.
                // Para asegurar que borre "todo" el pasado, primero guardamos config con 1 dia si es necesario.
                // O mejor, pasamos un parametro al backend.
                const res = await fetch('/api/cleanup/execute?force_all=true', { method: 'POST', headers: { 'X-Token': TOKEN } });
                const data = await res.json();
                showToast('Limpieza profunda completada.', 'success');
            } catch (e) { showToast('Error: ' + e, 'error'); }
            finally { btn.disabled = false; btn.textContent = oldText; }
        }

        function playVideo(encName) {
            const decName = decodeURIComponent(encName);
            const modal = document.getElementById('modalPlayer');
            const video = document.getElementById('vodPlayer');
            const title = document.getElementById('playerTitle');
            
            title.textContent = `▶️ ${decName}`;
            video.src = `/api/files/stream?file=${encName}&token=${TOKEN}`;
            modal.classList.remove('hidden');
            video.play().catch(e => showToast("Reproducción automática bloqueada. Usa play manual.", "warning"));
        }
        
        function closePlayer() {
            const modal = document.getElementById('modalPlayer');
            const video = document.getElementById('vodPlayer');
            video.pause();
            video.src = "";
            modal.classList.add('hidden');
        }

        async function deleteVideo(encName) {
            const pass = prompt(`Para borrar este archivo, ingresa clave de Operador/Admin:`);
            if (!pass) return;
            try {
                const res = await fetch('/api/files/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ filename: decodeURIComponent(encName), password: pass })
                });
                if (res.ok) {
                    showToast('Archivo eliminado exitosamente.', 'success');
                    loadFiles();
                } else {
                    const e = await res.json();
                    showToast('Error borrando archivo: ' + e.detail, 'error');
                }
            } catch (e) { showToast('Error de conexión', 'error'); }
        }

        // --- VISTA PREVIA ---
        function openPreview(id) {
            activePreviewId = id;
            const modal = document.getElementById('modalPreview');
            const img = document.getElementById('previewImg');
            const loader = document.getElementById('previewLoader');
            const title = document.getElementById('previewTitle');

            title.textContent = `Señal en Vivo: Canal ${id}`;
            img.onload = () => { loader.classList.add('hidden'); };
            img.onerror = () => {
                showToast('No se pudo cargar la vista previa. Asegúrate de que el canal no esté ocupado.', 'error');
                closePreview();
            };

            // El token se pasa por query string porque es un <img>. Añadimos cache-buster.
            img.src = `/api/preview/${id}?token=${TOKEN}&t=${Date.now()}`;
            modal.classList.remove('hidden');
        }

        async function closePreview() {
            const modal = document.getElementById('modalPreview');
            const img = document.getElementById('previewImg');
            const loader = document.getElementById('previewLoader');

            // Desvincular eventos antes de limpiar la fuente para evitar el bucle de "onerror"
            img.onload = null;
            img.onerror = null;
            img.src = ""; // Detiene el stream en el cliente
            
            modal.classList.add('hidden');
            loader.classList.remove('hidden');

            if (activePreviewId) {
                try {
                    await fetch('/api/preview/stop/' + activePreviewId, { method: 'POST', headers: { 'X-Token': TOKEN } });
                } catch (e) { console.error("Error stopping preview:", e); }
                activePreviewId = null;
            }
        }

        // ── Filtro de Canal por Grupo ─────────────────────────────────────────────────
        function applyChannelFilter() {
            if (!USER_CHANNEL) return;
            // Ocultar la tarjeta del canal que NO pertenece al grupo
            const hiddenCh = USER_CHANNEL === '1' ? '2' : '1';

            // Ocultar la tarjeta del canal ajeno mediante su ID estricto
            const card = document.getElementById(`cardCH${hiddenCh}`);
            if (card) card.classList.add('hidden');

            // Ocultar el badge del canal ajeno en el header
            const badge = document.getElementById(`badgeCH${hiddenCh}`);
            if (badge) badge.classList.add('hidden');

            // Ocultar el log del canal ajeno
            const logSection = document.querySelector(`#logBox_${hiddenCh}`)?.closest('.flex.flex-col');
            if (logSection) logSection.classList.add('hidden');
        }

        // ── Admin: Gestión de Usuarios ────────────────────────────────────────────────
        function openAdminModal() {
            document.getElementById('modalAdmin').classList.remove('hidden');
            loadGroupNamesIntoModal();
            loadAdminUsers();
        }
        function closeAdminModal() {
            document.getElementById('modalAdmin').classList.add('hidden');
        }
        function switchAdminTab(tab) {
            const isGrupos = tab === 'grupos';
            document.getElementById('tabGrupos').classList.toggle('hidden', !isGrupos);
            document.getElementById('tabUsuarios').classList.toggle('hidden', isGrupos);
            document.getElementById('tabBtnGrupos').className = `flex-1 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${isGrupos ? 'tab-active' : 'tab-inactive'}`;
            document.getElementById('tabBtnUsuarios').className = `flex-1 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${!isGrupos ? 'tab-active' : 'tab-inactive'}`;
        }
        async function loadGroupNamesIntoModal() {
            try {
                const res = await fetch('/api/admin/groups', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) return;
                const d = await res.json();
                const i1 = document.getElementById('inputG1Name');
                const i2 = document.getElementById('inputG2Name');
                if (i1) i1.value = d.group1_name;
                if (i2) i2.value = d.group2_name;
                // Update dropdown options
                const o1 = document.getElementById('newUserGroupOpt1');
                const o2 = document.getElementById('newUserGroupOpt2');
                if (o1) o1.textContent = `Grupo 1 — ${d.group1_name}`;
                if (o2) o2.textContent = `Grupo 2 — ${d.group2_name}`;
            } catch(_) {}
        }
        async function saveGroupNames() {
            const g1 = document.getElementById('inputG1Name').value.trim();
            const g2 = document.getElementById('inputG2Name').value.trim();
            if (!g1 || !g2) { showToast('Los nombres no pueden estar vacíos.', 'warning'); return; }
            try {
                const res = await fetch('/api/admin/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ group1_name: g1, group2_name: g2 })
                });
                if (res.ok) {
                    showToast('Nombres de grupos actualizados.', 'success');
                    // Update login buttons
                    const l1 = document.getElementById('btnRoleG1Label');
                    const l2 = document.getElementById('btnRoleG2Label');
                    if (l1) l1.textContent = g1;
                    if (l2) l2.textContent = g2;
                    loadGroupNamesIntoModal();
                } else { const e = await res.json(); showToast('Error: ' + e.detail, 'error'); }
            } catch(_) { showToast('Error de conexión.', 'error'); }
        }
        async function loadAdminUsers() {
            const container = document.getElementById('adminUsersList');
            if (!container) return;
            container.innerHTML = '<p class="text-slate-600 italic text-xs">Cargando...</p>';
            try {
                const res = await fetch('/api/admin/users', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) { container.innerHTML = '<p class="text-red-400 text-xs">Error al cargar usuarios.</p>'; return; }
                const d = await res.json();
                if (!d.users.length) {
                    container.innerHTML = '<p class="text-slate-500 italic text-xs">No hay usuarios creados aún.</p>';
                    return;
                }
                container.innerHTML = d.users.map(u => `
                    <div class="flex items-center justify-between bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-700/40">
                        <div>
                            <span class="font-black text-sm text-white">${u.username}</span>
                            <span class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${u.group === '1' ? 'bg-indigo-900/50 text-indigo-400 border border-indigo-700/50' : 'bg-cyan-900/50 text-cyan-400 border border-cyan-700/50'}">${u.group_name}</span>
                        </div>
                        <button onclick="deleteUser('${u.username}')" class="text-red-500/70 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-900/20" title="Eliminar">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>`).join('');
            } catch(_) { container.innerHTML = '<p class="text-red-400 text-xs">Error de conexión.</p>'; }
        }
        async function createUser() {
            const username = document.getElementById('newUserName').value.trim();
            const password = document.getElementById('newUserPass').value;
            const group = document.getElementById('newUserGroup').value;
            if (!username || !password) { showToast('Completa todos los campos.', 'warning'); return; }
            try {
                const res = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ username, password, group })
                });
                if (res.ok) {
                    showToast(`Usuario "${username}" creado exitosamente.`, 'success');
                    document.getElementById('newUserName').value = '';
                    document.getElementById('newUserPass').value = '';
                    loadAdminUsers();
                } else { const e = await res.json(); showToast('Error: ' + e.detail, 'error'); }
            } catch(_) { showToast('Error de conexión.', 'error'); }
        }
        async function deleteUser(username) {
            if (!confirm(`¿Eliminar al usuario "${username}"? Esta acción no se puede deshacer.`)) return;
            try {
                const res = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
                    method: 'DELETE',
                    headers: { 'X-Token': TOKEN }
                });
                if (res.ok) {
                    showToast(`Usuario "${username}" eliminado.`, 'success');
                    loadAdminUsers();
                } else { const e = await res.json(); showToast('Error: ' + e.detail, 'error'); }
            } catch(_) { showToast('Error de conexión.', 'error'); }
        }
        let storageChartInst = null;
        let usersChartInst = null;

        function openStatsModal() {
            document.getElementById('modalStats').classList.remove('hidden');
            document.getElementById('statsLoader').classList.remove('hidden');
            document.getElementById('statsContent').classList.add('hidden');
            document.body.style.overflow = 'hidden';
            fetchStats();
        }

        function closeStatsModal() {
            document.getElementById('modalStats').classList.add('hidden');
            document.body.style.overflow = 'auto';
            if(storageChartInst) storageChartInst.destroy();
            if(usersChartInst) usersChartInst.destroy();
        }

        async function fetchStats() {
            try {
                const res = await fetch('/api/admin/stats', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) {
                    showToast('Error cargando estadísticas. Verifica tus permisos.', 'error');
                    closeStatsModal();
                    return;
                }
                const data = await res.json();
                renderStats(data);
            } catch(e) {
                showToast('Fallo de conexión al cargar estadísticas.', 'error');
                closeStatsModal();
            }
        }

        function renderStats(data) {
            document.getElementById('statsLoader').classList.add('hidden');
            document.getElementById('statsContent').classList.remove('hidden');

            const rec = data.recordings;
            const totalBytes = rec.ch1.size_bytes + rec.ch2.size_bytes;
            const totalSecs = rec.ch1.duration_sec + rec.ch2.duration_sec;
            
            document.getElementById('kpiTotalSize').textContent = (totalBytes / 1073741824).toFixed(2) + ' GB';
            const h = Math.floor(totalSecs / 3600);
            const m = Math.floor((totalSecs % 3600) / 60);
            document.getElementById('kpiTotalHours').textContent = `${h}h ${m}m`;
            document.getElementById('kpiTotalLogins').textContent = data.access.total_logins;

            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = 'Inter, sans-serif';

            // Storage Chart
            const ctx1 = document.getElementById('storageChart').getContext('2d');
            if(storageChartInst) storageChartInst.destroy();
            storageChartInst = new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: ['Canal 1 (GB)', 'Canal 2 (GB)'],
                    datasets: [{
                        data: [(rec.ch1.size_bytes / 1073741824).toFixed(2), (rec.ch2.size_bytes / 1073741824).toFixed(2)],
                        backgroundColor: ['rgba(99, 102, 241, 0.8)', 'rgba(6, 182, 212, 0.8)'],
                        borderColor: ['#1e293b', '#1e293b'],
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });

            // Users Chart
            const ctx2 = document.getElementById('usersChart').getContext('2d');
            if(usersChartInst) usersChartInst.destroy();
            
            const dist = data.access.distribution;
            const userKeys = Object.keys(dist).sort((a,b) => dist[b] - dist[a]).slice(0, 15);
            const uData = userKeys.map(k => dist[k]);

            usersChartInst = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: userKeys,
                    datasets: [{
                        label: 'Inicios de sesión (Exitosos)',
                        data: uData,
                        backgroundColor: 'rgba(56, 189, 248, 0.7)',
                        borderColor: 'rgb(56, 189, 248)',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    scales: { 
                        y: { beginAtZero: true, grid: { color: 'rgba(51, 65, 85, 0.5)' } }, 
                        x: { grid: { display: false } } 
                    } 
                }
            });

            // Table
            const tb = document.getElementById('accessTableBody');
            tb.innerHTML = '';
            const recent = [...data.access.recent].reverse();
            recent.forEach(acc => {
                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-700/30 hover:bg-slate-700/40 transition-colors";
                const d = new Date(acc.timestamp * 1000).toLocaleString('es-ES');
                const roleColors = {
                    'admin': 'text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded border border-purple-700/50',
                    'operator': 'text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-700/50',
                    'group1': 'text-indigo-400 bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-700/50',
                    'group2': 'text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-700/50',
                    'fallido': 'text-red-400 bg-red-900/30 px-2 py-0.5 rounded border border-red-700/50'
                };
                const rStyle = roleColors[acc.role] || 'text-slate-400';
                const fRole = acc.role.toUpperCase();

                tr.innerHTML = `
                    <td class="py-3 px-2">${d}</td>
                    <td class="py-3 px-2 text-white font-bold">${acc.username}</td>
                    <td class="py-3 px-2"><span class="${rStyle} text-[9px] font-black">${fRole}</span></td>
                    <td class="py-3 px-2 text-slate-400 font-mono text-[10px]">${acc.ip}</td>
                `;
                tb.appendChild(tr);
            });
        }
