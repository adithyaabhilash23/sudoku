// ── BOARD CONFIGURATION ───────────────────────────────────────────────────────
// Single source of truth for all board-size constants.
//
// DESIGN: activeConfig is a plain object whose properties are read at call-time
// by every engine module. Calling setBoardSize() mutates it in place, so a
// single import is sufficient — no module needs to be reloaded.
//
// To add 16×16 or 25×25: add an entry to BOARD_SIZES and enable the button.

// ── PER-SIZE DEFINITIONS ──────────────────────────────────────────────────────
/**
 * Registry of every supported board size.
 * Adding a new size here is the ONLY code change required to support it
 * (plus enabling its HTML button).
 *
 * clueRatios: fraction of cells that remain as given clues per difficulty.
 * These are tuned so each size feels appropriately challenging.
 */
export const BOARD_SIZES = Object.freeze({
    4: Object.freeze({
        boardSize:    4,
        boxRows:      2,
        boxCols:      2,
        maxHints:     2,
        maxMistakes:  3,
        label:        '4×4',
        cellFont:     '32px',  // typography: larger cells, fewer numbers
        noteFont:     '12px',
        dotSize:      '32px',  // legacy dot compatibility
        dotOffset:    '7px',
        glowStart:    'rgba(0, 214, 143, 0.26)',
        glowMid:      'rgba(0, 214, 143, 0.10)',
        glowMidStop:  '24%',
        glowSpread:   '60%',
        difficulty: Object.freeze({
            easy:   { clues: 12, label: 'Easy',   color: '#00d68f' },
            medium: { clues: 10, label: 'Medium', color: '#4fc3f7' },
            hard:   { clues:  8, label: 'Hard',   color: '#ffb74d' },
            expert: { clues:  6, label: 'Expert', color: '#e94560' },
        }),
    }),
    9: Object.freeze({
        boardSize:    9,
        boxRows:      3,
        boxCols:      3,
        maxHints:     3,
        maxMistakes:  3,
        label:        '9×9',
        cellFont:     '22px',  // typography: reference size — must match current appearance
        noteFont:     '9px',
        dotSize:      '14px',  // legacy dot compatibility
        dotOffset:    '3px',
        glowStart:    'rgba(0, 214, 143, 0.22)',
        glowMid:      'rgba(0, 214, 143, 0.08)',
        glowMidStop:  '20%',
        glowSpread:   '48%',
        difficulty: Object.freeze({
            easy:   { clues: 45, label: 'Easy',   color: '#00d68f' },
            medium: { clues: 35, label: 'Medium', color: '#4fc3f7' },
            hard:   { clues: 28, label: 'Hard',   color: '#ffb74d' },
            expert: { clues: 22, label: 'Expert', color: '#e94560' },
        }),
    }),
    16: Object.freeze({
        boardSize:    16,
        boxRows:      4,
        boxCols:      4,
        maxHints:     5,
        maxMistakes:  3,
        label:        '16×16',
        cellFont:     '16px',  // typography: smaller cells, more numbers
        noteFont:     '6px',
        dotSize:      '8px',   // legacy dot compatibility
        dotOffset:    '2px',
        glowStart:    'rgba(0, 214, 143, 0.18)',
        glowMid:      'rgba(0, 214, 143, 0.06)',
        glowMidStop:  '16%',
        glowSpread:   '38%',
        difficulty: Object.freeze({
            easy:   { clues: 160, label: 'Easy',   color: '#00d68f' },
            medium: { clues: 130, label: 'Medium', color: '#4fc3f7' },
            hard:   { clues: 100, label: 'Hard',   color: '#ffb74d' },
            expert: { clues:  80, label: 'Expert', color: '#e94560' },
        }),
    }),
    25: Object.freeze({
        boardSize:    25,
        boxRows:      5,
        boxCols:      5,
        maxHints:     7,
        maxMistakes:  3,
        label:        '25×25',
        cellFont:     '12px',  // typography: very small cells — must stay legible
        noteFont:     '4px',
        dotSize:      '5px',   // legacy dot compatibility
        dotOffset:    '1px',
        glowStart:    'rgba(0, 214, 143, 0.14)',
        glowMid:      'rgba(0, 214, 143, 0.04)',
        glowMidStop:  '12%',
        glowSpread:   '32%',
        difficulty: Object.freeze({
            easy:   { clues: 390, label: 'Easy',   color: '#00d68f' }, // ~62% of 625
            medium: { clues: 315, label: 'Medium', color: '#4fc3f7' }, // ~50%
            hard:   { clues: 245, label: 'Hard',   color: '#ffb74d' }, // ~39%
            expert: { clues: 195, label: 'Expert', color: '#e94560' }, // ~31%
        }),
    }),

});


