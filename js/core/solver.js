// ── SOLVER ───────────────────────────────────────────────────────────────────
// High-performance Sudoku Solver & Solution Counter.
// Uses fast 32-bit bitmasks, constraint propagation (naked singles deduction),
// Minimum Remaining Values (MRV) heuristic, and strict execution timeout guards.
// Reads board geometry from BOARD_CONFIG at call-time.

import { shuffle } from '../utils/helpers.js';
import { BOARD_CONFIG } from './config.js';

export const SOLVE_STATUS = Object.freeze({
    SOLVED: 'SOLVED',
    UNSOLVABLE: 'UNSOLVABLE',
    TIMEOUT: 'TIMEOUT'
});

/**
 * Fast population count for 32-bit integer (Hamming weight).
 * @param {number} n
 * @returns {number}
 */
function _popcount(n) {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * Solve a puzzle board with detailed status reporting and execution time limits.
 * Mutates board in-place on success; cleanly rolls back on failure or timeout.
 *
 * @param {number[]} board
 * @param {boolean}  randomize - shuffle candidate order for randomised generation
 * @param {number}   maxTimeMs - maximum allowed execution time before timeout
 * @returns {{ success: boolean, status: string, timeMs: number }}
 */
export function solveWithStatus(board, randomize = false, maxTimeMs = 5000) {
    const startTime = performance.now();
    const deadline  = startTime + maxTimeMs;

    const boardSize = BOARD_CONFIG.boardSize;
    const boxRows   = BOARD_CONFIG.boxRows;
    const boxCols   = BOARD_CONFIG.boxCols;
    const cellCount = BOARD_CONFIG.cellCount;
    const numBoxesX = boardSize / boxCols;

    // Bitmask for all valid numbers 1..boardSize (bits 1 to boardSize)
    const ALL_MASK  = (1 << (boardSize + 1)) - 2;

    const rowMask = new Int32Array(boardSize);
    const colMask = new Int32Array(boardSize);
    const boxMask = new Int32Array(boardSize);

    const cellRow = new Int32Array(cellCount);
    const cellCol = new Int32Array(cellCount);
    const cellBox = new Int32Array(cellCount);

    const snapshot = board.slice();
    let emptyCount = 0;

    for (let i = 0; i < cellCount; i++) {
        const r = Math.floor(i / boardSize);
        const c = i % boardSize;
        const b = Math.floor(r / boxRows) * numBoxesX + Math.floor(c / boxCols);
        cellRow[i] = r;
        cellCol[i] = c;
        cellBox[i] = b;

        const v = board[i];
        if (v !== 0) {
            const bit = 1 << v;
            if ((rowMask[r] & bit) || (colMask[c] & bit) || (boxMask[b] & bit)) {
                return {
                    success: false,
                    status: SOLVE_STATUS.UNSOLVABLE,
                    timeMs: +(performance.now() - startTime).toFixed(2)
                };
            }
            rowMask[r] |= bit;
            colMask[c] |= bit;
            boxMask[b] |= bit;
        } else {
            emptyCount++;
        }
    }

    let timedOut = false;

    function rollback(filled) {
        for (let k = filled.length - 1; k >= 0; k--) {
            const idx = filled[k];
            const val = board[idx];
            const bit = 1 << val;
            board[idx] = 0;
            rowMask[cellRow[idx]] &= ~bit;
            colMask[cellCol[idx]] &= ~bit;
            boxMask[cellBox[idx]] &= ~bit;
            emptyCount++;
        }
    }

    // Constraint propagation: find and fill all naked singles
    function propagateSingles() {
        let changed = true;
        const filled = [];
        while (changed) {
            changed = false;
            for (let i = 0; i < cellCount; i++) {
                if (board[i] !== 0) continue;
                const r = cellRow[i], c = cellCol[i], b = cellBox[i];
                const mask = ALL_MASK & ~(rowMask[r] | colMask[c] | boxMask[b]);
                if (mask === 0) {
                    rollback(filled);
                    return null; // Contradiction
                }
                if ((mask & (mask - 1)) === 0) {
                    const val = 31 - Math.clz32(mask);
                    const bit = 1 << val;
                    board[i] = val;
                    rowMask[r] |= bit;
                    colMask[c] |= bit;
                    boxMask[b] |= bit;
                    emptyCount--;
                    filled.push(i);
                    changed = true;
                }
            }
        }
        return filled;
    }

    function search() {
        if (performance.now() > deadline) {
            timedOut = true;
            return false;
        }

        if (emptyCount === 0) return true;

        const filledSingles = propagateSingles();
        if (filledSingles === null) {
            return false;
        }

        if (emptyCount === 0) return true;

        // MRV: Pick empty cell with the fewest remaining candidates
        let minCandidates = boardSize + 1;
        let bestIdx = -1;
        let bestMask = 0;

        for (let i = 0; i < cellCount; i++) {
            if (board[i] !== 0) continue;
            const r = cellRow[i], c = cellCol[i], b = cellBox[i];
            const mask = ALL_MASK & ~(rowMask[r] | colMask[c] | boxMask[b]);
            if (mask === 0) {
                rollback(filledSingles);
                return false;
            }
            const count = _popcount(mask);
            if (count < minCandidates) {
                minCandidates = count;
                bestIdx = i;
                bestMask = mask;
                if (count === 2) break; // MRV cannot be 1 as singles were propagated
            }
        }

        if (bestIdx === -1) {
            rollback(filledSingles);
            return true;
        }

        const candidates = [];
        let m = bestMask;
        while (m > 0) {
            const bit = m & -m;
            candidates.push(31 - Math.clz32(bit));
            m &= m - 1;
        }

        if (randomize) {
            for (let j = candidates.length - 1; j > 0; j--) {
                const r = Math.floor(Math.random() * (j + 1));
                [candidates[j], candidates[r]] = [candidates[r], candidates[j]];
            }
        }

        const br = cellRow[bestIdx];
        const bc = cellCol[bestIdx];
        const bb = cellBox[bestIdx];

        for (const val of candidates) {
            const bit = 1 << val;
            board[bestIdx] = val;
            rowMask[br] |= bit;
            colMask[bc] |= bit;
            boxMask[bb] |= bit;
            emptyCount--;

            if (search()) return true;
            if (timedOut) break;

            board[bestIdx] = 0;
            rowMask[br] &= ~bit;
            colMask[bc] &= ~bit;
            boxMask[bb] &= ~bit;
            emptyCount++;
        }

        rollback(filledSingles);
        return false;
    }

    const success = search();
    const duration = +(performance.now() - startTime).toFixed(2);

    if (!success) {
        // Rollback board to original snapshot on failure or timeout
        for (let i = 0; i < cellCount; i++) {
            board[i] = snapshot[i];
        }
    }

    const status = timedOut
        ? SOLVE_STATUS.TIMEOUT
        : (success ? SOLVE_STATUS.SOLVED : SOLVE_STATUS.UNSOLVABLE);

    return { success, status, timeMs: duration };
}

/**
 * Backtracking solver with constraint propagation and timeout protection.
 * Mutates board in-place on success. Preserves backward compatibility.
 *
 * @param {number[]} board
 * @param {boolean}  randomize - shuffle candidates for puzzle generation
 * @param {number}   maxTimeMs - maximum search duration
 * @returns {boolean}
 */
export function solve(board, randomize = false, maxTimeMs = 5000) {
    const res = solveWithStatus(board, randomize, maxTimeMs);
    solve.lastStatus = res.status;
    return res.success;
}

solve.lastStatus = null;

// ── COUNT SOLUTIONS ───────────────────────────────────────────────────────────
/**
 * Count solutions up to `limit` with fast bitmasks and execution timeout guard.
 *
 * @param {number[]} board
 * @param {number}   limit
 * @param {number}   maxTimeMs
 * @returns {number}
 */
export function countSolutions(board, limit = 2, maxTimeMs = 2000) {
    const startTime = performance.now();
    const deadline  = startTime + maxTimeMs;

    const boardSize = BOARD_CONFIG.boardSize;
    const boxRows   = BOARD_CONFIG.boxRows;
    const boxCols   = BOARD_CONFIG.boxCols;
    const cellCount = BOARD_CONFIG.cellCount;
    const numBoxesX = boardSize / boxCols;
    const ALL_MASK  = (1 << (boardSize + 1)) - 2;

    const rowMask = new Int32Array(boardSize);
    const colMask = new Int32Array(boardSize);
    const boxMask = new Int32Array(boardSize);

    const cellRow = new Int32Array(cellCount);
    const cellCol = new Int32Array(cellCount);
    const cellBox = new Int32Array(cellCount);

    let emptyCount = 0;
    for (let i = 0; i < cellCount; i++) {
        const r = Math.floor(i / boardSize);
        const c = i % boardSize;
        const b = Math.floor(r / boxRows) * numBoxesX + Math.floor(c / boxCols);
        cellRow[i] = r;
        cellCol[i] = c;
        cellBox[i] = b;

        const v = board[i];
        if (v !== 0) {
            const bit = 1 << v;
            if ((rowMask[r] & bit) || (colMask[c] & bit) || (boxMask[b] & bit)) {
                return 0; // Contradiction in initial clues
            }
            rowMask[r] |= bit;
            colMask[c] |= bit;
            boxMask[b] |= bit;
        } else {
            emptyCount++;
        }
    }

    let solutionsFound = 0;

    function countSearch() {
        if (performance.now() > deadline || solutionsFound >= limit) {
            return;
        }

        if (emptyCount === 0) {
            solutionsFound++;
            return;
        }

        // Pick empty cell with fewest remaining candidates (MRV)
        let minCandidates = boardSize + 1;
        let bestIdx = -1;
        let bestMask = 0;

        for (let i = 0; i < cellCount; i++) {
            if (board[i] !== 0) continue;
            const r = cellRow[i], c = cellCol[i], b = cellBox[i];
            const mask = ALL_MASK & ~(rowMask[r] | colMask[c] | boxMask[b]);
            if (mask === 0) return; // Dead end
            const count = _popcount(mask);
            if (count < minCandidates) {
                minCandidates = count;
                bestIdx = i;
                bestMask = mask;
                if (count === 1) break;
            }
        }

        if (bestIdx === -1) {
            solutionsFound++;
            return;
        }

        const candidates = [];
        let m = bestMask;
        while (m > 0) {
            const bit = m & -m;
            candidates.push(31 - Math.clz32(bit));
            m &= m - 1;
        }

        const br = cellRow[bestIdx];
        const bc = cellCol[bestIdx];
        const bb = cellBox[bestIdx];

        for (const val of candidates) {
            const bit = 1 << val;
            board[bestIdx] = val;
            rowMask[br] |= bit;
            colMask[bc] |= bit;
            boxMask[bb] |= bit;
            emptyCount--;

            countSearch();

            board[bestIdx] = 0;
            rowMask[br] &= ~bit;
            colMask[bc] &= ~bit;
            boxMask[bb] &= ~bit;
            emptyCount++;

            if (solutionsFound >= limit) break;
        }
    }

    countSearch();
    return solutionsFound;
}
