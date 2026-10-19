// ── SUDOKU CORE — shared constants & state ───────────────────────────────────
// No DOM manipulation.

import { BOARD_CONFIG } from './config.js';
import { loadBestTimes } from '../utils/storage.js';

// ── RE-EXPORT DIFFICULTY CONFIG ───────────────────────────────────────────────
// DIFF_CONFIG is now a getter so it always reflects the active board size.
// All modules that imported DIFF_CONFIG as a plain object must access it
// through state or via this getter at call-time.
export function DIFF_CONFIG() { return BOARD_CONFIG.difficulty; }

// ── GAME STATE ───────────────────────────────────────────────────────────────
// Array fields are initialised to 9×9 at startup (the default).
// newGame() always re-allocates them to match BOARD_CONFIG.cellCount.
export const state = {
    board:        Array(BOARD_CONFIG.cellCount).fill(0),
    initialBoard: Array(BOARD_CONFIG.cellCount).fill(0),
    solution:     Array(BOARD_CONFIG.cellCount).fill(0),
    given:        Array(BOARD_CONFIG.cellCount).fill(false),
    initialGiven: Array(BOARD_CONFIG.cellCount).fill(false),
    notes:        Array.from({ length: BOARD_CONFIG.cellCount }, () => new Set()),
    errors:      Array(BOARD_CONFIG.cellCount).fill(false),
    selected:    -1,
    difficulty:  'medium',
    mistakes:    0, maxMistakes: BOARD_CONFIG.maxMistakes,
    score:       0,
    hintsLeft:   BOARD_CONFIG.maxHints, hintsUsed: 0,
    timerSec:    0, timerActive: false, timerRef: null,
    history:     [],
    historyLog:  [],
    heatmap:     Array(BOARD_CONFIG.cellCount).fill(0),
    opts: { related: true, samenum: true, mistakes: true, notes: false, autonotes: true },
    bestTimes:   loadBestTimes(),
    gameActive:  false,
    selectedNum: -1,
    boardSizeKey: 9,   // which size is active (used by UI to sync selector)
};
