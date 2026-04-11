/**
 * Enemy AI scaffolding (plan Phase 4). Steering and hunting logic land in P4.2+.
 */

/** Intelligence 1–3 → Easy tier (plan § AI Difficulty Tiers). */
export const INTELLIGENCE_EASY_MAX = 3;

/** Intelligence 4–7 → Medium tier. */
export const INTELLIGENCE_MEDIUM_MAX = 7;

/**
 * @param {number} intelligence — 1–10
 * @returns {"easy" | "medium" | "hard"}
 */
export function intelligenceTier(intelligence) {
  const i = Math.max(1, Math.min(10, Math.floor(intelligence)));
  if (i <= INTELLIGENCE_EASY_MAX) return "easy";
  if (i <= INTELLIGENCE_MEDIUM_MAX) return "medium";
  return "hard";
}
