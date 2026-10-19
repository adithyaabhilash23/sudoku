// ── LOCAL STORAGE ────────────────────────────────────────────────────────────
// All reads use safeParseJSON() so corrupted data can never crash the app.

const BEST_KEY = 'sudoku_best';

/**
 * Safely parse a JSON string.
 * If parsing fails, logs a warning, removes the corrupted item, and returns
 * the supplied fallback so the application continues normally.
 *
 * @template T
 * @param {string|null} raw      - Raw string from localStorage (may be null).
 * @param {T}           fallback - Value to return on parse failure.
 * @param {string}      [key]    - Storage key, used only for the warning message.
 * @returns {T}
 */
function safeParseJSON(raw, fallback, key = '') {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
        const parsed = JSON.parse(raw);
        if (typeof fallback === 'object' && fallback !== null && !Array.isArray(fallback)) {
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('Parsed value is not a plain object');
            }
        }
        return parsed;
    } catch (err) {
        console.warn(
            `[Storage] Failed to parse localStorage key "${key}". ` +
            `Resetting to default. (${err.message})`
        );
        if (key) {
            try { localStorage.removeItem(key); } catch (_) {}
        }
        return fallback;
    }
}

/**
 * Load best times from localStorage partitioned by board size.
 * Handles backward-compatible migration from legacy flat format ({ easy, medium... }).
 * Returns an object with entries for each board size (4, 9, 16, 25).
 * @returns {Object<number, Object<string, number>>}
 */
export function loadBestTimes() {
    const clean = { 4: {}, 9: {}, 16: {}, 25: {} };
    const difficulties = ['easy', 'medium', 'hard', 'expert'];
    try {
        const raw = localStorage.getItem(BEST_KEY);
        const parsed = safeParseJSON(raw, clean, BEST_KEY);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return clean;
        }

        // Backward compatibility: check if stored data is legacy flat format { easy, medium... }
        const hasSizeKeys = [4, 9, 16, 25].some(s => s in parsed || String(s) in parsed);
        if (!hasSizeKeys) {
            const isLegacyFlat = Object.keys(parsed).some(k => difficulties.includes(k));
            if (isLegacyFlat) {
                clean[9] = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (difficulties.includes(k) && typeof v === 'number' && !isNaN(v) && v >= 0) {
                        clean[9][k] = v;
                    }
                }
                saveBestTimes(clean);
                return clean;
            }
        }

        // Nested format: { 4: {...}, 9: {...}, 16: {...}, 25: {...} }
        for (const size of [4, 9, 16, 25]) {
            clean[size] = {};
            const sizeData = parsed[size] || parsed[String(size)];
            if (sizeData && typeof sizeData === 'object' && !Array.isArray(sizeData)) {
                for (const [k, v] of Object.entries(sizeData)) {
                    if (difficulties.includes(k) && typeof v === 'number' && !isNaN(v) && v >= 0) {
                        clean[size][k] = v;
                    }
                }
            }
        }
        return clean;
    } catch (err) {
        console.warn(`[Storage] Failed to read localStorage key "${BEST_KEY}". (${err.message})`);
        return clean;
    }
}

/**
 * Save best times object to localStorage.
 * @param {Object} bestTimes
 */
export function saveBestTimes(bestTimes) {
    if (typeof bestTimes !== 'object' || bestTimes === null || Array.isArray(bestTimes)) return;
    try {
        localStorage.setItem(BEST_KEY, JSON.stringify(bestTimes));
    } catch (err) {
        console.warn(`[Storage] Failed to save best times to localStorage: ${err.message}`);
    }
}
