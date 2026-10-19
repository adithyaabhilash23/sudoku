// ── GAME LOGIC ───────────────────────────────────────────────────────────────
// Pure game state mutations — no direct DOM manipulation except through
// callbacks/imports to UI modules.
//
// All board geometry is read from BOARD_CONFIG at call-time so the game
// works correctly after a board-size switch.

import { state, DIFF_CONFIG } from './sudoku.js';
import { BOARD_CONFIG, setBoardSize } from './config.js';
import { generatePuzzle } from './generator.js';
import { solveWithStatus, SOLVE_STATUS } from './solver.js';
import { saveBestTimes } from '../utils/storage.js';
import { formatTime } from '../utils/helpers.js';
import { toSymbol } from '../utils/symbols.js';

// Forward-declared UI callbacks (set by app.js to avoid circular deps)
let _ui = {};
export function registerUI(ui) { _ui = ui; }

// ── SCORE ────────────────────────────────────────────────────────────────────
export function scoreForCell() {
    const base = { easy: 10, medium: 20, hard: 35, expert: 50 }[state.difficulty];
    const timeBonus = Math.max(0, 300 - state.timerSec);
    return base + Math.floor(timeBonus / 10);
}

// ── AUTO-REMOVE NOTES ────────────────────────────────────────────────────────
export function clearRelatedNotes(idx, num) {
    const boardSize = BOARD_CONFIG.boardSize;
    const boxRows   = BOARD_CONFIG.boxRows;
    const boxCols   = BOARD_CONFIG.boxCols;
    const cellCount = BOARD_CONFIG.cellCount;

    const row  = Math.floor(idx / boardSize);
    const col  = idx % boardSize;
    const boxR = Math.floor(row / boxRows) * boxRows;
    const boxC = Math.floor(col / boxCols) * boxCols;

    for (let i = 0; i < cellCount; i++) {
        const ir = Math.floor(i / boardSize), ic = i % boardSize;
        if (
            ir === row || ic === col ||
            (Math.floor(ir / boxRows) * boxRows === boxR &&
             Math.floor(ic / boxCols) * boxCols === boxC)
        ) {
            state.notes[i].delete(num);
        }
    }
}

// ── TIMER ────────────────────────────────────────────────────────────────────
export function startTimer() {
    stopTimer();
    if (!state.gameActive) return;
    state.timerActive = true;
    state.timerRef = setInterval(() => {
        state.timerSec++;
        const timerEl = document.getElementById('timer-val');
        if (timerEl) timerEl.textContent = formatTime(state.timerSec);
    }, 1000);
}

export function stopTimer() {
    state.timerActive = false;
    if (state.timerRef) {
        clearInterval(state.timerRef);
        state.timerRef = null;
    }
}

// ── WIN CHECK ────────────────────────────────────────────────────────────────
export function checkWin() {
    const cellCount = BOARD_CONFIG.cellCount;
    const filled = state.board.filter((v, i) => v !== 0 && v === state.solution[i]).length;
    if (filled === cellCount) {
        state.gameActive = false;
        stopTimer();
        const t = formatTime(state.timerSec);
        const sizeKey = BOARD_CONFIG.boardSize;
        if (!state.bestTimes[sizeKey]) {
            state.bestTimes[sizeKey] = {};
        }
        const currentBest = state.bestTimes[sizeKey][state.difficulty];
        if (!currentBest || state.timerSec < currentBest) {
            state.bestTimes[sizeKey][state.difficulty] = state.timerSec;
            saveBestTimes(state.bestTimes);
            if (_ui.updateBestTimes) _ui.updateBestTimes();
        }
        const winTimeEl = document.getElementById('win-time');
        if (winTimeEl) winTimeEl.textContent = t;
        const winScoreEl = document.getElementById('win-score');
        if (winScoreEl) winScoreEl.textContent = state.score;
        const winMistakesEl = document.getElementById('win-mistakes');
        if (winMistakesEl) winMistakesEl.textContent = state.mistakes;
        const winSubEl = document.getElementById('win-sub');
        if (winSubEl) {
            const diffInfo = DIFF_CONFIG()[state.difficulty];
            winSubEl.textContent = `${diffInfo ? diffInfo.label : state.difficulty} puzzle completed in ${t}!`;
        }
        const bw = document.getElementById('board-wrapper');
        if (bw) bw.classList.add('pulse-win');
        setTimeout(() => {
            if (_ui.showModal) _ui.showModal('win-modal');
            if (_ui.launchConfetti) _ui.launchConfetti();
        }, 700);
    }
}

