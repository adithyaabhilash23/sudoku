// ── NUMPAD & CONTROLS UI ─────────────────────────────────────────────────────
// Rendering the number pad and wiring up keyboard shortcuts.
// All board geometry is read from BOARD_CONFIG at call-time.
//
// NUMPAD PAGINATION
// The numpad always shows at most 9 number buttons (matching the 9×9 size).
// For boards with more than 9 symbols (e.g. 16×16) the buttons are split into
// pages of 9.  Two permanent nav arrows (◀ ▶) and page-dot indicators are
// added when pagination is needed.  Page state persists until the user changes
// it or a new game / board-size switch resets it.

import { state } from '../core/sudoku.js';
import { BOARD_CONFIG } from '../core/config.js';
import { inputNumber, clearCell, undoMove, useHint, toggleOpt } from '../core/game.js';
import { selectCell } from './board.js';
import { toSymbol, keyToNum } from '../utils/symbols.js';
import { resolveConfirmModal } from './modal.js';

// ── PAGINATION STATE ──────────────────────────────────────────────────────────
const PAGE_SIZE = 9; // always show at most 9 number buttons
let _currentPage = 0;

/** How many pages does the current board size need? */
function _pageCount() {
    return Math.ceil(BOARD_CONFIG.boardSize / PAGE_SIZE);
}

/** First symbol value on the given page (0-indexed). */
function _pageStart(page) { return page * PAGE_SIZE + 1; }

/** Last symbol value on the given page (inclusive). */
function _pageEnd(page) {
    return Math.min(_pageStart(page) + PAGE_SIZE - 1, BOARD_CONFIG.boardSize);
}

// ── RENDER NUMPAD ────────────────────────────────────────────────────────────
export function renderNumPad() {
    _currentPage = 0; // reset to page 0 whenever the numpad is fully rebuilt
    _buildNumPad();
}

/** Build (or rebuild) the entire numpad DOM from scratch. */
function _buildNumPad() {
    const np        = document.getElementById('numpad');
    if (!np) return;
    const pages     = _pageCount();
    const paginated = pages > 1;

    np.innerHTML = '';
    np.setAttribute('role', 'group');
    np.setAttribute('aria-label', 'Number pad');

    // ── Prev arrow ────────────────────────────────────────────────────────────
    if (paginated) {
        const prev = _makeNavBtn('◀', 'numpad-prev', 'Previous symbols page', () => _goPage(-1));
        np.appendChild(prev);
    }

    // ── Number buttons for current page ───────────────────────────────────────
    const start = _pageStart(_currentPage);
    const end   = _pageEnd(_currentPage);
    for (let n = start; n <= end; n++) {
        const btn = document.createElement('button');
        btn.className = 'num-key';
        btn.dataset.n = n;
        btn.innerHTML = `<span>${toSymbol(n)}</span><span class="num-count" id="nc-${n}"></span>`;
        btn.setAttribute('aria-label',   toSymbol(n));
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => inputNumber(n));
        np.appendChild(btn);
    }

    // ── Next arrow ────────────────────────────────────────────────────────────
    if (paginated) {
        const next = _makeNavBtn('▶', 'numpad-next', 'Next symbols page', () => _goPage(+1));
        np.appendChild(next);
    }

    // ── Page dots ─────────────────────────────────────────────────────────────
    _renderPageDots(pages);

    // Sync exhausted / selected-num state immediately
    _syncNumPadState();
}

function _makeNavBtn(label, id, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'num-key numpad-nav';
    btn.id = id;
    btn.innerHTML = `<span>${label}</span>`;
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
}

/** Navigate pages; clamps to valid range. */
function _goPage(delta) {
    const pages = _pageCount();
    _currentPage = Math.max(0, Math.min(pages - 1, _currentPage + delta));
    _buildNumPad(); // rebuild buttons for the new page
}

/** Render or update page-dot indicators below the numpad. */
function _renderPageDots(pages) {
    // Remove old dots if any
    const old = document.getElementById('numpad-dots');
    if (old) old.remove();

    if (pages <= 1) return;

    const np = document.getElementById('numpad');
    if (!np || !np.parentElement) return;
    const container = np.parentElement;
    const dots = document.createElement('div');
    dots.id = 'numpad-dots';
    dots.setAttribute('aria-hidden', 'true');

    for (let p = 0; p < pages; p++) {
        const d = document.createElement('span');
        d.className = 'page-dot' + (p === _currentPage ? ' active' : '');
        dots.appendChild(d);
    }

    // Insert immediately after the numpad element
    const numpad = document.getElementById('numpad');
    numpad.insertAdjacentElement('afterend', dots);
}

// ── UPDATE NUMPAD STATE ───────────────────────────────────────────────────────
/**
 * Sync exhausted / selected-num classes on visible buttons.
 * Called by updateBoardDisplay — does NOT rebuild the DOM.
 */
