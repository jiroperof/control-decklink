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

            if (logAutoTimer || (['1','2','3','4'].every(id => !document.getElementById('logBox_' + id)?.textContent))) loadLog();
        }
        // ── Polling Global y Mantenimiento ─────────────────────────────────────────────
        function startUpdates() {
            updateMetrics(); updateStatus(); updateProcesses();
            metricsTimer = setInterval(() => { updateMetrics(); updateProcesses(); }, 2000);
            statusTimer = setInterval(updateStatus, 5000);
        }

        function updateConnStatus(connected) {
            const dot = document.getElementById('connDot');
            const text = document.getElementById('connText');
            if (dot) {
                dot.classList.remove('bg-green-500', 'bg-red-500', 'animate-pulse');
                dot.classList.add(connected ? 'bg-green-500' : 'bg-red-500');
                if (connected) dot.classList.add('animate-pulse');
            }
            if (text) {
                text.textContent = connected ? 'Conectado' : 'Sin conexión';
                text.classList.remove('text-slate-500', 'text-red-400');
                text.classList.add(connected ? 'text-slate-500' : 'text-red-400');
            }
        }

        function onNetOk() {
            if (failCount > 0) {
                failCount = 0;
                document.getElementById('networkError').classList.add('hidden');
            }
            updateConnStatus(true);
        }
        function onNetFail() {
            failCount++;
            document.getElementById('networkError').classList.remove('hidden');
            updateConnStatus(false);
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
                updateBar('disk2', d.disk2 ?? 0, 'disk2');

                // Actualizar métricas en sidebar colapsado
                const cc = document.getElementById('collapsedCpu');
                const cr = document.getElementById('collapsedRam');
                const cg = document.getElementById('collapsedGpu');
                const cv = document.getElementById('collapsedVram');
                const cd = document.getElementById('collapsedDisk');
                if (cc) cc.textContent = Math.round(d.cpu);
                if (cr) cr.textContent = Math.round(d.ram);
                if (cg) cg.textContent = Math.round(d.gpu);
                if (cv) cv.textContent = Math.round(d.vram);
                if (cd) cd.textContent = Math.round(100 - (d.disk2 ?? d.disk)); // % libre disco capturas

                // Actualizar modelos de discos
                const dM = document.getElementById('diskModel');
                if (dM) dM.textContent = (d.disk_total || '0') + ' GB';
                const d2M = document.getElementById('disk2Model');
                if (d2M) d2M.textContent = (d.disk2_free ?? 0) + ' GB libres';

                // Lógica de Tiempo Restante Predictivo (basado en disco de Capturas)
                const freeGB = d.disk2_free ?? (d.disk_total * (1 - (d.disk / 100)));
                let activeBitrateMbps = 0;
                let anyRunning = false;
                ['1', '2', '3', '4'].forEach(id => {
                    const brEl = document.getElementById('bitrate_' + id);
                    const bnum = parseInt((brEl?.value || '15M').replace('M', '')) || 15;
                    if (channels[id]?.running) { activeBitrateMbps += bnum; anyRunning = true; }
                });
                // Si no hay canales grabando, estimar con el bitrate configurado del CH1
                // pero sin aplicar overhead (es solo referencia de capacidad máxima)
                if (!anyRunning) {
                    const brEl1 = document.getElementById('bitrate_1');
                    activeBitrateMbps = parseInt((brEl1?.value || '15M').replace('M', '')) || 15;
                }

                // Factor overhead VBR real: ~1.05 promedio sostenido (no 1.5 que es solo el pico maxrate)
                const vbrOverhead = anyRunning ? 1.05 : 1.0;
                let MBps = (activeBitrateMbps * vbrOverhead) / 8; // Mbps → MB/s
                if (MBps === 0) MBps = 1;

                let hoursLeft = (freeGB * 1024) / MBps / 3600;

                const dr = document.getElementById('diskRemaining');
                if (dr) {
                    const label = anyRunning ? "restantes" : "cap. máx.";
                    if (hoursLeft > 999) dr.textContent = `⏱ +999h ${label}`;
                    else if (hoursLeft > 99) dr.textContent = `⏱ +99h ${label}`;
                    else if (hoursLeft < 1) dr.textContent = `⏱ ${Math.floor(hoursLeft * 60)}min ${label}`;
                    else dr.textContent = `⏱ ${hoursLeft.toFixed(1)}h ${label}`;

                    if (freeGB < 50 && anyRunning) playErrorBeep();
                }

                // Network specific update
                const nV = document.getElementById('netVal'); if (nV) nV.textContent = d.net_mbps + ' Mbps';
                const nB = document.getElementById('netBar'); if (nB) nB.style.width = d.net + '%';

                const cM = document.getElementById('cpuModel'); if (cM) cM.textContent = d.cpu_name || 'N/A';
                const rM = document.getElementById('ramModel'); if (rM) rM.textContent = (d.ram_total || '0') + ' GB';
                const gM = document.getElementById('gpuModel'); if (gM) gM.textContent = d.gpu_name || 'N/A';
                const vM = document.getElementById('vramModel'); if (vM) vM.textContent = (d.vram_total || '0') + ' GB';

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
                const isGroup = role && role.startsWith('group');
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

                // Actualizar banner de disco crítico
                const critBanner = document.getElementById('diskCriticalBanner');
                const critPercent = document.getElementById('diskCritPercent');
                if (critBanner && critPercent) {
                    const freePercent = 100 - rounded;
                    critPercent.textContent = freePercent + '%';
                    if (freePercent <= 10 && !_diskAlertDismissed) {
                        critBanner.classList.remove('hidden');
                    } else {
                        critBanner.classList.add('hidden');
                    }
                }
            }

            const colors = {
                cpu: rounded >= 95 ? 'bg-red-600' : rounded >= 85 ? 'bg-orange-500' : 'bg-green-500',
                ram: rounded >= 95 ? 'bg-red-600' : rounded >= 85 ? 'bg-orange-500' : 'bg-blue-500',
                disk: rounded >= 59 ? 'bg-red-600' : rounded >= 36 ? 'bg-yellow-500' : 'bg-green-500',
                disk2: rounded >= 85 ? 'bg-red-600' : rounded >= 65 ? 'bg-yellow-500' : 'bg-teal-500',
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

                // Actualizar badge de procesos en sidebar colapsado
                const cp = document.getElementById('collapsedProcs');
                if (cp) {
                    const ffmpegCount = d.processes.filter(p => p.name && p.name.toLowerCase().includes('ffmpeg')).length;
                    cp.textContent = ffmpegCount;
                    cp.className = `absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full text-[9px] flex items-center justify-center text-white font-black px-1 ${ffmpegCount > 0 ? 'bg-orange-500' : 'bg-slate-600'}`;
                }
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
            } catch (e) { 
                console.error('Error actualizando procesos:', e);
                const el = document.getElementById('procList');
                if (el && !el.innerHTML.includes('Error')) {
                    el.innerHTML = '<p class="text-yellow-500/70 italic text-[10px]">⚠ Sin datos de procesos</p>';
                }
            }
        }

        // ── Acciones (Por Canal) ──────────────────────────────────────────────────────
        async function execute(id, type) {
            const bs = document.getElementById('btnStart_' + id), bd = document.getElementById('btnStop_' + id);
            if (bs) bs.disabled = true;
            if (bd) bd.disabled = true;
            const actionLabel = type === 'start' ? 'Iniciando grabación' : 'Deteniendo grabación';
            showLoadingOverlay(`${actionLabel} CH${id}...`);
            try {
                const body = type === 'start' ? JSON.stringify({
                    bitrate: document.getElementById('bitrate_' + id).value,
                    segment_minutes: parseInt(document.getElementById('minutes_' + id).value, 10),
                    dest_path: document.getElementById('destPath_' + id).value.trim() || '/home/administrador/Capturas',
                }) : null;

                const prevRunning = channels[id].running;
                channels[id].running = (type === 'start');
                renderAllChannels();

                const res = await fetch(`/api/${type}/${id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN }, body
                });
                if (!res.ok) {
                    channels[id].running = prevRunning;
                    renderAllChannels();
                    try {
                        const e = await res.json(); 
                        showToast('Error: ' + (typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)), 'error'); 
                    } catch (parserErr) {
                        showToast('Error HTTP ' + res.status, 'error');
                    }
                }
            } catch (err) { showToast('Fallo Interno UI: ' + err.message, 'error'); console.error(err); }
            finally { 
                hideLoadingOverlay();
                updateStatus(); 
            }
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
        let _allFiles = []; // Almacena todos los archivos para filtrado
        let _filesDestPath = '/home/administrador/Capturas';

        function renderFilesTable(files) {
            const el = document.getElementById('filesTable');
            const cnt = document.getElementById('filesCount');
            if (!el) return;

            // Actualizar contador
            const searchVal = document.getElementById('fileSearch')?.value?.trim();
            if (cnt) {
                if (searchVal) {
                    cnt.textContent = `${files.length} resultado(s) de ${_allFiles.length} total`;
                    cnt.classList.add('text-red-400');
                    cnt.classList.remove('text-slate-500');
                } else {
                    cnt.textContent = `${files.length} archivo(s)`;
                    cnt.classList.remove('text-red-400');
                    cnt.classList.add('text-slate-500');
                }
            }

            if (!files.length) {
                el.innerHTML = searchVal
                    ? `<span class="italic text-slate-500 flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> No hay resultados para "${searchVal}"</span>`
                    : '<span class="italic text-slate-500">No hay archivos grabados aún.</span>';
                return;
            }

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
                return `
            <tr class="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                <td class="py-2 pr-4 flex-1 truncate max-w-[200px] ${f.name.includes('CH1') ? 'text-red-400' : f.name.includes('CH2') ? 'text-blue-400' : f.name.includes('CH3') ? 'text-yellow-400' : f.name.includes('CH4') ? 'text-purple-400' : 'text-slate-300'}">${f.name}</td>
                <td class="py-2 pr-4 text-slate-400 text-right font-bold whitespace-nowrap">${f.duration > 0 ? fmtDuration(Math.round(f.duration)) : 'N/A'}</td>
                <td class="py-2 pr-4 text-slate-300 text-right whitespace-nowrap">${fmtBytes(f.size_bytes)}</td>
                <td class="py-2 pr-4 text-slate-400 text-right whitespace-nowrap">${fmtIso(f.created)}</td>
                <td class="py-2 text-right whitespace-nowrap flex gap-1 justify-end">
                    <button onclick="playVideo('${enc}')" class="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white px-2 py-1 rounded transition-colors" title="Reproducir">▶️</button>
                    <a href="/api/files/download?file=${enc}&token=${TOKEN}" class="bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white px-2 py-1 rounded transition-colors" title="Descargar" download>⬇️</a>
                    ${isAdmin ? `<button onclick="deleteVideo('${enc}')" class="bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white px-2 py-1 rounded transition-colors" title="Eliminar"><svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                </td>
            </tr>`}).join('')}
            </tbody></table></div>`;
        }

        async function loadFiles() {
            const el = document.getElementById('filesTable');
            if (!el) return;
            el.innerHTML = '<span class="italic text-slate-500">Cargando...</span>';
            try {
                const res = await fetch('/api/files', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) { el.innerHTML = '<span class="text-red-400">Error al cargar archivos.</span>'; return; }
                const d = await res.json();
                _filesDestPath = d.dest_path || '/home/administrador/Capturas';

                // Filtrar por canal si el usuario es de un grupo
                let files = d.files;
                if (USER_CHANNEL) {
                    files = files.filter(f => f.name.includes(`CH${USER_CHANNEL}`));
                }

                _allFiles = files;

                // Limpiar búsqueda al recargar
                const searchInput = document.getElementById('fileSearch');
                if (searchInput) searchInput.value = '';

                renderFilesTable(files);
            } catch (_) { el.innerHTML = '<span class="text-red-400">Error de conexión.</span>'; }
        }

        function filterFiles() {
            const searchInput = document.getElementById('fileSearch');
            if (!searchInput) return;
            const query = searchInput.value.toLowerCase().trim();

            if (!query) {
                renderFilesTable(_allFiles);
                return;
            }

            const filtered = _allFiles.filter(f =>
                f.name.toLowerCase().includes(query) ||
                f.created.toLowerCase().includes(query) ||
                fmtIso(f.created).toLowerCase().includes(query)
            );
            renderFilesTable(filtered);
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
        let _diskAlertDismissed = false;

        function dismissDiskAlert() {
            _diskAlertDismissed = true;
            const banner = document.getElementById('diskCriticalBanner');
            if (banner) banner.classList.add('hidden');
            showToast('Alerta de disco ignorada temporalmente', 'warning');
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
            try {
                const res = await fetch('/api/cleanup/config', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) { showToast('Error cargando configuración.', 'error'); return; }
                const cfg = await res.json();
                document.getElementById('cleanupDays').value = cfg.retention_days ?? 2;
                const dg = cfg.disk_guard || {};
                const toggle = document.getElementById('diskGuardEnabled');
                if (toggle) toggle.checked = !!dg.enabled;
                const trigger = document.getElementById('diskGuardTrigger');
                if (trigger) trigger.value = dg.trigger_percent ?? 92;
                const target = document.getElementById('diskGuardTarget');
                if (target) target.value = dg.target_percent ?? 88;
                const interval = document.getElementById('diskGuardInterval');
                if (interval) interval.value = dg.check_interval_sec ?? 30;
                const maxDel = document.getElementById('diskGuardMaxDelete');
                if (maxDel) maxDel.value = dg.max_delete_files ?? 10;
            } catch (_) { showToast('Error de conexión al abrir configuración.', 'error'); return; }
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
        async function saveDiskGuardConfig() {
            const pass = document.getElementById('cleanupPass').value;
            if (!pass) { showToast('Ingresa la contraseña de administrador.', 'warning'); return; }
            try {
                const chk = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ password: pass })
                });
                if (!chk.ok) { showToast('Contraseña incorrecta.', 'error'); return; }
            } catch (_) { showToast('Error de conexión al verificar contraseña.', 'error'); return; }

            const payload = {
                disk_guard: {
                    enabled: document.getElementById('diskGuardEnabled').checked,
                    trigger_percent: parseInt(document.getElementById('diskGuardTrigger').value),
                    target_percent: parseInt(document.getElementById('diskGuardTarget').value),
                    check_interval_sec: parseInt(document.getElementById('diskGuardInterval').value),
                    max_delete_files: parseInt(document.getElementById('diskGuardMaxDelete').value),
                }
            };
            try {
                const res = await fetch('/api/cleanup/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify(payload)
                });
                if (res.ok) showToast('Guardián de disco guardado.', 'success');
                else { const e = await res.json(); showToast('Error: ' + (e.detail || 'Desconocido'), 'error'); }
            } catch (_) { showToast('Error de conexión.', 'error'); }
        }

        async function runSpecificCleanup() {
            const pass = document.getElementById('cleanupPass').value;
            if (!pass) { showToast('Ingresa la contraseña de administrador.', 'warning'); return; }
            const dateVal = document.getElementById('cleanupSpecificDate').value;
            if (!dateVal) { showToast('Selecciona una fecha antes de borrar.', 'warning'); return; }
            try {
                const chk = await fetch('/api/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ password: pass })
                });
                if (!chk.ok) { showToast('Contraseña incorrecta.', 'error'); return; }
            } catch (_) { showToast('Error de conexión al verificar contraseña.', 'error'); return; }

            if (!confirm(`¿Borrar todos los videos del día ${dateVal}?`)) return;
            const btn = document.getElementById('btnSpecificCleanup');
            const oldText = btn.textContent;
            btn.disabled = true; btn.textContent = 'Borrando…';
            showLoadingOverlay(`Eliminando videos del ${dateVal}...`);
            try {
                const res = await fetch(`/api/cleanup/execute?specific_day=${encodeURIComponent(dateVal)}`, {
                    method: 'POST', headers: { 'X-Token': TOKEN }
                });
                if (res.ok) showToast(`Limpieza del día ${dateVal} completada.`, 'success');
                else { const e = await res.json(); showToast('Error: ' + (e.detail || 'Desconocido'), 'error'); }
            } catch (e) { showToast('Error: ' + e, 'error'); }
            finally { 
                hideLoadingOverlay();
                btn.disabled = false; btn.textContent = oldText; 
            }
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
            showLoadingOverlay('Ejecutando limpieza profunda...');
            try {
                // El backend ejecuta el script con el config actual.
                // Para asegurar que borre "todo" el pasado, primero guardamos config con 1 dia si es necesario.
                // O mejor, pasamos un parametro al backend.
                const res = await fetch('/api/cleanup/execute?force_all=true', { method: 'POST', headers: { 'X-Token': TOKEN } });
                const data = await res.json();
                showToast('Limpieza profunda completada.', 'success');
            } catch (e) { showToast('Error: ' + e, 'error'); }
            finally { 
                hideLoadingOverlay();
                btn.disabled = false; btn.textContent = oldText; 
            }
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
        let previewFirstFrameLoaded = false;

        async function streamMjpeg(id, img, loader) {
            if (previewAbortController) {
                previewAbortController.abort();
            }
            previewAbortController = new AbortController();
            const signal = previewAbortController.signal;
            previewFirstFrameLoaded = false;

            let response;
            try {
                response = await fetch(`/api/preview/${id}`, {
                    headers: { 'X-Token': TOKEN },
                    signal
                });
            } catch (e) {
                if (e.name !== 'AbortError') {
                    showToast('No se pudo conectar al stream de vista previa.', 'error');
                    closePreview();
                }
                return;
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                showToast('Error preview: ' + (errData.detail || response.status), 'error');
                closePreview();
                return;
            }

            const reader = response.body.getReader();
            let buffer = new Uint8Array(0);

            const append = (a, b) => {
                const tmp = new Uint8Array(a.length + b.length);
                tmp.set(a, 0); tmp.set(b, a.length);
                return tmp;
            };

            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer = append(buffer, value);

                    // Find complete JPEG frames: SOI=0xFFD8 ... EOI=0xFFD9
                    while (true) {
                        let start = -1;
                        for (let i = 0; i < buffer.length - 1; i++) {
                            if (buffer[i] === 0xFF && buffer[i+1] === 0xD8) { start = i; break; }
                        }
                        if (start === -1) { buffer = new Uint8Array(0); break; }

                        let end = -1;
                        for (let i = start + 2; i < buffer.length - 1; i++) {
                            if (buffer[i] === 0xFF && buffer[i+1] === 0xD9) { end = i + 1; break; }
                        }
                        if (end === -1) {
                            if (buffer.length > 500000) buffer = buffer.slice(start);
                            break;
                        }

                        const frame = buffer.slice(start, end + 1);
                        buffer = buffer.slice(end + 1);

                        const blob = new Blob([frame], { type: 'image/jpeg' });
                        const url = URL.createObjectURL(blob);
                        const oldUrl = img.src;

                        // Solo en el primer frame, esperar a cargar antes de ocultar loader
                        if (!previewFirstFrameLoaded) {
                            img.onload = () => {
                                loader.classList.add('hidden');
                                previewFirstFrameLoaded = true;
                                img.onload = null; // Limpiar handler
                            };
                        }

                        img.src = url;
                        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('[PREVIEW] Stream error:', e);
                }
            } finally {
                reader.cancel().catch(() => {});
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
            const title = document.getElementById('previewTitle');

            title.textContent = `Señal en Vivo: Canal ${id}`;
            loader.classList.remove('hidden');
            img.src = '';
            modal.classList.remove('hidden');

            streamMjpeg(id, img, loader);
        }

        async function closePreview() {
            const modal = document.getElementById('modalPreview');
            const img = document.getElementById('previewImg');
            const loader = document.getElementById('previewLoader');

            // Abortar el fetch stream en curso
            if (previewAbortController) {
                previewAbortController.abort();
                previewAbortController = null;
            }

            // Revocar blob URL si existe
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
            // Ocultar todas las tarjetas, badges y logs que NO pertenecen al grupo
            ['1', '2', '3', '4'].forEach(id => {
                if (id === USER_CHANNEL) return;
                const card = document.getElementById(`cardCH${id}`);
                if (card) card.classList.add('hidden');
                const badge = document.getElementById(`badgeCH${id}`);
                if (badge) badge.classList.add('hidden');
                const logSection = document.querySelector(`#logBox_${id}`)?.closest('.flex.flex-col');
                if (logSection) logSection.classList.add('hidden');
            });
        }
