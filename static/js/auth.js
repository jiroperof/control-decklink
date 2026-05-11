        // ── Efecto Animado del Header (Scroll) ─────────────────────────────────────────
        let _scrollTicking = false;
        let _headerScrolled = null;
        window.addEventListener('scroll', () => {
            if (_scrollTicking) return;
            _scrollTicking = true;
            requestAnimationFrame(() => {
                const scrolled = window.scrollY > 20;
                if (scrolled === _headerScrolled) { _scrollTicking = false; return; }
                _headerScrolled = scrolled;

                const header = document.getElementById('mainHeader');
                if (!header) { _scrollTicking = false; return; }

                if (scrolled) {
                    header.classList.add('shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)]', 'border-slate-700/50', 'bg-slate-900/98');
                    header.classList.remove('bg-slate-900/80', 'border-transparent', 'shadow-sm');
                } else {
                    header.classList.remove('shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)]', 'border-slate-700/50', 'bg-slate-900/98');
                    header.classList.add('bg-slate-900/80', 'border-transparent', 'shadow-sm');
                }
                _scrollTicking = false;
            });
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
            
            t.className = `toast ${bg} ${border} ${textColor} border shadow-2xl rounded-xl px-4 py-2.5 flex items-center gap-3 text-xs font-bold w-max max-w-[300px]`;
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
        let USER_CHANNEL = null; // "1", "2", "3", "4", or null
        let metricsTimer = null, statusTimer = null;
        let activePreviewId = null;
        let previewAbortController = null;
        let _lastLogSize = { '1': 0, '2': 0, '3': 0, '4': 0 };
        let _lastProcHash = null;

        let channels = {
            '1': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false },
            '2': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false },
            '3': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false },
            '4': { running: false, elapsed: 0, timer: null, cfg: null, sch_start: null, sch_stop: null, auto: false, init_ui: false }
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

        // ── Theme Toggle ───────────────────────────────────────────────────────────
        const THEME_KEY = 'vtv_theme';

        function initTheme() {
            const saved = localStorage.getItem(THEME_KEY) || 'dark';
            document.documentElement.setAttribute('data-theme', saved);
            updateThemeIcon(saved);
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(THEME_KEY, next);
            updateThemeIcon(next);
            showToast(next === 'light' ? '☀️ Tema claro activado' : '🌙 Tema oscuro activado', 'info');
        }

        function updateThemeIcon(theme) {
            const sun = document.getElementById('themeIconSun');
            const moon = document.getElementById('themeIconMoon');
            if (sun && moon) {
                sun.classList.toggle('hidden', theme === 'dark');
                moon.classList.toggle('hidden', theme === 'light');
            }
        }

        // ── Sidebar Toggle ─────────────────────────────────────────────────────────
        const SIDEBAR_KEY = 'vtv_sidebar_collapsed';
        let _sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';

        function initSidebar() {
            _sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';
            updateSidebarState(false);
        }

        function toggleSidebar() {
            _sidebarCollapsed = !_sidebarCollapsed;
            localStorage.setItem(SIDEBAR_KEY, _sidebarCollapsed);
            updateSidebarState();
        }

        function updateSidebarState(animate = true) {
            const sidebar = document.getElementById('sidebar');
            const expanded = document.getElementById('sidebarExpanded');
            const collapsed = document.getElementById('sidebarCollapsed');
            const toggleBtn = document.getElementById('sidebarToggle');
            const iconCollapse = document.getElementById('sidebarIconCollapse');
            const iconExpand = document.getElementById('sidebarIconExpand');
            const toggleText = document.getElementById('sidebarToggleText');

            if (!sidebar || !expanded || !collapsed) return;

            if (_sidebarCollapsed) {
                sidebar.classList.remove('lg:w-[260px]');
                sidebar.classList.add('lg:w-[80px]');

                // Animar salida del panel expandido
                expanded.classList.add('hiding');
                setTimeout(() => {
                    expanded.classList.add('hidden');
                    expanded.classList.remove('hiding');

                    // Animar entrada del panel colapsado
                    collapsed.classList.add('start-hidden');
                    collapsed.classList.remove('hidden');
                    collapsed.classList.add('flex');
                    requestAnimationFrame(() => {
                        collapsed.classList.remove('start-hidden');
                        collapsed.classList.add('showing');
                        setTimeout(() => collapsed.classList.remove('showing'), 300);
                    });
                }, animate ? 220 : 0);

                if (toggleBtn) toggleBtn.classList.add('hidden');
            } else {
                sidebar.classList.remove('lg:w-[80px]');
                sidebar.classList.add('lg:w-[260px]');

                // Animar salida del panel colapsado
                collapsed.classList.add('hiding');
                setTimeout(() => {
                    collapsed.classList.add('hidden');
                    collapsed.classList.remove('flex');
                    collapsed.classList.remove('hiding');

                    // Animar entrada del panel expandido
                    expanded.classList.add('start-hidden');
                    expanded.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        expanded.classList.remove('start-hidden');
                        expanded.classList.add('showing');
                        setTimeout(() => expanded.classList.remove('showing'), 300);
                    });
                }, animate ? 220 : 0);

                expanded.classList.remove('hidden');
                if (toggleBtn) toggleBtn.classList.remove('hidden');
            }

            // Update toggle button icons (if visible)
            if (iconCollapse && iconExpand && toggleText) {
                iconCollapse.classList.toggle('hidden', _sidebarCollapsed);
                iconExpand.classList.toggle('hidden', !_sidebarCollapsed);
                toggleText.textContent = _sidebarCollapsed ? 'Expandir' : 'Colapsar';
            }
        }

        // ── Init ──────────────────────────────────────────────────────────────────────
        // ── Estado de canales en login (sin token, usa /health) ──────────────
        let _loginStatusTimer = null;

        async function updateLoginChannelStatus() {
            try {
                const res = await fetch('/health');
                if (!res.ok) return;
                const d = await res.json();
                const rec = d.recording || {};
                ['1','2','3','4'].forEach(id => {
                    const card = document.getElementById('loginCh' + id);
                    if (!card) return;
                    const dot  = card.querySelector('.login-ch-dot');
                    const lbl  = card.querySelector('.login-ch-lbl');
                    if (rec[id]) {
                        if (dot) { dot.className = 'login-ch-dot w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block'; }
                        if (lbl) { lbl.textContent = 'GRABANDO'; lbl.className = 'login-ch-lbl text-[8px] font-bold text-red-400 uppercase tracking-wide'; }
                    } else {
                        if (dot) { dot.className = 'login-ch-dot w-1.5 h-1.5 rounded-full bg-slate-700 inline-block'; }
                        if (lbl) { lbl.textContent = 'EN ESPERA'; lbl.className = 'login-ch-lbl text-[8px] font-bold text-slate-700 uppercase tracking-wide'; }
                    }
                });
            } catch (_) {}
        }

        document.addEventListener("DOMContentLoaded", () => {
            initTheme();
            initSidebar();
            initCompactMode();
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
                updateLoginChannelStatus();
                _loginStatusTimer = setInterval(updateLoginChannelStatus, 3000);
            }
        });
        // Carga los nombres de grupos desde el servidor para el login
        async function loadGroupNamesIntoLogin() {
            try {
                const res = await fetch('/api/admin/groups');
                if (!res.ok) return;
                const d = await res.json();
                const g1 = document.getElementById('btnRoleG1Label');
                const g2 = document.getElementById('btnRoleG2Label');
                const g3 = document.getElementById('btnRoleG3Label');
                const g4 = document.getElementById('btnRoleG4Label');
                const o1 = document.getElementById('newUserGroupOpt1');
                const o2 = document.getElementById('newUserGroupOpt2');
                const o3 = document.getElementById('newUserGroupOpt3');
                const o4 = document.getElementById('newUserGroupOpt4');
                const i1 = document.getElementById('inputG1Name');
                const i2 = document.getElementById('inputG2Name');
                const i3 = document.getElementById('inputG3Name');
                const i4 = document.getElementById('inputG4Name');
                if (g1) g1.textContent = d.group1_name;
                if (g2) g2.textContent = d.group2_name;
                if (g3) g3.textContent = d.group3_name;
                if (g4) g4.textContent = d.group4_name;
                if (o1) o1.textContent = `Grupo 1 — ${d.group1_name}`;
                if (o2) o2.textContent = `Grupo 2 — ${d.group2_name}`;
                if (o3) o3.textContent = `Grupo 3 — ${d.group3_name}`;
                if (o4) o4.textContent = `Grupo 4 — ${d.group4_name}`;
                if (i1) i1.value = d.group1_name;
                if (i2) i2.value = d.group2_name;
                if (i3) i3.value = d.group3_name;
                if (i4) i4.value = d.group4_name;
            } catch(e) { console.error('Error cargando nombres de grupos:', e); }
        }


        function restrictUIByRole() {
            const role = localStorage.getItem(ROLE_KEY);
            const isAdmin = role === 'admin';
            const isGroup = role && role.startsWith('group');
            USER_CHANNEL = localStorage.getItem(CHANNEL_KEY) || null;
            
            // Mostrar botón Administración y Estadísticas solo al admin a través del contenedor
            const adminToolsGrp = document.getElementById('adminToolsContainer');
            if (adminToolsGrp) {
                if (isAdmin) {
                    adminToolsGrp.classList.remove('hidden');
                    adminToolsGrp.classList.add('flex');
                } else {
                    adminToolsGrp.classList.remove('flex');
                    adminToolsGrp.classList.add('hidden');
                }
            }

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

            // Reset layout to defaults
            if (grid) {
                grid.style.gridTemplateColumns = '';
                grid.style.maxWidth = '';
                grid.style.margin = '';
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
                        grid.style.gridTemplateColumns = '';
                    }
                    // Layout is now handled by the responsive classes in index.html for the sidebar
                }
            }

            // Para grupos: mostrar bloques admin (ellos SÍ pueden iniciar/detener)
            if (isGroup) {
                document.querySelectorAll('.admin-ui-block').forEach(el => el.classList.remove('hidden'));
                
                // Ajustar grid para mostrar solo 1 canal
                if (grid) {
                    grid.style.gridTemplateColumns = '1fr';
                    grid.style.maxWidth = '1100px';
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
        // ── Auth ────────────────────────────────────────────────────────────────────
        async function login(force = false) {
            const btn = document.getElementById('btnLogin');
            const roleVal = document.getElementById('user').value;
            const p = document.getElementById('pass').value;
            const err = document.getElementById('loginError');
            if (!roleVal || !p) { const et = document.getElementById('loginErrorText'); if(et) et.textContent = 'Llena todos los campos'; err.classList.remove('hidden'); return; }

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
                localStorage.setItem(SESSION_KEY, SESSION_ID);
                localStorage.setItem(EXPIRE_KEY, Date.now() + SESSION_HOURS * 3600 * 1000);
                if (USER_CHANNEL) localStorage.setItem(CHANNEL_KEY, USER_CHANNEL);
                else localStorage.removeItem(CHANNEL_KEY);

                showDashboard();
                showToast("¡Sesión iniciada correctamente!", "success");
            } catch (_) {
                const et2 = document.getElementById('loginErrorText'); if(et2) et2.textContent = 'Error de conexión con el servidor.'; err.classList.remove('hidden');
            } finally {
                btn.disabled = false; btn.innerHTML = 'Iniciar Sesión';
            }
        }
        function showLoginErr(msg) {
            const el = document.getElementById('loginError');
            const et = document.getElementById('loginErrorText');
            if (et) et.textContent = msg;
            if (el) el.classList.remove('hidden');
        }

        // ── Logout ────────────────────────────────────────────────────────────────────
        function logout() {
            clearInterval(metricsTimer); clearInterval(statusTimer);
            clearInterval(logAutoTimer);
            Object.values(channels).forEach(c => clearInterval(c.timer));
            clearSession(); location.reload();
        }
