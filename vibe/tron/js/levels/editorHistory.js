/**
 * P6.6 — Undo/redo for WIP level editing (serialized snapshots; localStorage via existing upsert).
 */

/**
 * @param {Record<string, unknown>} level — mutated in place; keep a stable reference for the session
 * @param {{ maxEntries?: number }} [opts]
 */
export function createEditorHistory(level, opts = {}) {
  const maxEntries = opts.maxEntries ?? 80;

  /** @type {string[]} */
  const undoStack = [];
  /** @type {string[]} */
  const redoStack = [];

  function snapshot() {
    return JSON.stringify(level);
  }

  /**
   * @param {Record<string, unknown>} parsed
   */
  function replaceLevel(parsed) {
    const next = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(parsed)));
    for (const k of Object.keys(level)) delete level[k];
    Object.assign(level, next);
  }

  function beforeMutation() {
    undoStack.push(snapshot());
    if (undoStack.length > maxEntries) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (undoStack.length === 0) return false;
    redoStack.push(snapshot());
    const prev = /** @type {Record<string, unknown>} */ (JSON.parse(undoStack.pop()));
    replaceLevel(prev);
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    undoStack.push(snapshot());
    const next = /** @type {Record<string, unknown>} */ (JSON.parse(redoStack.pop()));
    replaceLevel(next);
    return true;
  }

  function clear() {
    undoStack.length = 0;
    redoStack.length = 0;
  }

  return {
    beforeMutation,
    undo,
    redo,
    clear,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
