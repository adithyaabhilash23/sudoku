// ── BOARD UI ─────────────────────────────────────────────────────────────────
// Rendering and board update logic. All DOM manipulation for the grid.
// All board geometry is read from BOARD_CONFIG at call-time.

import { state, DIFF_CONFIG } from '../core/sudoku.js';
import { BOARD_CONFIG } from '../core/config.js';
import { inputNumber } from '../core/game.js';
import { formatTime } from '../utils/helpers.js';
import { toSymbol } from '../utils/symbols.js';

// ── UPDATE NUMPAD ─────────────────────────────────────────────────────────────
export function updateNumPad() {
    const boardSize = BOARD_CONFIG.boardSize;
    const counts    = Array(boardSize + 1).fill(0);
    state.board.forEach(v => { if (v) counts[v]++; });
    for (let n = 1; n <= boardSize; n++) {
        const btn = document.querySelector(`.num-key[data-n="${n}"]`);
        if (!btn) continue;
        const remaining = boardSize - counts[n];
        btn.querySelector('.num-count').textContent = remaining || '';
        btn.classList.toggle('exhausted', remaining === 0);
        btn.classList.toggle('selected-num', state.selectedNum === n);
        btn.setAttribute('aria-label',
            remaining === 0 ? `${n}, fully placed` : `${n}, ${remaining} remaining`
        );
        btn.setAttribute('aria-pressed', state.selectedNum === n ? 'true' : 'false');
    }
}

// ── CELL & UI DOM CACHE ──────────────────────────────────────────────────────
let _cellCache = null;
let _highlightedSet = new Set();
let _heatmapCells = null;

export function getCellElement(idx) {
    return _cellCache && _cellCache[idx] ? _cellCache[idx].cell : document.querySelector(`.cell[data-idx="${idx}"]`);
}

/**
 * Synchronize notes DOM for a cell.
 * Avoids creating unnecessary note elements for cells without notes.
 */
function _syncCellNotes(ng, notesSet, boardSize) {
    if (!notesSet || notesSet.size === 0) {
        if (ng.children.length > 0) {
            ng.innerHTML = '';
        }
        return;
    }
    // Only build note elements if not already present
    if (ng.children.length !== boardSize) {
        ng.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let n = 1; n <= boardSize; n++) {
            const nd = document.createElement('div');
            nd.className   = 'note-num' + (notesSet.has(n) ? ' visible' : '');
            nd.dataset.n   = n;
            nd.textContent = toSymbol(n);
            frag.appendChild(nd);
        }
        ng.appendChild(frag);
    } else {
        // Fast class toggle for existing elements
        for (let j = 0; j < ng.children.length; j++) {
            const nd = ng.children[j];
            const n = +nd.dataset.n;
            nd.classList.toggle('visible', notesSet.has(n));
        }
    }
}

