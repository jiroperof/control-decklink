        // ── Admin: Gestión de Usuarios ────────────────────────────────────────────────
        function openAdminModal() {
            document.getElementById('modalAdmin').classList.remove('hidden');
            loadGroupNamesIntoModal();
            loadAdminUsers();
        }

        async function loadEmailConfig() {
            try {
                const res = await fetch('/api/admin/email-config', { headers: { 'X-Token': TOKEN } });
                if (!res.ok) return;
                const d = await res.json();
                const s = (id, val) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!val; else el.value = val ?? ''; } };
                s('emailEnabled', d.enabled);
                s('smtpHost', d.smtp_host);
                s('smtpPort', d.smtp_port);
                s('smtpUser', d.smtp_user);
                s('smtpTls', d.smtp_tls);
                s('smtpFrom', d.from_addr);
                s('smtpFromName', d.from_name);
                const rec = document.getElementById('emailRecipients');
                if (rec) rec.value = (d.recipients || []).join('\n');
                s('notifStart', d.notify_recording_start);
                s('notifStop', d.notify_recording_stop);
                s('notifLoginOk', d.notify_login_ok);
                s('notifLoginFail', d.notify_login_fail);
                s('notifWatchdog', d.notify_watchdog);
                s('notifDiskGuard', d.notify_disk_guard);
                s('notifDiskCritical', d.notify_disk_critical);
            } catch(_) { showToast('Error cargando configuración de notificaciones.', 'error'); }
        }

        async function saveEmailConfig() {
            showLoadingOverlay('Guardando configuración SMTP...');
            const g = (id) => { const el = document.getElementById(id); if (!el) return null; return el.type === 'checkbox' ? el.checked : el.value.trim(); };
            const recipients = (document.getElementById('emailRecipients')?.value || '')
                .split('\n').map(r => r.trim()).filter(Boolean);
            const payload = {
                enabled: g('emailEnabled'),
                smtp_host: g('smtpHost'),
                smtp_port: parseInt(g('smtpPort')) || 25,
                smtp_user: g('smtpUser'),
                smtp_pass: g('smtpPass'),
                smtp_tls: g('smtpTls'),
                from_addr: g('smtpFrom'),
                from_name: g('smtpFromName'),
                recipients,
                notify_recording_start: g('notifStart'),
                notify_recording_stop: g('notifStop'),
                notify_login_ok: g('notifLoginOk'),
                notify_login_fail: g('notifLoginFail'),
                notify_watchdog: g('notifWatchdog'),
                notify_disk_guard: g('notifDiskGuard'),
                notify_disk_critical: g('notifDiskCritical'),
            };
            try {
                const res = await fetch('/api/admin/email-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Token': TOKEN },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showToast('Configuración de notificaciones guardada.', 'success');
                    document.getElementById('smtpPass').value = '';
                } else { const e = await res.json(); showToast('Error: ' + e.detail, 'error'); }
            } catch(_) { showToast('Error de conexión.', 'error'); }
            finally { hideLoadingOverlay(); }
        }

        async function testEmail() {
            const btn = event.currentTarget;
            if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
            try {
                const res = await fetch('/api/admin/send-report', {
                    method: 'POST',
                    headers: { 'X-Token': TOKEN }
                });
                if (res.ok) {
                    showToast('✅ Correo de prueba enviado. Revisa tu bandeja.', 'success');
                } else { const e = await res.json(); showToast('Error: ' + e.detail, 'error'); }
            } catch(_) { showToast('Error de conexión.', 'error'); }
            finally { if (btn) { btn.disabled = false; btn.textContent = '✉ Enviar Prueba'; } }
        }
        function closeAdminModal() {
            document.getElementById('modalAdmin').classList.add('hidden');
        }
        function switchAdminTab(tab) {
            ['grupos','usuarios','notif'].forEach(t => {
                const body = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
                const btn  = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
                if (body) body.classList.toggle('hidden', t !== tab);
                if (btn)  btn.className = `flex-1 py-3 text-[11px] font-black uppercase tracking-widest transition-all ${t === tab ? 'tab-active' : 'tab-inactive'}`;
            });
            if (tab === 'notif') loadEmailConfig();
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