// ── ACTIVE CONFIGURATION ──────────────────────────────────────────────────────
// All engine modules import this object and read its properties at call-time.
// Do NOT destructure at module level — that would capture the initial value.
//
// Getter properties are re-computed each access so they always reflect the
// current boardSize without extra bookkeeping.

export const BOARD_CONFIG = {
    boardSize:   9,
    boxRows:     3,
    boxCols:     3,
    maxHints:    3,
    maxMistakes: 3,
    cellFont:    '22px',  // updated by setBoardSize()
    noteFont:    '9px',
    dotSize:     '14px',  // updated by setBoardSize()
    dotOffset:   '3px',   // updated by setBoardSize()
    glowStart:   'rgba(0, 214, 143, 0.22)',
    glowMid:     'rgba(0, 214, 143, 0.08)',
    glowMidStop: '20%',
    glowSpread:  '48%',
    get cellCount() { return this.boardSize * this.boardSize; },
    get symbols()   { return Array.from({ length: this.boardSize }, (_, i) => i + 1); },
    difficulty:  BOARD_SIZES[9].difficulty,
};

/**
 * Switch the active configuration to a different board size.
 * Mutates BOARD_CONFIG in place so every module that holds a reference to it
 * automatically sees the new values on their next call.
 *
 * @param {4|9|16|25} size
 */
export function setBoardSize(size) {
    const def = BOARD_SIZES[size];
    if (!def) throw new Error(`Board size ${size} is not defined in BOARD_SIZES.`);
    BOARD_CONFIG.boardSize   = def.boardSize;
    BOARD_CONFIG.boxRows     = def.boxRows;
    BOARD_CONFIG.boxCols     = def.boxCols;
    BOARD_CONFIG.maxHints    = def.maxHints;
    BOARD_CONFIG.maxMistakes = def.maxMistakes;
    BOARD_CONFIG.cellFont    = def.cellFont;
    BOARD_CONFIG.noteFont    = def.noteFont;
    BOARD_CONFIG.dotSize     = def.dotSize;
    BOARD_CONFIG.dotOffset   = def.dotOffset;
    BOARD_CONFIG.glowStart   = def.glowStart;
    BOARD_CONFIG.glowMid     = def.glowMid;
    BOARD_CONFIG.glowMidStop = def.glowMidStop;
    BOARD_CONFIG.glowSpread  = def.glowSpread;
    BOARD_CONFIG.difficulty  = def.difficulty;
}

// ── LEGACY NAMED EXPORTS ──────────────────────────────────────────────────────
// These are kept so existing imports compile without change, but they are now
// GETTER FUNCTIONS — call them, don't read them as static constants.
// All engine code was already using BOARD_CONFIG properties via the object;
// the only places that used bare constants are re-pointed here.

/** @returns {number} Current board size. */
export function BOARD_SIZE()  { return BOARD_CONFIG.boardSize; }

/** @returns {number} Rows per sub-box. */
export function BOX_ROWS()    { return BOARD_CONFIG.boxRows; }

/** @returns {number} Cols per sub-box. */
export function BOX_COLS()    { return BOARD_CONFIG.boxCols; }

/** @returns {number} Total cell count. */
export function CELL_COUNT()  { return BOARD_CONFIG.cellCount; }

/** @returns {number[]} Array of valid symbols. */
export function SYMBOLS()     { return BOARD_CONFIG.symbols; }
