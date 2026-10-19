// ── MODAL UI ─────────────────────────────────────────────────────────────────

export function showModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
}

let _confirmResolve = null;

export function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
    if (id === 'confirm-modal' && _confirmResolve) {
        const cb = _confirmResolve;
        _confirmResolve = null;
        cb(false);
    }
}

/**
 * Show a confirmation modal dialog styled in the dark theme.
 * Returns a Promise that resolves to true (confirmed) or false (cancelled).
 * Falls back to window.confirm if modal element is not present.
 * @param {{ title?: string, message?: string }} options
 * @returns {Promise<boolean>}
 */
export function showConfirmModal({ title = 'Start New Game?', message = 'Abandon your current game progress?' } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        if (!modal) {
            resolve(window.confirm(message));
            return;
        }
        _confirmResolve = resolve;
        const titleEl = document.getElementById('confirm-modal-title');
        if (titleEl) titleEl.textContent = title;
        const subEl = document.getElementById('confirm-modal-sub');
        if (subEl) subEl.textContent = message;
        showModal('confirm-modal');
    });
}

/**
 * Resolve the active confirm modal with the user's choice.
 * @param {boolean} result
 */
export function resolveConfirmModal(result) {
    const el = document.getElementById('confirm-modal');
    if (el) el.classList.remove('show');
    if (_confirmResolve) {
        const cb = _confirmResolve;
        _confirmResolve = null;
        cb(Boolean(result));
    }
}

// Dismiss confirm modal when clicking outside the dialog card (on the backdrop overlay)
if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
        if (e.target && e.target.id === 'confirm-modal') {
            resolveConfirmModal(false);
        }
    });
}
