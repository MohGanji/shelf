/**
 * P6.9 — Session-only flag: after editor play-test, lobby can offer "Return to Editor".
 * Survives reload (sessionStorage); not in player save. Cleared on dismiss, any lobby gate ride, or quit.
 */

const KEY = "tron-editor-playtest-return-v1";

/**
 * @returns {{ levelId: string } | null}
 */
export function peekEditorPlaytestReturn() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const levelId = o.levelId;
    if (typeof levelId !== "string" || !levelId.trim()) return null;
    return { levelId: levelId.trim() };
  } catch {
    return null;
  }
}

/**
 * @param {{ levelId: string } | null} obj — null clears
 */
export function setEditorPlaytestReturn(obj) {
  if (obj == null) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify({ levelId: obj.levelId }));
}