// ── RENDER BOARD ─────────────────────────────────────────────────────────────
export function renderBoard() {
    const board     = document.getElementById('sudoku-board');
    const boardSize = BOARD_CONFIG.boardSize;
    const boxRows   = BOARD_CONFIG.boxRows;
    const boxCols   = BOARD_CONFIG.boxCols;
    const cellCount = BOARD_CONFIG.cellCount;

    board.innerHTML = '';
    // Set grid layout, typography, and adaptive corner glow variables from BOARD_CONFIG.
    board.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
    board.style.setProperty('--cell-font-size', BOARD_CONFIG.cellFont);
    board.style.setProperty('--note-font-size', BOARD_CONFIG.noteFont);
    board.style.setProperty('--glow-start',     BOARD_CONFIG.glowStart);
    board.style.setProperty('--glow-mid',       BOARD_CONFIG.glowMid);
    board.style.setProperty('--glow-mid-stop',  BOARD_CONFIG.glowMidStop);
    board.style.setProperty('--glow-spread',    BOARD_CONFIG.glowSpread);
    board.dataset.size = boardSize;

    _cellCache = new Array(cellCount);
    _highlightedSet.clear();

    const frag = document.createDocumentFragment();

    for (let i = 0; i < cellCount; i++) {
        const row = Math.floor(i / boardSize);
        const col = i % boardSize;
        const boxR = Math.floor(row / boxRows) * boxRows;
        const boxC = Math.floor(col / boxCols) * boxCols;

        const cell = document.createElement('div');
        cell.className = 'cell' + (state.given[i] ? ' given' : '');
        cell.dataset.idx = i;
        cell.dataset.row = row;
        cell.dataset.col = col;

        // ── Accessibility ──────────────────────────────────────────────────
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('tabindex', '0');
        cell.setAttribute('aria-label', _cellAriaLabel(i, boardSize));
        cell.setAttribute('aria-readonly', state.given[i] ? 'true' : 'false');

        // Notes grid — columns match boxCols so notes are spatially aligned
        const ng = document.createElement('div');
        ng.className = 'notes-grid';
        ng.style.gridTemplateColumns = `repeat(${boxCols}, 1fr)`;
        ng.setAttribute('aria-hidden', 'true');
        cell.appendChild(ng);

        // Value
        const vd = document.createElement('div');
        vd.className = 'cell-value';
        cell.appendChild(vd);

        cell.addEventListener('click',   () => selectCell(i));
        cell.addEventListener('keydown', e  => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCell(i);
            }
        });

        frag.appendChild(cell);

        _cellCache[i] = {
            cell,
            vd,
            ng,
            row,
            col,
            boxR,
            boxC
        };
    }

    board.appendChild(frag);

    // Render continuous, between-cell subgrid separators
    _renderSubgridSeparators(board, boardSize, boxRows, boxCols);

    updateBoardDisplay();
}

/**
 * Render dedicated subgrid separator elements between boxes.
 * These separators sit in the grid gaps rather than eating into cell dimensions.
 */
function _renderSubgridSeparators(board, boardSize, boxRows, boxCols) {
    const sepContainer = document.createElement('div');
    sepContainer.className = 'subgrid-separators';
    sepContainer.setAttribute('aria-hidden', 'true');

    const gapPx = 2; // matches gap in CSS

    // Vertical separators between box columns
    for (let col = boxCols; col < boardSize; col += boxCols) {
        const sep = document.createElement('div');
        sep.className = 'subgrid-sep subgrid-sep-v';
        const ratio = col / boardSize;
        sep.style.left = `calc(${ratio * 100}% + ${(ratio - 0.5) * gapPx}px)`;
        sepContainer.appendChild(sep);
    }

    // Horizontal separators between box rows
    for (let row = boxRows; row < boardSize; row += boxRows) {
        const sep = document.createElement('div');
        sep.className = 'subgrid-sep subgrid-sep-h';
        const ratio = row / boardSize;
        sep.style.top = `calc(${ratio * 100}% + ${(ratio - 0.5) * gapPx}px)`;
        sepContainer.appendChild(sep);
    }

    board.appendChild(sepContainer);
}

/** Build a human-readable aria-label for a given cell index. */
function _cellAriaLabel(i, boardSize) {
    const row  = Math.floor(i / boardSize) + 1;
    const col  = i % boardSize + 1;
    const val  = state.board[i];
    const sym  = val !== 0 ? toSymbol(val) : '';
    const base = `Row ${row}, Column ${col}`;
    if (state.given[i]) return `${base}, given ${sym}`;
    if (val !== 0)      return `${base}, filled ${sym}`;
    return `${base}, empty`;
}

/** Update display of a single cached cell. */
function _updateCellDisplay(i, boardSize) {
    const item = _cellCache[i];
    if (!item) return;
    const { cell, vd, ng } = item;

    const v = state.board[i];
    if (v !== 0) {
        vd.textContent   = toSymbol(v);
        ng.style.display = 'none';
        cell.classList.toggle('error', !!(state.opts.mistakes && state.errors[i]));
    } else {
        vd.textContent   = '';
        ng.style.display = 'grid';
        _syncCellNotes(ng, state.notes[i], boardSize);
        cell.classList.remove('error');
    }
    cell.classList.toggle('complete', !!(state.given[i] && v !== 0));
    cell.setAttribute('aria-label', _cellAriaLabel(i, boardSize));
}

