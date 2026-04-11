/**
 * Gate wall objects — neon arcs, triggers, signage (plan P5.6). Scene construction will call into this module later.
 */

import { GATE_WIDTH, LOBBY_LEVEL_ID } from "../levels/schema.js";

export { GATE_WIDTH };

/** @typedef {"north" | "south" | "east" | "west"} WallEdge */

/** @typedef {"entrance" | "exit" | "arena" | "garage" | "architect"} GateRole */

/** Canonical role strings (must match `levels/schema.js` validation). */
export const GATE_ROLES = Object.freeze(
  /** @type {readonly GateRole[]} */ ([
    "entrance",
    "exit",
    "arena",
    "garage",
    "architect",
  ]),
);

/**
 * @param {unknown} role
 * @returns {role is GateRole}
 */
export function isGateRole(role) {
  return typeof role === "string" && GATE_ROLES.includes(/** @type {GateRole} */ (role));
}

/**
 * Facing = wall inward normal (plan § Spawn System). Unit vector in XZ plane for stationary spawn heading.
 * @param {WallEdge} edge — which perimeter edge the gate sits on
 * @returns {{ x: number; z: number }}
 */
export function inwardNormalFromEdge(edge) {
  switch (edge) {
    case "south":
      return { x: 0, z: 1 };
    case "north":
      return { x: 0, z: -1 };
    case "east":
      return { x: -1, z: 0 };
    case "west":
      return { x: 1, z: 0 };
    default:
      return { x: 0, z: 1 };
  }
}

/**
 * @param {unknown} levelId
 * @returns {boolean}
 */
export function isLobbyLevelId(levelId) {
  return levelId === LOBBY_LEVEL_ID;
}
