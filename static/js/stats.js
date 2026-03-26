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
