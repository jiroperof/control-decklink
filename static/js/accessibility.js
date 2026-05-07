// ══════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY & KEYBOARD NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

// ── Focus Management ──────────────────────────────────────────────────────────
let focusTrapStack = [];

function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTabKey = (e) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    };
    
    element.addEventListener('keydown', handleTabKey);
    
    return {
        element,
        handleTabKey,
        firstElement,
        destroy: () => element.removeEventListener('keydown', handleTabKey)
    };
}

function openModalWithFocus(modalId, firstFocusSelector = null) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Guardar elemento activo
    const previousFocus = document.activeElement;
    
    // Mostrar modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Configurar trap de foco
    const trap = trapFocus(modal);
    
    // Mover foco al primer elemento o al especificado
    setTimeout(() => {
        if (firstFocusSelector) {
            const firstElement = modal.querySelector(firstFocusSelector);
            if (firstElement) firstElement.focus();
        } else if (trap && trap.firstElement) {
            trap.firstElement.focus();
        }
    }, 100);
    
    // Guardar en stack
    focusTrapStack.push({
        modalId,
        previousFocus,
        trap
    });
    
    // Manejar ESC key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModalWithFocus(modalId);
        }
    };
    modal.addEventListener('keydown', handleEscape);
    modal.dataset.escapeHandler = 'true';
}

function closeModalWithFocus(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Ocultar modal
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    // Encontrar y remover del stack
    const index = focusTrapStack.findIndex(item => item.modalId === modalId);
    if (index !== -1) {
        const { previousFocus, trap } = focusTrapStack[index];
        
        // Destruir trap
        if (trap && trap.destroy) trap.destroy();
        
        // Restaurar foco
        if (previousFocus && previousFocus.focus) {
            setTimeout(() => previousFocus.focus(), 50);
        }
        
        // Remover del stack
        focusTrapStack.splice(index, 1);
    }
}

// ── Modal Helpers (ESC / focus trap integration only) ────────────────────────
// NOTE: Do NOT override openCleanupModal, openAdminModal, openStatsModal,
// openPreview, closePreview, or closePlayer here.
// Those functions contain critical logic (fetch, MJPEG streaming, AbortController)
// defined in dashboard.js, admin.js and stats.js.
// Overriding them here would silently break authentication and data loading.

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    // Ignorar si estamos en un input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
    }
    
    // Ctrl/Cmd + R: Refresh data
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (typeof updateMetrics === 'function') updateMetrics();
        if (typeof updateStatus === 'function') updateStatus();
        if (typeof showToast === 'function') showToast('Datos actualizados', 'info');
    }
    
    // Ctrl/Cmd + L: Toggle logs
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        const logBody = document.getElementById('logBody');
        if (logBody && typeof toggleSection === 'function') {
            toggleSection('logBody');
        }
    }
    
    // Ctrl/Cmd + F: Toggle files
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const filesBody = document.getElementById('filesBody');
        if (filesBody && typeof toggleSection === 'function') {
            toggleSection('filesBody');
            if (typeof loadFiles === 'function') loadFiles();
        }
    }
    
    // ESC: Close any open modal
    if (e.key === 'Escape' && focusTrapStack.length > 0) {
        const topModal = focusTrapStack[focusTrapStack.length - 1];
        if (topModal && topModal.modalId) {
            closeModalWithFocus(topModal.modalId);
        }
    }
});

// ── Loading Overlay ───────────────────────────────────────────────────────────
function showLoadingOverlay(message = 'Procesando...') {
    let overlay = document.getElementById('loadingOverlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-md flex items-center justify-center';
        overlay.innerHTML = `
            <div class="glass-panel p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-fade-in-up">
                <div class="spinner !w-12 !h-12 !border-4"></div>
                <p id="loadingMessage" class="text-white font-bold text-sm uppercase tracking-widest">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    } else {
        const msg = overlay.querySelector('#loadingMessage');
        if (msg) msg.textContent = message;
        overlay.classList.remove('hidden');
    }
    
    // Prevenir scroll del body
    document.body.style.overflow = 'hidden';
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
    document.body.style.overflow = '';
}

function updateLoadingMessage(message) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        const msg = overlay.querySelector('#loadingMessage');
        if (msg) msg.textContent = message;
    }
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function showConfirmDialog(message, onConfirm, onCancel = null) {
    let dialog = document.getElementById('confirmDialog');
    
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'confirmDialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-labelledby', 'confirmDialogTitle');
        dialog.setAttribute('aria-modal', 'true');
        dialog.className = 'fixed inset-0 z-[150] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6';
        document.body.appendChild(dialog);
    }
    
    dialog.innerHTML = `
        <div class="glass-panel w-full max-w-md p-8 rounded-3xl shadow-2xl animate-fade-in-up">
            <h3 id="confirmDialogTitle" class="text-lg font-black uppercase tracking-widest text-white mb-4">⚠ Confirmación</h3>
            <p class="text-slate-300 mb-6 text-sm leading-relaxed">${message}</p>
            <div class="flex gap-3">
                <button id="confirmCancel" class="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all active:scale-95">
                    Cancelar
                </button>
                <button id="confirmOk" class="flex-1 bg-red-600 hover:bg-red-500 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all active:scale-95">
                    Confirmar
                </button>
            </div>
        </div>
    `;
    
    dialog.classList.remove('hidden');
    
    const okBtn = dialog.querySelector('#confirmOk');
    const cancelBtn = dialog.querySelector('#confirmCancel');
    
    const cleanup = () => {
        dialog.classList.add('hidden');
        document.body.style.overflow = '';
    };
    
    okBtn.onclick = () => {
        cleanup();
        if (onConfirm) onConfirm();
    };
    
    cancelBtn.onclick = () => {
        cleanup();
        if (onCancel) onCancel();
    };
    
    // Focus en botón de confirmar
    setTimeout(() => okBtn.focus(), 100);
    
    // Trap focus
    const trap = trapFocus(dialog);
    
    // ESC para cancelar
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            cleanup();
            if (onCancel) onCancel();
            dialog.removeEventListener('keydown', handleEscape);
            if (trap && trap.destroy) trap.destroy();
        }
    };
    dialog.addEventListener('keydown', handleEscape);
    
    document.body.style.overflow = 'hidden';
}

// ── Export functions ──────────────────────────────────────────────────────────
window.showLoadingOverlay = showLoadingOverlay;
window.hideLoadingOverlay = hideLoadingOverlay;
window.updateLoadingMessage = updateLoadingMessage;
window.showConfirmDialog = showConfirmDialog;
window.openModalWithFocus = openModalWithFocus;
window.closeModalWithFocus = closeModalWithFocus;

console.log('✅ Accessibility module loaded');