// ── INPUT NUMBER ─────────────────────────────────────────────────────────────
export function inputNumber(num) {
    const idx = state.selected;
    if (idx < 0 || state.given[idx] || !state.gameActive) return;

    const boardSize = BOARD_CONFIG.boardSize;

    if (state.opts.notes) {
        const snap = new Set(state.notes[idx]);
        if (state.notes[idx].has(num)) state.notes[idx].delete(num);
        else { state.notes[idx].add(num); state.board[idx] = 0; }
        state.history.push({ idx, oldVal: state.board[idx], newVal: state.board[idx], oldNotes: snap, isNote: true });
        _ui.updateBoardDisplay();
        return;
    }

    const oldVal = state.board[idx];
    if (oldVal === num) return;

    state.history.push({ idx, oldVal, newVal: num, oldNotes: new Set(state.notes[idx]), isNote: false });

    state.board[idx] = num;
    state.notes[idx].clear();
    state.heatmap[idx]++;

    const correct = (state.solution[idx] === num);
    state.errors[idx] = !correct;

    if (!correct && state.opts.mistakes) {
        state.mistakes++;
        const mistakesEl = document.getElementById('mistakes-val');
        if (mistakesEl) mistakesEl.textContent = `${state.mistakes}/${state.maxMistakes}`;
        const cell = document.querySelector(`.cell[data-idx="${idx}"]`);
        if (cell) {
            cell.classList.add('shake');
            setTimeout(() => cell.classList.remove('shake'), 400);
        }
        if (_ui.addHistoryLog) _ui.addHistoryLog(`R${Math.floor(idx / boardSize) + 1}C${idx % boardSize + 1}: ${toSymbol(num)} ✗`, 'err');
        if (_ui.showToast) _ui.showToast(`❌ Incorrect! ${state.maxMistakes - state.mistakes} chances left`, 'error');
        if (state.mistakes >= state.maxMistakes) {
            state.gameActive = false;
            stopTimer();
            setTimeout(() => { if (_ui.showModal) _ui.showModal('lose-modal'); }, 600);
        }
    } else if (correct) {
        state.errors[idx] = false;
        if (state.opts.autonotes) clearRelatedNotes(idx, num);
        state.score += scoreForCell();
        const cell = document.querySelector(`.cell[data-idx="${idx}"]`);
        if (cell) {
            cell.classList.add('pop-in');
            setTimeout(() => cell.classList.remove('pop-in'), 300);
        }
        if (_ui.addHistoryLog) _ui.addHistoryLog(`R${Math.floor(idx / boardSize) + 1}C${idx % boardSize + 1}: ${toSymbol(num)} ✓`, '');
    }

    state.selectedNum = num;
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    checkWin();
}

// ── CLEAR CELL ───────────────────────────────────────────────────────────────
export function clearCell() {
    const idx = state.selected;
    if (idx < 0 || state.given[idx] || !state.gameActive) return;
    if (state.board[idx] === 0 && state.notes[idx].size === 0) return;
    state.history.push({ idx, oldVal: state.board[idx], newVal: 0, oldNotes: new Set(state.notes[idx]), isNote: false });
    state.board[idx] = 0;
    state.errors[idx] = false;
    state.notes[idx].clear();
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
}

// ── UNDO ─────────────────────────────────────────────────────────────────────
export function undoMove() {
    if (!state.gameActive) return;
    if (!state.history.length) { if (_ui.showToast) _ui.showToast('Nothing to undo!', 'info'); return; }
    const h = state.history.pop();
    const boardSize = BOARD_CONFIG.boardSize;
    state.board[h.idx]  = h.oldVal;
    state.notes[h.idx]  = h.oldNotes;
    state.errors[h.idx] = false;
    state.selected      = h.idx;
    if (_ui.addHistoryLog) _ui.addHistoryLog(`Undo R${Math.floor(h.idx / boardSize) + 1}C${h.idx % boardSize + 1}`, 'undo');
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (_ui.showToast) _ui.showToast('↩️ Move undone', 'info');
}

