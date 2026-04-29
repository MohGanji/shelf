/**
 * Intelligence tiers and shared tuning reference for speed-scaled heuristics.
 * Rewritten for all-enemy intelligence: always full tier, with baked randomness.
 */

export const AI_SPEED_TUNE_REF = 66;

// All enemies now full intelligence - tiers only for legacy
export const INTELLIGENCE_EASY_MAX = 10;
export const INTELLIGENCE_MEDIUM_MAX = 10;

/**
 * @param {number} intelligence — 1–10
 * @returns {"hard"}
 */
export function intelligenceTier(intelligence) {
  // All enemies intelligent per criteria - no dumbing down
  return "hard";
}

/**
 * @param {number} ang
 */
export function wrapAngle(ang) {
  let a = ang;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Simple deterministic hash-based 'random' bias per enemy (0-1 range).
 * Uses selfId to seed so behavior consistent per enemy but varies across enemies.
 * Provides the baked-in randomness without true Math.random() for determinism in replays.
 * @param {string} selfId
 * @param {string} [key='default']
 * @param {number} [range=0.6]
 * @returns {number} bias in ~[0.2, 0.8] range centered on 0.5
 */
export function getEnemyBias(selfId, key = 'default', range = 0.6) {
  if (!selfId || typeof selfId !== 'string') return 0.5;
  let hash = 0;
  const str = selfId + key;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32-bit int
  }
  const normalized = (Math.abs(hash) % 1000) / 1000;
  return 0.2 + (normalized * range); // 0.2 to 0.8-ish for controlled variance
}

/**
 * Always full flank for intelligent enemies.
 */
export function flankBlendForTier(tier) {
  return 0.48; // full for all per unification
}
