        // ── Log viewer ────────────────────────────────────────────────────────────────
        async function loadLog() {
            const linesEl = document.getElementById('logLines');
            const lines = linesEl ? linesEl.value : 100;
            const channelsToLoad = USER_CHANNEL ? [USER_CHANNEL] : ['1', '2', '3', '4'];
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
                } catch (e) { 
                    console.error(`Error cargando log CH${id}:`, e);
                    const box = document.getElementById('logBox_' + id);
                    if (box && !box.textContent.includes('Error')) {
                        box.textContent = `⚠ No se pudo cargar el log de CH${id}. Reintentando...`;
                    }
                }
            }));
        }
        function toggleLogAuto() {
            clearInterval(logAutoTimer); logAutoTimer = null;
            const chk = document.getElementById('logAutoRefresh');
            if (chk && chk.checked) {
                loadLog(); logAutoTimer = setInterval(loadLog, 5000);
            }
        }
