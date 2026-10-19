// ── TOAST UI ─────────────────────────────────────────────────────────────────

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {string} type - 'success' | 'error' | 'info' | ''
 * @param {number} dur  - duration in ms
 */
export function showToast(msg, type = '', dur = 2500) {
    const tc = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    tc.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => t.remove(), 300);
    }, dur);
}

// ── HISTORY LOG ───────────────────────────────────────────────────────────────

/**
 * Prepend a move entry to the visible history list.
 * @param {string} msg
 * @param {string} type - 'err' | 'undo' | ''
 */
export function addHistoryLog(msg, type) {
    const list = document.getElementById('history-list');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'history-item ' + type;
    item.textContent = msg;
    list.prepend(item);
    // Keep max 20
    while (list.children.length > 20) list.lastChild.remove();
}

// ── CONFETTI ─────────────────────────────────────────────────────────────────

export function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 150 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: 6 + Math.random() * 8, h: 10 + Math.random() * 12,
        color: ['#e94560', '#f0a500', '#00d68f', '#4fc3f7', '#ce93d8', '#ffb74d'][Math.floor(Math.random() * 6)],
        rot: Math.random() * 360,
        vx: -2 + Math.random() * 4,
        vy: 2 + Math.random() * 5,
        vr: -3 + Math.random() * 6,
        alpha: 1
    }));

    let frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            if (frame > 120) p.alpha -= 0.01;
        });
        frame++;
        if (frame < 200) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
}
