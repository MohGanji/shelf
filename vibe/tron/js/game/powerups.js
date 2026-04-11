/**
 * Power-up types and categories (plan Phase 3). Pickup wiring comes in P3.1+.
 */

import { POWERUP_COLORS } from "../config.js";

export { POWERUP_COLORS };

/** @typedef {"instant" | "level_permanent" | "equippable"} PowerupCategory */

/** Maps level JSON `type` string → category (aligned with `levels/schema.js`). */
export const POWERUP_TYPE_CATEGORY = Object.freeze(
  /** @type {Readonly<Record<string, PowerupCategory>>} */ ({
    nitro_recharge: "instant",
    trail_extend: "level_permanent",
    nitro_capacity: "level_permanent",
    shield: "equippable",
  }),
);

/**
 * @param {string} type
 * @returns {PowerupCategory | null}
 */
export function getPowerupCategory(type) {
  return POWERUP_TYPE_CATEGORY[type] ?? null;
}
