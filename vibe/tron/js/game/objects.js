/**
 * Non-barrier arena objects: boost pads, portals (plan § Game Objects). Spawning / cooldowns — P3.5–P3.6.
 */

/** @typedef {"boost_pad" | "portal"} GameObjectKind */

export const GAME_OBJECT_TYPES = Object.freeze(
  /** @type {readonly GameObjectKind[]} */ (["boost_pad", "portal"]),
);

/**
 * @param {unknown} t
 * @returns {t is GameObjectKind}
 */
export function isGameObjectType(t) {
  return t === "boost_pad" || t === "portal";
}