// ── UPDATE BOARD DISPLAY ──────────────────────────────────────────────────────
export function updateBoardDisplay(targetIndices = null) {
    const cellCount = BOARD_CONFIG.cellCount;
    const boardSize = BOARD_CONFIG.boardSize;

    if (!_cellCache || _cellCache.length !== cellCount) {
        renderBoard();
        return;
    }

    if (targetIndices && Array.isArray(targetIndices)) {
        for (const idx of targetIndices) {
            if (idx >= 0 && idx < cellCount) {
                _updateCellDisplay(idx, boardSize);
            }
        }
    } else {
        for (let i = 0; i < cellCount; i++) {
            _updateCellDisplay(i, boardSize);
        }
    }

    updateHighlights();
    updateStats();
    updateProgress();
    updateNumPad();
    updateHeatmap();
}

// ── HIGHLIGHTS ───────────────────────────────────────────────────────────────
export function updateHighlights() {
    const sel       = state.selected;
    const selVal    = sel >= 0 ? state.board[sel] : 0;
    const boardSize = BOARD_CONFIG.boardSize;
    const boxRows   = BOARD_CONFIG.boxRows;
    const boxCols   = BOARD_CONFIG.boxCols;
    const cellCount = BOARD_CONFIG.cellCount;

    if (!_cellCache || _cellCache.length !== cellCount) return;

    // 1. Clear highlights only from previously highlighted cells
    for (const idx of _highlightedSet) {
        if (idx >= 0 && idx < cellCount && _cellCache[idx]) {
            _cellCache[idx].cell.classList.remove('selected', 'related', 'same-num');
        }
    }
    _highlightedSet.clear();

    if (sel < 0 || sel >= cellCount || !_cellCache[sel]) return;

    // 2. Add 'selected' to active cell
    _cellCache[sel].cell.classList.add('selected');
    _highlightedSet.add(sel);

    const selItem = _cellCache[sel];
    const selRow  = selItem.row;
    const selCol  = selItem.col;
    const selBoxR = selItem.boxR;
    const selBoxC = selItem.boxC;

    // 3. Highlight related cells (row, col, box)
    if (state.opts.related) {
        // Row peers
        const rowStart = selRow * boardSize;
        for (let c = 0; c < boardSize; c++) {
            const i = rowStart + c;
            if (i !== sel) {
                _cellCache[i].cell.classList.add('related');
                _highlightedSet.add(i);
            }
        }

        // Col peers
        for (let r = 0; r < boardSize; r++) {
            const i = r * boardSize + selCol;
            if (i !== sel) {
                _cellCache[i].cell.classList.add('related');
                _highlightedSet.add(i);
            }
        }

        // Box peers
        for (let br = 0; br < boxRows; br++) {
            const rOffset = (selBoxR + br) * boardSize;
            for (let bc = 0; bc < boxCols; bc++) {
                const i = rOffset + (selBoxC + bc);
                if (i !== sel) {
                    _cellCache[i].cell.classList.add('related');
                    _highlightedSet.add(i);
                }
            }
        }
    }

    // 4. Highlight same-number cells (overrides related styling in CSS or class)
    if (state.opts.samenum && selVal !== 0) {
        for (let i = 0; i < cellCount; i++) {
            if (state.board[i] === selVal && i !== sel) {
                const c = _cellCache[i].cell;
                c.classList.remove('related');
                c.classList.add('same-num');
                _highlightedSet.add(i);
            }
        }
    }
}

// ── SELECT CELL ──────────────────────────────────────────────────────────────
export function selectCell(idx) {
    if (state.selected === idx) {
        state.selected = -1;
        state.selectedNum = -1;
    } else {
        state.selected = idx;
        if (state.board[idx] !== 0) state.selectedNum = state.board[idx];
    }
    updateHighlights();
    updateNumPad();
}

// ── STATS ────────────────────────────────────────────────────────────────────
export function updateStats() {
    const cellCount = BOARD_CONFIG.cellCount;
    const mistEl = document.getElementById('mistakes-val');
    if (mistEl) mistEl.textContent = `${state.mistakes}/${state.maxMistakes}`;
    const scoreEl = document.getElementById('score-val');
    if (scoreEl) scoreEl.textContent = state.score;
    const filled = state.board.filter(v => v !== 0).length;
    const filledEl = document.getElementById('filled-val');
    if (filledEl) filledEl.textContent = `${filled}/${cellCount}`;
}

