/**
 * Attribute system scaffolding (plan `game/attributes.js` — speed, accel, trail, nitro, handling).
 * Numeric mapping for playtest lives in `config.js` (`getArenaPlaytestConfig`); this module holds
 * shared clamps and IDs for editor / garage / enemies later.
 */

import { nitroBarsFromAttributeLevel } from "./nitroSystem.js";

/** @type {readonly string[]} */
export const ATTRIBUTE_KEYS = Object.freeze([
  "speed",
  "acceleration",
  "trailLength",
  "nitroBars",
  "handling",
]);

/** Enemy-only attribute (AI tuning). */
export const ENEMY_INTELLIGENCE_KEY = "intelligence";

/**
 * @param {unknown} n
 * @returns {number} integer in [1, 10]
 */
export function clampAttributeLevel(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(10, v));
}

export { nitroBarsFromAttributeLevel };
