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
                const i3 = document.getElementById('inputG3Name');
                const i4 = document.getElementById('inputG4Name');
                if (i1) i1.value = d.group1_name;
                if (i2) i2.value = d.group2_name;
                if (i3) i3.value = d.group3_name;
                if (i4) i4.value = d.group4_name;
                // Update dropdown options
                const o1 = document.getElementById('newUserGroupOpt1');
                const o2 = document.getElementById('newUserGroupOpt2');
                const o3 = document.getElementById('newUserGroupOpt3');
                const o4 = document.getElementById('newUserGroupOpt4');
                if (o1) o1.textContent = `Grupo 1 — ${d.group1_name}`;
                if (o2) o2.textContent = `Grupo 2 — ${d.group2_name}`;
                if (o3) o3.textContent = `Grupo 3 — ${d.group3_name}`;
                if (o4) o4.textContent = `Grupo 4 — ${d.group4_name}`;
            } catch(_) {}
        }
        async function saveGroupNames() {
            const g1 = document.getElementById('inputG1Name').value.trim();
            const g2 = document.getElementById('inputG2Name').value.trim();
            const g3 = document.getElementById('inputG3Name') ? document.getElementById('inputG3Name').value.trim() : '';
            const g4 = document.getElementById('inputG4Name') ? document.getElementById('inputG4Name').value.trim() : '';
            if (!g1 || !g2 || !g3 || !g4) { showToast('Los nombres no pueden estar vacíos.', 'warning'); return; }
            try {
                const res = await fetch('/api/admin/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify({ group1_name: g1, group2_name: g2, group3_name: g3, group4_name: g4 })
                });
                if (res.ok) {
                    showToast('Nombres de grupos actualizados.', 'success');
                    // Update login buttons
                    const l1 = document.getElementById('btnRoleG1Label');
                    const l2 = document.getElementById('btnRoleG2Label');
                    const l3 = document.getElementById('btnRoleG3Label');
                    const l4 = document.getElementById('btnRoleG4Label');
                    if (l1) l1.textContent = g1;
                    if (l2) l2.textContent = g2;
                    if (l3) l3.textContent = g3;
                    if (l4) l4.textContent = g4;
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
                            <span class="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${u.group === '1' ? 'bg-indigo-900/50 text-indigo-400 border border-indigo-700/50' : u.group === '2' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-700/50' : u.group === '3' ? 'bg-green-900/50 text-green-400 border border-green-700/50' : 'bg-fuchsia-900/50 text-fuchsia-400 border border-fuchsia-700/50'}">${u.group_name}</span>
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