// ── HINT ─────────────────────────────────────────────────────────────────────
export function useHint() {
    if (state.hintsLeft <= 0) { if (_ui.showToast) _ui.showToast('No hints left! 💡', 'error'); return; }
    if (!state.gameActive) return;

    const cellCount = BOARD_CONFIG.cellCount;
    const boardSize = BOARD_CONFIG.boardSize;

    let idx = state.selected;
    if (idx < 0 || state.board[idx] !== 0 || state.given[idx]) {
        const empties = [];
        for (let i = 0; i < cellCount; i++) if (state.board[i] === 0) empties.push(i);
        if (!empties.length) return;
        idx = empties[Math.floor(Math.random() * empties.length)];
    }
    if (state.board[idx] !== 0) { if (_ui.showToast) _ui.showToast('Cell already filled!', 'info'); return; }

    state.hintsLeft--;
    state.hintsUsed++;
    const hintCountEl = document.getElementById('hint-count');
    if (hintCountEl) hintCountEl.textContent = `(${state.hintsLeft})`;

    state.board[idx]    = state.solution[idx];
    state.notes[idx].clear();
    state.errors[idx]   = false;
    state.given[idx]    = true;
    state.selected      = idx;

    const cell = document.querySelector(`.cell[data-idx="${idx}"]`);
    if (cell) {
        cell.classList.add('highlight-flash', 'given');
        setTimeout(() => cell.classList.remove('highlight-flash'), 350);
    }

    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (_ui.addHistoryLog) {
        _ui.addHistoryLog(
            `Hint R${Math.floor(idx / boardSize) + 1}C${idx % boardSize + 1}: ${toSymbol(state.solution[idx])} 💡`, ''
        );
    }
    if (_ui.showToast) _ui.showToast(`💡 Hint used! ${state.hintsLeft} remaining`, 'info');
    checkWin();
}

// ── GENERATION & DUPLICATE REQUEST GUARDS ────────────────────────────────────
let _isGenerating = false;
let _generationId = 0;

export function isGenerating() {
    return _isGenerating;
}

/**
 * Toggle interactive controls and visual busy states during puzzle generation.
 * Guaranteed to run in finally blocks so controls are never permanently disabled.
 */
function _setGeneratingState(generating) {
    _isGenerating = generating;
    const buttons = document.querySelectorAll(
        '.new-game-btn, #btn-new-game, [data-action="new-game"], .size-btn, .diff-btn, #btn-reset, #btn-hint, #btn-auto-solve'
    );
    buttons.forEach(btn => {
        btn.disabled = generating;
        btn.setAttribute('aria-busy', generating ? 'true' : 'false');
        btn.classList.toggle('generating', generating);
    });
}

// ── AUTO SOLVE ───────────────────────────────────────────────────────────────
export function solvePuzzle() {
    if (!state.gameActive || _isGenerating) return;
    if (!confirm('Auto-solve will end your current game. Continue?')) return;
    const cellCount = BOARD_CONFIG.cellCount;

    // Verify if state.solution is intact and complete
    let sol = state.solution;
    if (!sol || sol.length !== cellCount || sol.some(v => v === 0)) {
        const boardCopy = [...state.initialBoard];
        const res = solveWithStatus(boardCopy, false, 5000);
        if (res.success) {
            sol = boardCopy;
            state.solution = [...boardCopy];
        } else {
            if (res.status === SOLVE_STATUS.TIMEOUT) {
                if (_ui.showToast) _ui.showToast('Solver timed out. Puzzle too complex.', 'error');
            } else {
                if (_ui.showToast) _ui.showToast('Unable to solve puzzle.', 'error');
            }
            return;
        }
    }

    for (let i = 0; i < cellCount; i++) {
        if (!state.given[i]) {
            state.board[i]  = sol[i];
            state.errors[i] = false;
            state.notes[i].clear();
        }
    }
    state.gameActive = false;
    stopTimer();
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (_ui.showToast) _ui.showToast('🤖 Puzzle auto-solved!', 'info');
}

export function revealSolution() {
    if (_ui.closeModal) _ui.closeModal('lose-modal');
    const cellCount = BOARD_CONFIG.cellCount;

    let sol = state.solution;
    if (!sol || sol.length !== cellCount || sol.some(v => v === 0)) {
        const boardCopy = [...state.initialBoard];
        const res = solveWithStatus(boardCopy, false, 5000);
        if (res.success) {
            sol = boardCopy;
            state.solution = [...boardCopy];
        } else {
            if (_ui.showToast) _ui.showToast('Unable to reveal solution.', 'error');
            return;
        }
    }

    for (let i = 0; i < cellCount; i++) {
        if (!state.given[i]) {
            state.board[i]  = sol[i];
            state.errors[i] = false;
            state.notes[i].clear();
        }
    }
    state.gameActive = false;
    stopTimer();
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (_ui.showToast) _ui.showToast('💡 Solution revealed', 'info');
}