export function updateNumPad() {
    const boardSize = BOARD_CONFIG.boardSize;
    const counts    = Array(boardSize + 1).fill(0);
    state.board.forEach(v => { if (v) counts[v]++; });

    // Only iterate symbols on the currently visible page
    const start = _pageStart(_currentPage);
    const end   = _pageEnd(_currentPage);

    for (let n = start; n <= end; n++) {
        const btn = document.querySelector(`.num-key[data-n="${n}"]`);
        if (!btn) continue;
        const remaining = boardSize - counts[n];
        const sym = toSymbol(n);
        btn.querySelector('.num-count').textContent = remaining || '';
        btn.classList.toggle('exhausted',    remaining === 0);
        btn.classList.toggle('selected-num', state.selectedNum === n);
        btn.setAttribute('aria-label',
            remaining === 0 ? `${sym}, fully placed` : `${sym}, ${remaining} remaining`
        );
        btn.setAttribute('aria-pressed', state.selectedNum === n ? 'true' : 'false');
    }

    // Sync nav arrow disabled states
    const prev = document.getElementById('numpad-prev');
    const next = document.getElementById('numpad-next');
    if (prev) prev.disabled = (_currentPage === 0);
    if (next) next.disabled = (_currentPage === _pageCount() - 1);

    // Sync page dots
    document.querySelectorAll('.page-dot').forEach((d, i) => {
        d.classList.toggle('active', i === _currentPage);
    });
}

function _syncNumPadState() { updateNumPad(); }

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
export function initKeyboard() {
    document.addEventListener('keydown', e => {
        const key = e.key;

        // If confirm modal is currently visible, handle Enter and Escape
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal && confirmModal.classList.contains('show')) {
            if (key === 'Escape') {
                e.preventDefault();
                resolveConfirmModal(false);
            } else if (key === 'Enter') {
                e.preventDefault();
                resolveConfirmModal(true);
            }
            return;
        }

        if (!state.gameActive) return;
        const boardSize = BOARD_CONFIG.boardSize;
        const cellCount = BOARD_CONFIG.cellCount;
        const lowerKey  = key.toLowerCase();

        // Arrow keys — navigate board cells
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault();
            const centerIdx = Math.floor(cellCount / 2);
            const maxIdx    = cellCount - 1;
            let idx = state.selected < 0 ? centerIdx : state.selected;
            if (key === 'ArrowUp')    idx = Math.max(0,      idx - boardSize);
            if (key === 'ArrowDown')  idx = Math.min(maxIdx, idx + boardSize);
            if (key === 'ArrowLeft')  idx = Math.max(0,      idx - 1);
            if (key === 'ArrowRight') idx = Math.min(maxIdx, idx + 1);
            selectCell(idx);
            return;
        }

        // Global modifier shortcuts for Hint and Notes (available across all board sizes)
        if ((e.altKey || e.ctrlKey) && lowerKey === 'h') {
            e.preventDefault();
            useHint();
            return;
        }
        if ((e.altKey || e.ctrlKey) && lowerKey === 'n') {
            e.preventDefault();
            toggleOpt('notes');
            return;
        }

        // Clear cell
        if (key === '0' || key === 'Delete' || key === 'Backspace') {
            clearCell();
            return;
        }

        // Undo
        if (lowerKey === 'z' && (e.ctrlKey || e.metaKey || !e.altKey)) {
            if (e.ctrlKey || e.metaKey) e.preventDefault();
            undoMove();
            return;
        }

        // Single-key shortcuts for Hint and Notes when H and N are NOT valid board symbols
        // On 4×4, 9×9, 16×16 (where boardSize < 17), 'H' (17) and 'N' (23) are not symbols.
        // Therefore plain 'h' and 'n' invoke Hint and Notes mode respectively.
        if (boardSize < 17) {
            if (lowerKey === 'n' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                toggleOpt('notes');
                return;
            }
            if (lowerKey === 'h' && !e.altKey && !e.ctrlKey && !e.metaKey) {
                useHint();
                return;
            }
        }

        // Number / letter symbol input (supports 1-9 and A-P)
        // On 25×25, plain 'h' (17) and 'n' (23) enter legitimate symbols into the selected cell.
        if (!e.altKey && !e.ctrlKey && !e.metaKey) {
            const num = keyToNum(key, boardSize);
            if (num !== null) {
                inputNumber(num);
                return;
            }
        }
    });
}

// ── ANIMATED BACKGROUND ───────────────────────────────────────────────────────
export function initBg() {
    const bg = document.getElementById('bg-anim');
    for (let i = 0; i < 40; i++) {
        const s = document.createElement('span');
        s.style.cssText = `left:${Math.random() * 100}%;
      width:${2 + Math.random() * 3}px; height:${2 + Math.random() * 3}px;
      animation-duration:${6 + Math.random() * 12}s;
      animation-delay:${Math.random() * 10}s;
      opacity:${0.3 + Math.random() * 0.7};
      background:hsl(${Math.random() * 60 + 200},80%,70%)`;
        bg.appendChild(s);
    }
}
