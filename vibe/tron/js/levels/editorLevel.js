/**
 * P6.3 — WIP level bootstrap + gate clear zones + floor occupancy helpers.
 */

import { GATE_WIDTH, MIN_ARENA_SIZE } from "./schema.js";
import { getWipLevel, listWipLevelIds, upsertWipLevel } from "./loader.js";
import {
  LEVEL_SCHEMA_VERSION_V2,
  floorObjectOccupiedCells,
  getFloorObjectFootprint,
  getFloorObjectTopLeft,
  gridTopLeftToWorldCenter,
} from "./footprints.js";

/** Neon pair colors (plan § Portal) — same order as gameplay. */
export const PORTAL_PAIR_COLORS = Object.freeze([
  "#FF00FF",
  "#FFFF00",
  "#00FF88",
  "#FF4444",
  "#44AAFF",
]);

/**
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @returns {Record<string, unknown>}
 */
export function createBlankWipLevel(arenaWidth = 80, arenaDepth = 80) {
  const aw = Math.max(MIN_ARENA_SIZE, Math.floor(arenaWidth));
  const ad = Math.max(MIN_ARENA_SIZE, Math.floor(arenaDepth));
  const id = `wip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    schemaVersion: LEVEL_SCHEMA_VERSION_V2,
    id,
    name: "Untitled",
    arenaWidth: aw,
    arenaDepth: ad,
    mapWidth: aw + 2,
    mapDepth: ad + 2,
    wallObjects: [
      {
        type: "gate",
        edge: "south",
        position: aw / 2,
        width: GATE_WIDTH,
        role: "entrance",
        signText: "",
        locked: true,
        destination: null,
      },
      {
        type: "gate",
        edge: "north",
        position: aw / 2,
        width: GATE_WIDTH,
        role: "exit",
        signText: "EXIT",
        locked: true,
        destination: "lobby",
      },
    ],
    barriers: [],
    gameObjects: [],
    powerups: [],
    enemies: [],
    rewards: {
      coins: 50,
      timeBonusThreshold: 120,
      timeBonusCoins: 25,
    },
  };
}

/**
 * @param {unknown} level
 * @returns {level is Record<string, unknown>}
 */
export function isEditorV2Level(level) {
  if (!level || typeof level !== "object" || Array.isArray(level)) return false;
  const L = /** @type {Record<string, unknown>} */ (level);
  return (
    L.schemaVersion === LEVEL_SCHEMA_VERSION_V2 &&
    typeof L.mapWidth === "number" &&
    Number.isFinite(L.mapWidth) &&
    typeof L.mapDepth === "number" &&
    Number.isFinite(L.mapDepth)
  );
}

/**
 * Load first WIP or create a blank level and persist.
 * @param {string} [preferredWipId] — open this WIP when present (e.g. Return to Editor / backtick).
 * @returns {Record<string, unknown>}
 */
export function ensureEditorWipLevel(preferredWipId) {
  if (typeof preferredWipId === "string" && preferredWipId.trim()) {
    const id = preferredWipId.trim();
    const pick = getWipLevel(id);
    if (isEditorV2Level(pick)) {
      return /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(pick)));
    }
  }
  const ids = listWipLevelIds();
  if (ids.length > 0) {
    for (const id of ids) {
      const pick = getWipLevel(id);
      if (isEditorV2Level(pick)) {
        return /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(pick)));
      }
    }
  }
  const blank = createBlankWipLevel();
  upsertWipLevel(blank);
  return /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(blank)));
}

/**
 * @param {{ edge: string; position: number; width: number; role?: string }} g
 * @param {number} aw
 * @param {number} ad
 */
function gateClearAabb(g, aw, ad) {
  const halfW = aw / 2;
  const halfD = ad / 2;
  const w = g.width;
  const depth = g.role === "entrance" || g.role === "vibejam" ? 10 : 5;
  const p = g.position;
  const eps = 1e-3;
  switch (g.edge) {
    case "south": {
      const xc = -halfW + p;
      return { x0: xc - w / 2, x1: xc + w / 2, z0: -halfD + eps, z1: -halfD + depth };
    }
    case "north": {
      const xc = -halfW + p;
      return { x0: xc - w / 2, x1: xc + w / 2, z0: halfD - depth, z1: halfD - eps };
    }
    case "west": {
      const zc = -halfD + p;
      return { x0: -halfW + eps, x1: -halfW + depth, z0: zc - w / 2, z1: zc + w / 2 };
    }
    case "east": {
      const zc = -halfD + p;
      return { x0: halfW - depth, x1: halfW - eps, z0: zc - w / 2, z1: zc + w / 2 };
    }
    default:
      return { x0: 0, x1: 0, z0: 0, z1: 0 };
  }
}

/**
 * Integer tile centers (x,z) inside gate front clear zones — no floor objects allowed (plan § Editor).
 * @param {unknown[]} wallObjects
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @returns {Set<string>}
 */
export function collectGateClearTileKeys(wallObjects, arenaWidth, arenaDepth) {
  /** @type {Set<string>} */
  const out = new Set();
  if (!Array.isArray(wallObjects)) return out;
  for (const wo of wallObjects) {
    if (!wo || typeof wo !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (wo);
    if (o.type !== "gate") continue;
    const edge = o.edge;
    const position = o.position;
    const width = o.width;
    const role = o.role;
    if (typeof edge !== "string" || typeof position !== "number" || typeof width !== "number") continue;
    const aabb = gateClearAabb(
      { edge, position, width, role: typeof role === "string" ? role : undefined },
      arenaWidth,
      arenaDepth,
    );
    const ix0 = Math.ceil(aabb.x0 - 1e-6);
    const ix1 = Math.floor(aabb.x1 + 1e-6);
    const iz0 = Math.ceil(aabb.z0 - 1e-6);
    const iz1 = Math.floor(aabb.z1 + 1e-6);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        out.add(`${ix},${iz}`);
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>} level
 * @param {number} x
 * @param {number} z
 */
export function snapAuthoringCell(level, x, z) {
  const mapWidth = typeof level.mapWidth === "number" ? level.mapWidth : level.arenaWidth;
  const mapDepth = typeof level.mapDepth === "number" ? level.mapDepth : level.arenaDepth;
  if (level.schemaVersion !== LEVEL_SCHEMA_VERSION_V2 || typeof mapWidth !== "number" || typeof mapDepth !== "number") {
    throw new Error("Editor only supports schemaVersion 2 levels with mapWidth/mapDepth");
  }
  return {
    ix: Math.floor(x + mapWidth / 2),
    iz: Math.floor(z + mapDepth / 2),
  };
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 * @param {number} ix
 * @param {number} iz
 */
export function setEditorObjectPlacement(level, list, o, ix, iz) {
  if (level.schemaVersion !== LEVEL_SCHEMA_VERSION_V2) {
    throw new Error("Editor only supports schemaVersion 2 placement");
  }
  o.gridX = ix;
  o.gridZ = iz;
  const fp = getFloorObjectFootprint(list, o);
  const c = gridTopLeftToWorldCenter(level, ix, iz, fp.width, fp.depth);
  o.x = c.x;
  o.z = c.z;
}

/**
 * @param {Record<string, unknown>} level
 * @returns {Set<string>}
 */
export function collectOccupiedFloorTileKeys(level) {
  /** @type {Set<string>} */
  const seen = new Set();
  const tryAdd = (list, o) => {
    for (const cell of floorObjectOccupiedCells(level, list, o)) seen.add(cell);
  };

  const barriers = level.barriers;
  if (Array.isArray(barriers)) {
    for (let i = 0; i < barriers.length; i++) {
      const b = barriers[i];
      if (b && typeof b === "object") {
        const o = /** @type {Record<string, unknown>} */ (b);
        if (typeof o.gridX === "number" && typeof o.gridZ === "number") tryAdd("barriers", o);
      }
    }
  }
  const gameObjects = level.gameObjects;
  if (Array.isArray(gameObjects)) {
    for (const g of gameObjects) {
      if (g && typeof g === "object") {
        const o = /** @type {Record<string, unknown>} */ (g);
        if (typeof o.gridX === "number" && typeof o.gridZ === "number") tryAdd("gameObjects", o);
      }
    }
  }
  const powerups = level.powerups;
  if (Array.isArray(powerups)) {
    for (const p of powerups) {
      if (p && typeof p === "object") {
        const o = /** @type {Record<string, unknown>} */ (p);
        if (typeof o.gridX === "number" && typeof o.gridZ === "number") tryAdd("powerups", o);
      }
    }
  }
  const enemies = level.enemies;
  if (Array.isArray(enemies)) {
    for (const e of enemies) {
      if (e && typeof e === "object") {
        const o = /** @type {Record<string, unknown>} */ (e);
        if (typeof o.gridX === "number" && typeof o.gridZ === "number") tryAdd("enemies", o);
      }
    }
  }

  return seen;
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 * @returns {string | null}
 */
export function floorObjectTopLeftLabel(level, list, o) {
  const p = getFloorObjectTopLeft(level, list, o);
  return `${p.gridX}, ${p.gridZ}`;
}

/**
 * @param {Record<string, unknown>} level
 * @returns {string | null} pairId with count 1, or null
 */
export function findIncompletePortalPairId(level) {
  const gameObjects = level.gameObjects;
  if (!Array.isArray(gameObjects)) return null;
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const g of gameObjects) {
    if (!g || typeof g !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (g);
    if (o.type !== "portal") continue;
    const pid = o.pairId;
    if (typeof pid !== "string") continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  for (const [pid, c] of counts) {
    if (c === 1) return pid;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} level
 * @returns {number}
 */
export function countDistinctPortalPairs(level) {
  const gameObjects = level.gameObjects;
  if (!Array.isArray(gameObjects)) return 0;
  /** @type {Set<string>} */
  const ok = new Set();
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const g of gameObjects) {
    if (!g || typeof g !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (g);
    if (o.type !== "portal") continue;
    const pid = o.pairId;
    if (typeof pid !== "string") continue;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  for (const [pid, c] of counts) {
    if (c === 2) ok.add(pid);
  }
  return ok.size;
}
