        // ── Interfaz Multi-Canal ──────────────────────────────────────────────────────
        function renderAllChannels() {
            ['1', '2', '3', '4'].forEach(id => {
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

            if (logAutoTimer || (!document.getElementById('logBox_1').textContent && !document.getElementById('logBox_2').textContent && !document.getElementById('logBox_3')?.textContent && !document.getElementById('logBox_4')?.textContent)) loadLog();
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
                    showToast('Sesión finalizada. Vuelve a iniciar sesión.', 'warning');
                    logout();
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
                let br3 = document.getElementById('bitrate_3')?.value || "15M";
                let br4 = document.getElementById('bitrate_4')?.value || "15M";
                let num1 = parseInt(br1.replace('M',''));
                let num2 = parseInt(br2.replace('M',''));
                let num3 = parseInt(br3.replace('M',''));
                let num4 = parseInt(br4.replace('M',''));
                
                let isC1Running = channels['1']?.running ? 1 : 0;
                let isC2Running = channels['2']?.running ? 1 : 0;
                let isC3Running = channels['3']?.running ? 1 : 0;
                let isC4Running = channels['4']?.running ? 1 : 0;
                
                let activeBitrateMbps = (num1 * isC1Running) + (num2 * isC2Running) + (num3 * isC3Running) + (num4 * isC4Running);
                if (activeBitrateMbps === 0) activeBitrateMbps = num1; // Si ambos parados, dar estimado base
                
                let MBps = (activeBitrateMbps * 1.5) / 8; // x1.5 x maxrate de ffmpeg vbr
                if (MBps === 0) MBps = 1;
                
                let hoursLeft = (freeGB * 1024) / MBps / 3600;
                
                const dr = document.getElementById('diskRemaining');
                if (dr) {
                    if (hoursLeft > 99) dr.textContent = "⏱ +99h restantes";
                    else if (hoursLeft < 1) dr.textContent = "⏱ " + Math.floor(hoursLeft * 60) + "min restantes";
                    else dr.textContent = "⏱ " + hoursLeft.toFixed(1) + "h restantes";
                    
                    if (freeGB < 50 && (isC1Running + isC2Running + isC3Running + isC4Running) > 0) playErrorBeep();
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
                const [r1, r2, r3, r4] = await Promise.all([
                    fetch('/api/status/1', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/2', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/3', { headers: { 'X-Token': TOKEN } }),
                    fetch('/api/status/4', { headers: { 'X-Token': TOKEN } })
                ]);
                if (!r1.ok || !r2.ok || !r3.ok || !r4.ok) { onNetFail(); return; }

                applyStatusData('1', await r1.json());
                applyStatusData('2', await r2.json());
                applyStatusData('3', await r3.json());
                applyStatusData('4', await r4.json());

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
                const role = localStorage.getItem(ROLE_KEY) || '';
                const uCh = localStorage.getItem(CHANNEL_KEY) || null;
                const isGroup = role.startsWith('group');
                const shouldHide = isGroup && (uCh !== id);
                
                if (shouldHide) {
                    b.className = 'hidden';
                } else {
                    if (c.running) {
                        b.className = 'px-3 py-1 rounded border border-red-500 bg-red-600 text-white animate-pulse font-black text-[10px] tracking-widest';
                        b.innerText = `● GRABANDO ${id}`;
                    } else {
                        b.className = 'px-3 py-1 rounded border border-slate-600 bg-slate-700 text-slate-400 font-bold text-[10px] tracking-widest';
                        b.innerText = `GRABANDO ${id}`;
                    }
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
                const isAdmin = localStorage.getItem(ROLE_KEY) === 'admin';
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
                const chColor = f.name.includes('CH1') ? 'text-red-400' : f.name.includes('CH2') ? 'text-blue-400' : f.name.includes('CH3') ? 'text-green-400' : f.name.includes('CH4') ? 'text-fuchsia-400' : 'text-slate-300';
                return `
            <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td class="py-2 pr-4 flex-1 truncate max-w-[200px] ${chColor}">${f.name}</td>
                <td class="py-2 pr-4 text-slate-400 text-right font-bold whitespace-nowrap">${f.duration > 0 ? fmtDuration(Math.round(f.duration)) : 'N/A'}</td>
                <td class="py-2 pr-4 text-slate-300 text-right whitespace-nowrap">${fmtBytes(f.size_bytes)}</td>
                <td class="py-2 pr-4 text-slate-400 text-right whitespace-nowrap">${fmtIso(f.created)}</td>
                <td class="py-2 text-right whitespace-nowrap flex gap-1 justify-end">
                    <button onclick="playVideo('${enc}')" class="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-2 py-1 rounded transition-colors" title="Reproducir">▶️</button>
                    <button onclick="downloadFile('${enc}')" class="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white px-2 py-1 rounded transition-colors" title="Descargar">⬇️</button>
                    ${isAdmin ? `<button onclick="deleteVideo('${enc}')" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-2 py-1 rounded transition-colors" title="Eliminar"><svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
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
                closeCleanupModal();
                loadFiles();
            } catch (e) { showToast('Error: ' + e, 'error'); }
            finally { btn.disabled = false; btn.textContent = oldText; }
        }

        async function runSpecificCleanup() {
            const pass = document.getElementById('cleanupPass').value;
            const dateVal = document.getElementById('cleanupSpecificDate').value;
            
            if (!pass) { showToast('Ingresa la contraseña de administrador.', 'warning'); return; }
            if (!dateVal) { showToast('Selecciona un día específico.', 'warning'); return; }

            // Convertir YYYY-MM-DD a DD-MM-YYYY
            const parts = dateVal.split('-');
            const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

            try {
                const chk = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ password: pass })
                });
                if (!chk.ok) { showToast('Contraseña incorrecta.', 'error'); return; }
            } catch (_) { showToast('Error de conexión al verificar contraseña.', 'error'); return; }

            if (!confirm(`¿Estás seguro de querer borrar todos los videos del día ${formattedDate}?`)) return;
            
            const btn = document.getElementById('btnSpecificCleanup');
            const oldText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Borrando...';
            try {
                const res = await fetch(`/api/cleanup/execute?specific_day=${formattedDate}`, { method: 'POST', headers: { 'X-Token': TOKEN } });
                const data = await res.json();
                if (res.ok) {
                    showToast(`Limpieza del día ${formattedDate} completada.`, 'success');
                    closeCleanupModal();
                    loadFiles();
                } else {
                    showToast('Error: ' + data.detail, 'error');
                }
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

        // Descarga autenticada via header (evita exponer el token en la URL)
        async function downloadFile(encName) {
            try {
                const res = await fetch(`/api/files/download?file=${encName}`, {
                    headers: { 'X-Token': TOKEN }
                });
                if (!res.ok) {
                    showToast('Error al descargar archivo.', 'error');
                    return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = decodeURIComponent(encName).split('/').pop();
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } catch (e) { showToast('Error de conexión al descargar.', 'error'); }
        }

        // --- VISTA PREVIA ---
        function _findJpegBoundary(buf, pattern, from = 0) {
            outer: for (let i = from; i <= buf.length - pattern.length; i++) {
                for (let j = 0; j < pattern.length; j++) {
                    if (buf[i + j] !== pattern[j]) continue outer;
                }
                return i;
            }
            return -1;
        }

        async function _streamMjpeg(url, imgEl, signal, onFirstFrame) {
            const res = await fetch(url, { signal, headers: { 'X-Token': TOKEN } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const reader = res.body.getReader();
            const SOI = new Uint8Array([0xFF, 0xD8]);
            const EOI = new Uint8Array([0xFF, 0xD9]);
            let buf = new Uint8Array(0);
            let firstFrameSent = false;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const merged = new Uint8Array(buf.length + value.length);
                merged.set(buf); merged.set(value, buf.length);
                buf = merged;
                while (buf.length > 3) {
                    const s = _findJpegBoundary(buf, SOI);
                    if (s === -1) { buf = new Uint8Array(0); break; }
                    const e = _findJpegBoundary(buf, EOI, s + 2);
                    if (e === -1) { if (s > 0) buf = buf.slice(s); break; }
                    const frame = buf.slice(s, e + 2);
                    buf = buf.slice(e + 2);
                    const blobUrl = URL.createObjectURL(new Blob([frame], { type: 'image/jpeg' }));
                    const prev = imgEl.src;
                    imgEl.src = blobUrl;
                    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                    // Ocultar el loader y notificar en el primer frame
                    if (!firstFrameSent) {
                        firstFrameSent = true;
                        document.getElementById('previewLoader')?.classList.add('hidden');
                        if (onFirstFrame) onFirstFrame();
                    }
                }
                if (buf.length > 2000000) buf = new Uint8Array(0); // safety valve
            }
        }

        function openPreview(id) {
            if (channels[id]?.running) {
                showToast(`Canal ${id} está grabando. Detén la grabación para ver la vista previa.`, 'warning');
                return;
            }
            activePreviewId = id;
            const modal = document.getElementById('modalPreview');
            const img = document.getElementById('previewImg');
            const loader = document.getElementById('previewLoader');

            document.getElementById('previewTitle').textContent = `Señal en Vivo: Canal ${id}`;
            loader.classList.remove('hidden');
            img.onload = () => loader.classList.add('hidden');
            modal.classList.remove('hidden');

            const controller = new AbortController();
            previewAbortController = controller;

            // Timeout: si no llega ningún frame en 10s mostrar error claro
            const previewTimeout = setTimeout(() => {
                if (previewAbortController) {
                    previewAbortController.abort();
                    previewAbortController = null;
                }
                const loader = document.getElementById('previewLoader');
                if (loader && !loader.classList.contains('hidden')) {
                    loader.innerHTML = `
                        <div class="flex flex-col items-center gap-3 text-center px-6">
                            <svg class="w-12 h-12 text-red-500 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                            <p class="text-red-400 font-black uppercase tracking-widest text-xs">Sin señal o canal ocupado</p>
                            <p class="text-slate-500 text-[10px]">Verifica que el canal no esté grabando y que haya señal SDI activa.</p>
                            <button onclick="closePreview()" class="mt-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-all">Cerrar</button>
                        </div>`;
                }
            }, 10000);

            _streamMjpeg(`/api/preview/${id}?t=${Date.now()}`, img, controller.signal, () => clearTimeout(previewTimeout))
                .then(() => clearTimeout(previewTimeout))
                .catch(e => {
                    clearTimeout(previewTimeout);
                    if (e.name !== 'AbortError') {
                        showToast('No se pudo cargar la vista previa. Verifica que el canal no esté ocupado.', 'error');
                        closePreview();
                    }
                });
        }

        async function closePreview() {
            const modal = document.getElementById('modalPreview');
            const img = document.getElementById('previewImg');
            const loader = document.getElementById('previewLoader');

            img.onload = null;
            if (previewAbortController) { previewAbortController.abort(); previewAbortController = null; }
            if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            img.src = '';
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
            ['1', '2', '3', '4'].forEach(ch => {
                if(ch !== USER_CHANNEL) {
                    const card = document.getElementById(`cardCH${ch}`);
                    if (card) card.classList.add('hidden');
                    const badge = document.getElementById(`badgeCH${ch}`);
                    if (badge) badge.classList.add('hidden');
                    const logSection = document.querySelector(`#logBox_${ch}`)?.closest('.flex.flex-col');
                    if (logSection) logSection.classList.add('hidden');
                }
            });
        }
