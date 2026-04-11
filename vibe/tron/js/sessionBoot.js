/**
 * One-shot session routing after `playTunnel` + `location.reload` (plan P5.7 / P7.2).
 * Survives reload via `sessionStorage`; consumed once after BOOT tunnel.
 */

const KEY = "tron-session-boot-v1";

/**
 * @returns {Record<string, unknown> | null}
 */
export function peekSessionBootTarget() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : null;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown> | null} obj — null clears
 */
export function setSessionBootTarget(obj) {
  if (obj == null) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify(obj));
}

/**
 * @returns {Record<string, unknown> | null}
 */
export function consumeSessionBootTarget() {
  const v = peekSessionBootTarget();
  sessionStorage.removeItem(KEY);
  return v;
}
