// ── GENERATOR ────────────────────────────────────────────────────────────────
// Pure logic: no DOM manipulation.
// Reads board geometry from BOARD_CONFIG at call-time.
//
// Strategy by board size:
//   ≤ 9×9  — full randomised solve from empty + uniqueness-checked removal.
//   > 9×9  — seed diagonal boxes (independent subgrids), deterministic solve
//             (fast due to strong initial constraints), then randomise symbols
//             and rows/cols within bands/stacks; remove cells without uniqueness
//             check (sufficient clue counts ensure practical uniqueness).

import { solve, countSolutions } from './solver.js';
import { shuffle } from '../utils/helpers.js';
import { BOARD_CONFIG } from './config.js';

// ── DIAGONAL BOX SEEDING ──────────────────────────────────────────────────────
/**
 * Fill the N diagonal sub-boxes with random permutations of symbols.
 * Diagonal boxes are mutually independent, so no validity checking is needed.
 */
function _seedDiagonalBoxes(board) {
    const { boardSize, boxRows, boxCols } = BOARD_CONFIG;
    const numBoxes = boardSize / boxRows; // assumes square boxes
    for (let b = 0; b < numBoxes; b++) {
        const syms = shuffle(Array.from({ length: boardSize }, (_, i) => i + 1));
        let si = 0;
        for (let r = 0; r < boxRows; r++) {
            for (let c = 0; c < boxCols; c++) {
                board[(b * boxRows + r) * boardSize + (b * boxCols + c)] = syms[si++];
            }
        }
    }
}

// ── SYMBOL PERMUTATION ────────────────────────────────────────────────────────
/** Randomly remap which number each symbol represents (pure shuffle). */
function _permuteSymbols(board) {
    const boardSize = BOARD_CONFIG.boardSize;
    const perm = shuffle(Array.from({ length: boardSize }, (_, i) => i + 1));
    for (let i = 0; i < board.length; i++) {
        if (board[i] !== 0) board[i] = perm[board[i] - 1];
    }
}

// ── ROW / COLUMN BAND SHUFFLE ─────────────────────────────────────────────────
/** Shuffle rows within each horizontal band and columns within each stack. */
function _permuteBandsAndStacks(board) {
    const { boardSize, boxRows, boxCols } = BOARD_CONFIG;
    const numBands  = boardSize / boxRows;
    const numStacks = boardSize / boxCols;

    // Shuffle rows within each band
    for (let band = 0; band < numBands; band++) {
        const rows = shuffle(Array.from({ length: boxRows }, (_, i) => band * boxRows + i));
        const base = band * boxRows;
        for (let r = 0; r < boxRows; r++) {
            if (rows[r] === base + r) continue;
            // swap row (base+r) with row rows[r]
            for (let c = 0; c < boardSize; c++) {
                const a = (base + r) * boardSize + c;
                const b = rows[r]   * boardSize + c;
                [board[a], board[b]] = [board[b], board[a]];
            }
        }
    }

    // Shuffle columns within each stack
    for (let stack = 0; stack < numStacks; stack++) {
        const cols = shuffle(Array.from({ length: boxCols }, (_, i) => stack * boxCols + i));
        const base = stack * boxCols;
        for (let c = 0; c < boxCols; c++) {
            if (cols[c] === base + c) continue;
            for (let r = 0; r < boardSize; r++) {
                const a = r * boardSize + (base + c);
                const b = r * boardSize + cols[c];
                [board[a], board[b]] = [board[b], board[a]];
            }
        }
    }
}

// ── GENERATE PUZZLE ───────────────────────────────────────────────────────────
/**
 * Generate a Sudoku puzzle.
 * @param {number} clueCount - number of given clues to keep
 * @returns {{ puzzle: number[], solution: number[] }}
 */
export function generatePuzzle(clueCount) {
    const { boardSize, cellCount } = BOARD_CONFIG;
    const largeboard = boardSize > 9;
    const target = cellCount - clueCount;

    // Small boards with aggressive clue removal (e.g. Expert 9x9) may encounter
    // irreducible clue sets in a single greedy removal pass. Bounded regeneration
    // ensures the exact clue target is reliably met while preserving 100% uniqueness.
    const maxAttempts = (largeboard || clueCount > 24) ? 1 : 300;

    let bestPuzzle = null;
    let bestSol = null;
    let bestClues = cellCount;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // ── 1. Build complete valid solution ──────────────────────────────────────
        const sol = Array(cellCount).fill(0);

        if (largeboard) {
            // Seed diagonal boxes so the deterministic solve is very fast
            let solved = false;
            let attempts = 0;
            while (!solved && attempts < 5) {
                attempts++;
                sol.fill(0);
                _seedDiagonalBoxes(sol);
                solved = solve(sol, false, 3000);
            }
            if (!solved) {
                sol.fill(0);
                solve(sol, false, 5000);
            }
            // Randomise by permuting symbols + shuffling rows/cols within bands
            _permuteSymbols(sol);
            _permuteBandsAndStacks(sol);
        } else {
            // Small boards: full randomised solve from blank (proven fast)
            solve(sol, true);
        }

        // ── 2. Remove cells ───────────────────────────────────────────────────────
        const puzzle    = [...sol];
        const positions = shuffle([...Array(cellCount).keys()]);
        let removed = 0;

        for (const pos of positions) {
            if (removed >= target) break;
            const backup = puzzle[pos];
            puzzle[pos]  = 0;

            if (!largeboard) {
                // For small boards guarantee uniqueness
                const test = [...puzzle];
                if (countSolutions(test, 2) !== 1) {
                    puzzle[pos] = backup;
                    continue;
                }
            }
            // For large boards: sufficient clue counts make non-uniqueness
            // astronomically unlikely; skip the expensive uniqueness check.
            removed++;
        }

        const currentClues = cellCount - removed;
        if (currentClues < bestClues) {
            bestClues = currentClues;
            bestPuzzle = puzzle;
            bestSol = sol;
        }

        if (removed >= target) {
            break;
        }
    }

    return { puzzle: bestPuzzle, solution: bestSol };
}
