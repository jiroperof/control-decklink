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
            // Sumar todos los canales disponibles (backward-compatible con 2 o 4 canales)
            const channelIds = ['1', '2', '3', '4'];
            let totalBytes = 0, totalSecs = 0;
            channelIds.forEach(ch => {
                const chData = rec[`ch${ch}`];
                if (chData) { totalBytes += chData.size_bytes; totalSecs += chData.duration_sec; }
            });
            
            document.getElementById('kpiTotalSize').textContent = (totalBytes / 1073741824).toFixed(2) + ' GB';
            const h = Math.floor(totalSecs / 3600);
            const m = Math.floor((totalSecs % 3600) / 60);
            document.getElementById('kpiTotalHours').textContent = `${h}h ${m}m`;
            document.getElementById('kpiTotalLogins').textContent = data.access.total_logins;

            Chart.defaults.color = '#94a3b8';
            Chart.defaults.font.family = 'Inter, sans-serif';

            // Storage Chart — 4 canales
            const ctx1 = document.getElementById('storageChart').getContext('2d');
            if(storageChartInst) storageChartInst.destroy();

            const chLabels = [], chSizes = [];
            const chColors = [
                'rgba(99, 102, 241, 0.8)',   // CH1 indigo
                'rgba(6, 182, 212, 0.8)',     // CH2 cyan
                'rgba(74, 222, 128, 0.8)',    // CH3 green
                'rgba(244, 114, 182, 0.8)'    // CH4 fuchsia
            ];
            channelIds.forEach((ch, i) => {
                const chData = rec[`ch${ch}`];
                if (chData) {
                    chLabels.push(`Canal ${ch} (GB)`);
                    chSizes.push((chData.size_bytes / 1073741824).toFixed(2));
                }
            });

            storageChartInst = new Chart(ctx1, {
                type: 'doughnut',
                data: {
                    labels: chLabels,
                    datasets: [{
                        data: chSizes,
                        backgroundColor: chColors.slice(0, chLabels.length),
                        borderColor: chLabels.map(() => '#1e293b'),
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
            const fails = data.access.distribution_fails || {};
            
            const allKeysSet = new Set([...Object.keys(dist), ...Object.keys(fails)]);
            const userKeys = Array.from(allKeysSet).sort((a,b) => {
                const totalB = (dist[b]||0) + (fails[b]||0);
                const totalA = (dist[a]||0) + (fails[a]||0);
                return totalB - totalA;
            }).slice(0, 15);
            
            const uDataSuccess = userKeys.map(k => dist[k] || 0);
            const uDataFails = userKeys.map(k => fails[k] || 0);

            usersChartInst = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: userKeys,
                    datasets: [
                        {
                            label: 'Exitosos',
                            data: uDataSuccess,
                            backgroundColor: 'rgba(56, 189, 248, 0.7)',
                            borderColor: 'rgb(56, 189, 248)',
                            borderWidth: 1,
                            borderRadius: 4
                        },
                        {
                            label: 'Fallidos',
                            data: uDataFails,
                            backgroundColor: 'rgba(239, 68, 68, 0.7)',
                            borderColor: 'rgb(239, 68, 68)',
                            borderWidth: 1,
                            borderRadius: 4
                        }
                    ]
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
                    'group3': 'text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-700/50',
                    'group4': 'text-fuchsia-400 bg-fuchsia-900/30 px-2 py-0.5 rounded border border-fuchsia-700/50',
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