// ── NEW GAME ─────────────────────────────────────────────────────────────────
export async function newGame() {
    // Prevent overlapping generation requests from rapid clicks
    if (_isGenerating) return;
    _setGeneratingState(true);
    const genId = ++_generationId;
    const requestedSize = BOARD_CONFIG.boardSize;

    if (_ui.closeModal) {
        _ui.closeModal('win-modal');
        _ui.closeModal('lose-modal');
        _ui.closeModal('confirm-modal');
    }
    const bw = document.getElementById('board-wrapper');
    if (bw) bw.classList.remove('pulse-win');

    const diffCfg = (DIFF_CONFIG && DIFF_CONFIG()[state.difficulty]) || { clues: 35 };

    try {
        // Yield momentarily to allow browser to paint disabled/busy control state
        await new Promise(resolve => setTimeout(resolve, 10));

        // Stale check before starting generation
        if (genId !== _generationId || requestedSize !== BOARD_CONFIG.boardSize) {
            return;
        }

        const cellCount = BOARD_CONFIG.cellCount;
        // Keep current puzzle untouched until replacement is ready
        const { puzzle, solution } = generatePuzzle(diffCfg.clues);

        // Stale check after generation finishes
        if (genId !== _generationId || requestedSize !== BOARD_CONFIG.boardSize) {
            return;
        }

        // Apply new game state atomically
        state.board        = [...puzzle];
        state.initialBoard = [...puzzle];
        state.solution     = [...solution];
        state.given        = puzzle.map(v => v !== 0);
        state.initialGiven = puzzle.map(v => v !== 0);
        state.notes        = Array.from({ length: cellCount }, () => new Set());
        state.errors       = Array(cellCount).fill(false);
        state.heatmap      = Array(cellCount).fill(0);
        state.selected     = -1;
        state.selectedNum  = -1;
        state.mistakes     = 0;
        state.maxMistakes  = BOARD_CONFIG.maxMistakes;
        state.score        = 0;
        state.hintsLeft    = BOARD_CONFIG.maxHints;
        state.hintsUsed    = 0;
        state.history      = [];
        state.historyLog   = [];
        state.gameActive   = true;

        const hintEl = document.getElementById('hint-count');
        if (hintEl) hintEl.textContent = `(${BOARD_CONFIG.maxHints})`;
        const histEl = document.getElementById('history-list');
        if (histEl) histEl.innerHTML = '';

        stopTimer();
        state.timerSec = 0;
        startTimer();

        if (_ui.renderBoard) _ui.renderBoard();
        if (_ui.renderNumPad) _ui.renderNumPad();
        if (_ui.updateBestTimes) _ui.updateBestTimes();
    } catch (err) {
        console.error('Failed to initialize new game:', err);
        if (_ui.showToast) _ui.showToast('Error generating puzzle. Retrying...', 'error');
    } finally {
        // Guarantee UI controls are restored
        if (genId === _generationId) {
            _setGeneratingState(false);
        }
    }
}

// ── ACTIVE GAME DETECTION ───────────────────────────────────────────────────
export function hasGameProgress() {
    if (!state.gameActive) return false;
    if (state.mistakes > 0 || state.hintsUsed > 0) return true;
    if (state.history && state.history.length > 0) return true;
    if (state.notes && state.notes.some(s => s && s.size > 0)) return true;
    const cellCount = BOARD_CONFIG.cellCount;
    for (let i = 0; i < cellCount; i++) {
        if (!state.given[i] && state.board[i] !== 0) return true;
    }
    if (state.timerSec > 0) return true;
    return false;
}

