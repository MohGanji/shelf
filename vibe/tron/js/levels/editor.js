/**
 * Level editor — WIP storage keys and helpers (plan Phase 6). Tile editor UI lands in P6.x.
 */

const WIP_PREFIX = "tron:levels:wip:";

/**
 * @param {string} levelId
 * @returns {string} localStorage key for a WIP level blob
 */
export function wipLevelStorageKey(levelId) {
  return `${WIP_PREFIX}${levelId}`;
}

/**
 * @returns {string} Prefix for iterating all WIP keys (future editor list)
 */
export function getWipLevelKeyPrefix() {
  return WIP_PREFIX;
}