// ── PROGRESS ─────────────────────────────────────────────────────────────────
export function updateProgress() {
    const cellCount = BOARD_CONFIG.cellCount;
    const correctFilled = state.board.filter((v, i) => v !== 0 && v === state.solution[i]).length;
    const totalFilled   = state.board.filter(v => v !== 0).length;
    const filledPct     = Math.round(correctFilled / cellCount * 100);
    const accPct        = totalFilled ? Math.round(correctFilled / totalFilled * 100) : 100;
    const hintPct       = Math.round(state.hintsUsed / BOARD_CONFIG.maxHints * 100);

    const pf = document.getElementById('prog-filled');
    if (pf) pf.style.width = filledPct + '%';
    const pft = document.getElementById('prog-filled-txt');
    if (pft) pft.textContent = filledPct + '%';
    const pa = document.getElementById('prog-acc');
    if (pa) pa.style.width = accPct + '%';
    const pat = document.getElementById('prog-acc-txt');
    if (pat) pat.textContent = accPct + '%';
    const ph = document.getElementById('prog-hint');
    if (ph) ph.style.width = hintPct + '%';
    const pht = document.getElementById('prog-hint-txt');
    if (pht) pht.textContent = `${state.hintsUsed}/${BOARD_CONFIG.maxHints}`;
}

// ── BEST TIMES ───────────────────────────────────────────────────────────────
export function updateBestTimes() {
    const el = document.getElementById('best-times');
    if (!el) return;
    const titleEl = document.getElementById('best-times-title');
    if (titleEl) {
        const label = BOARD_CONFIG.label || `${BOARD_CONFIG.boardSize}×${BOARD_CONFIG.boardSize}`;
        titleEl.textContent = `🏆 Best Times (${label})`;
    }
    el.innerHTML = '';
    const diffConfig = DIFF_CONFIG();
    const diffs      = Object.keys(diffConfig);
    const sizeRecords = (state.bestTimes && (state.bestTimes[BOARD_CONFIG.boardSize] || state.bestTimes[String(BOARD_CONFIG.boardSize)])) || {};
    diffs.forEach(d => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);';
        const t = sizeRecords[d];
        row.innerHTML = `<span style="color:var(--text-muted);font-size:0.78rem">${diffConfig[d].label}</span>
      <span style="color:${diffConfig[d].color};font-size:0.8rem;font-weight:700">${t ? formatTime(t) : '—'}</span>`;
        el.appendChild(row);
    });
}

// ── HEATMAP ──────────────────────────────────────────────────────────────────
export function updateHeatmap() {
    const hm = document.getElementById('heatmap');
    if (!hm) return;
    const cellCount = BOARD_CONFIG.cellCount;
    const boardSize = BOARD_CONFIG.boardSize;

    // Rebuild grid if cell count changed (e.g. after board-size switch)
    if (!_heatmapCells || _heatmapCells.length !== cellCount) {
        hm.innerHTML = '';
        _heatmapCells = new Array(cellCount);
        const frag = document.createDocumentFragment();
        for (let i = 0; i < cellCount; i++) {
            const c     = document.createElement('div');
            c.className = 'heatmap-cell';
            c.title     = `R${Math.floor(i / boardSize) + 1}C${i % boardSize + 1}`;
            frag.appendChild(c);
            _heatmapCells[i] = c;
        }
        hm.appendChild(frag);
        // Update the CSS grid columns to match the board size
        hm.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
    }

    const max = Math.max(1, ...state.heatmap);
    for (let i = 0; i < cellCount; i++) {
        const c         = _heatmapCells[i];
        if (!c) continue;
        const v         = state.heatmap[i];
        const intensity = v / max;
        if (v === 0) {
            c.style.background = 'var(--border-light)';
            c.textContent      = '';
        } else {
            const r = Math.round(233 * intensity), g = Math.round(69 + 100 * (1 - intensity));
            c.style.background = `rgb(${r},${g},${Math.round(96 * intensity)})`;
            c.style.color      = 'rgba(255,255,255,0.8)';
            c.textContent      = v;
        }
    }
}