// ── DIFFICULTY ───────────────────────────────────────────────────────────────
export async function setDifficulty(d) {
    if (_isGenerating || d === state.difficulty) return;
    if (hasGameProgress()) {
        const wasTimerActive = state.timerActive;
        stopTimer();
        let ok = false;
        if (_ui.showConfirmModal) {
            ok = await _ui.showConfirmModal({
                title: 'Change Difficulty?',
                message: 'Abandon your current game progress to change difficulty?'
            });
        } else {
            ok = window.confirm('Abandon your current game progress to change difficulty?');
        }
        if (!ok) {
            if (wasTimerActive) startTimer();
            return;
        }
    }
    state.difficulty = d;
    document.querySelectorAll('.diff-btn').forEach(b => {
        const active = b.dataset.diff === d;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    await newGame();
}

// ── BOARD SIZE SWITCH ─────────────────────────────────────────────────────────
/**
 * Switch the active board size and start a fresh game.
 * This is the single entry point for all board-size changes.
 * Adding future sizes (16, 25) requires no changes here.
 * @param {number} size - one of 4, 9, 16, 25
 */
export async function setBoardSizeAndNewGame(size) {
    if (_isGenerating || size === BOARD_CONFIG.boardSize) return;
    if (hasGameProgress()) {
        const wasTimerActive = state.timerActive;
        stopTimer();
        let ok = false;
        if (_ui.showConfirmModal) {
            ok = await _ui.showConfirmModal({
                title: 'Change Board Size?',
                message: 'Abandon your current game progress to change board size?'
            });
        } else {
            ok = window.confirm('Abandon your current game progress to change board size?');
        }
        if (!ok) {
            if (wasTimerActive) startTimer();
            return;
        }
    }
    setBoardSize(size);           // mutates BOARD_CONFIG in place
    state.boardSizeKey = size;

    // Sync the size-selector buttons
    document.querySelectorAll('.size-btn').forEach(b => {
        const active = +b.dataset.size === size;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    // Update board ARIA dimensions
    const bs = BOARD_CONFIG.boardSize;
    const boardEl = document.getElementById('sudoku-board');
    if (boardEl) {
        boardEl.setAttribute('aria-label', `Sudoku grid, ${bs} rows and ${bs} columns`);
        boardEl.setAttribute('aria-rowcount', bs);
        boardEl.setAttribute('aria-colcount', bs);
    }

    // Update the keyboard hint to reflect valid input range
    const kbNumHint = document.getElementById('kb-num-hint');
    if (kbNumHint) {
        kbNumHint.textContent = bs <= 9 ? `1-${bs}` : `1-9 · A-${toSymbol(bs)}`;
    }

    await newGame();
}

// ── RESET ────────────────────────────────────────────────────────────────────
export async function confirmReset() {
    if (!state.gameActive) return;
    const wasTimerActive = state.timerActive;
    stopTimer();
    let ok = false;
    if (_ui.showConfirmModal) {
        ok = await _ui.showConfirmModal({
            title: 'Reset Progress?',
            message: 'Reset all your progress on this puzzle?'
        });
    } else {
        ok = window.confirm('Reset all your progress on this puzzle?');
    }
    if (!ok) {
        if (wasTimerActive) startTimer();
        return;
    }
    const cellCount = BOARD_CONFIG.cellCount;
    state.board        = [...state.initialBoard];
    state.given        = [...state.initialGiven];
    state.notes        = Array.from({ length: cellCount }, () => new Set());
    state.errors       = Array(cellCount).fill(false);
    state.mistakes     = 0;
    state.score        = 0;
    state.hintsLeft    = BOARD_CONFIG.maxHints;
    state.hintsUsed    = 0;
    state.history      = [];
    state.historyLog   = [];
    state.selected     = -1;
    state.selectedNum  = -1;

    const hintEl = document.getElementById('hint-count');
    if (hintEl) hintEl.textContent = `(${BOARD_CONFIG.maxHints})`;
    const mistEl = document.getElementById('mistakes-val');
    if (mistEl) mistEl.textContent = `0/${state.maxMistakes}`;
    const scoreEl = document.getElementById('score-val');
    if (scoreEl) scoreEl.textContent = '0';
    const histEl = document.getElementById('history-list');
    if (histEl) histEl.innerHTML = '';

    if (wasTimerActive) startTimer();

    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (_ui.showToast) _ui.showToast('🔄 Board reset', 'info');
}

// ── TOGGLE OPTION ────────────────────────────────────────────────────────────
export function toggleOpt(key) {
    state.opts[key] = !state.opts[key];
    const tog = document.getElementById('tog-' + key);
    if (tog) {
        tog.classList.toggle('on', state.opts[key]);
        tog.setAttribute('aria-checked', state.opts[key] ? 'true' : 'false');
    }
    if (_ui.updateBoardDisplay) _ui.updateBoardDisplay();
    if (key === 'notes' && _ui.showToast) _ui.showToast(state.opts.notes ? '📝 Notes mode ON' : '📝 Notes mode OFF', 'info');
}
