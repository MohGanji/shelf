/**
 * Tron level JSON format (see plans/plan-2026-04-09-tron-light-cycles.md).
 * @module levels/schema
 */

import {
  LEVEL_SCHEMA_VERSION_V2,
  floorObjectInsideAuthoringBounds,
  floorObjectOccupiedCells,
  getFloorObjectFootprint,
  normalizePortalGameObjectsInLevel,
} from "./footprints.js";

/** Minimum arena width/depth in units (tiles). */
export const MIN_ARENA_SIZE = 40;

/** Gate objects are always this many units wide along the wall. Portal floor footprint must match. */
export const GATE_WIDTH = 5;

/** Lobby campaign id — special layout and gate rules. */
export const LOBBY_LEVEL_ID = "level-0";

/** Default lobby dimensions from the plan. */
export const LOBBY_ARENA_WIDTH = 400;
export const LOBBY_ARENA_DEPTH = 150;

const GATE_ROLES = new Set(["entrance", "exit", "arena", "garage", "multiplayer", "vibejam"]);
const EDGES = new Set(["north", "south", "east", "west"]);
const BARRIER_TYPES = new Set(["wall", "building", "structure"]);
const BUILDING_SHAPES = new Set(["square", "triangle"]);

/** Optional LED-style billboard on square `building` barriers (lobby hub, etc.). */
export const BUILDING_BANNER_KINDS = new Set(["lobby_progress", "lobby_garage"]);
const STRUCTURE_VARIANTS = new Set(["pylon", "column", "obelisk"]);
const COSMETIC_VARIANTS = new Set(["panel_a", "panel_b", "panel_c"]);
const GAME_OBJECT_TYPES = new Set(["boost_pad", "portal"]);
const POWERUP_TYPES = new Map([
  ["nitro_recharge", "instant"],
  ["trail_extend", "level_permanent"],
  ["shield", "equippable"],
]);
const ENEMY_CATEGORIES = new Set(["easy", "medium", "hard", "boss"]);
const LEGACY_ENEMY_ATTR_KEYS = ["speed", "acceleration", "trailLength", "nitroBars", "handling", "intelligence"];

const HEX_COLOR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {unknown} v
 * @returns {v is number}
 */
function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * @param {string} path
 * @param {unknown} v
 * @param {string[]} errors
 */
function expectFiniteNumber(path, v, errors) {
  if (!isFiniteNumber(v)) errors.push(`${path} must be a finite number`);
}

/**
 * @param {string} path
 * @param {unknown} v
 * @param {string[]} errors
 */
function expectNonEmptyString(path, v, errors) {
  if (typeof v !== "string" || v.trim() === "") errors.push(`${path} must be a non-empty string`);
}

/**
 * @param {string} wallLen
 * @param {number} width
 * @param {number} position
 * @param {string} path
 * @param {string[]} errors
 */
function validateWallPosition(wallLen, width, position, path, errors) {
  const min = width / 2;
  const max = wallLen - width / 2;
  if (!isFiniteNumber(position)) {
    errors.push(`${path} must be a finite number`);
    return;
  }
  if (position < min || position > max) {
    errors.push(`${path} must be between ${min} and ${max} for this edge and arena (got ${position})`);
  }
}

/**
 * Validates a parsed level object.
 * @param {unknown} json Level object (already parsed — not a JSON string).
 * @returns {{ valid: true, errors: [] } | { valid: false, errors: string[] }}
 */
export function validateLevel(json) {
  /** @type {string[]} */
  const errors = [];

  if (!isPlainObject(json)) {
    return { valid: false, errors: ["Root value must be a JSON object"] };
  }

  normalizePortalGameObjectsInLevel(/** @type {Record<string, unknown>} */ (json));

  expectNonEmptyString("id", json.id, errors);
  expectNonEmptyString("name", json.name, errors);

  if (json.schemaVersion !== undefined && json.schemaVersion !== LEVEL_SCHEMA_VERSION_V2) {
    errors.push(`schemaVersion must be ${LEVEL_SCHEMA_VERSION_V2} when provided`);
  }

  const arenaWidth = json.arenaWidth;
  const arenaDepth = json.arenaDepth;
  expectFiniteNumber("arenaWidth", arenaWidth, errors);
  expectFiniteNumber("arenaDepth", arenaDepth, errors);
  if (isFiniteNumber(arenaWidth) && arenaWidth < MIN_ARENA_SIZE) {
    errors.push(`arenaWidth must be >= ${MIN_ARENA_SIZE}`);
  }
  if (isFiniteNumber(arenaDepth) && arenaDepth < MIN_ARENA_SIZE) {
    errors.push(`arenaDepth must be >= ${MIN_ARENA_SIZE}`);
  }
  if (json.schemaVersion === LEVEL_SCHEMA_VERSION_V2) {
    expectFiniteNumber("mapWidth", json.mapWidth, errors);
    expectFiniteNumber("mapDepth", json.mapDepth, errors);
    if (isFiniteNumber(json.mapWidth) && isFiniteNumber(arenaWidth) && json.mapWidth < arenaWidth + 2) {
      errors.push("mapWidth must include the 1-tile wall on both sides (arenaWidth + 2 or larger)");
    }
    if (isFiniteNumber(json.mapDepth) && isFiniteNumber(arenaDepth) && json.mapDepth < arenaDepth + 2) {
      errors.push("mapDepth must include the 1-tile wall on both sides (arenaDepth + 2 or larger)");
    }
  }

  const lobby = json.id === LOBBY_LEVEL_ID;
  if (lobby) {
    if (isFiniteNumber(arenaWidth) && arenaWidth !== LOBBY_ARENA_WIDTH) {
      errors.push(`Lobby (${LOBBY_LEVEL_ID}) requires arenaWidth ${LOBBY_ARENA_WIDTH}`);
    }
    if (isFiniteNumber(arenaDepth) && arenaDepth !== LOBBY_ARENA_DEPTH) {
      errors.push(`Lobby (${LOBBY_LEVEL_ID}) requires arenaDepth ${LOBBY_ARENA_DEPTH}`);
    }
  }

  if (!Array.isArray(json.wallObjects)) errors.push("wallObjects must be an array");
  if (!Array.isArray(json.barriers)) errors.push("barriers must be an array");
  if (!Array.isArray(json.gameObjects)) errors.push("gameObjects must be an array");
  if (!Array.isArray(json.powerups)) errors.push("powerups must be an array");
  if (!Array.isArray(json.enemies)) errors.push("enemies must be an array");

  if (json.rewards !== null && json.rewards !== undefined && !isPlainObject(json.rewards)) {
    errors.push("rewards must be null or an object");
  }

  const aw = isFiniteNumber(arenaWidth) ? arenaWidth : 0;
  const ad = isFiniteNumber(arenaDepth) ? arenaDepth : 0;

  if (Array.isArray(json.wallObjects)) {
    validateWallObjects(json.wallObjects, aw, ad, lobby, errors);
  }
  if (Array.isArray(json.barriers)) {
    validateBarriers(json.barriers, errors);
  }
  if (Array.isArray(json.gameObjects)) {
    validateGameObjects(json.gameObjects, errors, json.schemaVersion === LEVEL_SCHEMA_VERSION_V2);
  }
  if (Array.isArray(json.powerups)) {
    validatePowerups(json.powerups, errors);
  }
  if (Array.isArray(json.enemies)) {
    validateEnemies(json.enemies, errors);
  }

  if (json.rewards !== null && json.rewards !== undefined && isPlainObject(json.rewards)) {
    validateRewards(json.rewards, errors);
  }

  if (lobby) {
    if (json.rewards !== null) {
      errors.push(`Lobby (${LOBBY_LEVEL_ID}) must have rewards: null`);
    }
    if (Array.isArray(json.enemies) && json.enemies.length > 0) {
      errors.push(`Lobby (${LOBBY_LEVEL_ID}) must have no enemies`);
    }
  }

  if (json.schemaVersion === LEVEL_SCHEMA_VERSION_V2) {
    validateV2FloorFootprints(/** @type {Record<string, unknown>} */ (json), errors);
  } else {
    validateLegacyDuplicateFloorTiles(/** @type {Record<string, unknown>} */ (json), errors);
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

/**
 * @param {Record<string, unknown>} r
 * @param {string[]} errors
 */
function validateRewards(r, errors) {
  expectFiniteNumber("rewards.coins", r.coins, errors);
  expectFiniteNumber("rewards.timeBonusThreshold", r.timeBonusThreshold, errors);
  expectFiniteNumber("rewards.timeBonusCoins", r.timeBonusCoins, errors);
}

/**
 * @param {Record<string, unknown>} level
 * @param {string[]} errors
 */
function validateV2FloorFootprints(level, errors) {
  /** @type {{ list: string; arr: unknown[] }[]} */
  const groups = [
    { list: "barriers", arr: Array.isArray(level.barriers) ? level.barriers : [] },
    { list: "gameObjects", arr: Array.isArray(level.gameObjects) ? level.gameObjects : [] },
    { list: "powerups", arr: Array.isArray(level.powerups) ? level.powerups : [] },
    { list: "enemies", arr: Array.isArray(level.enemies) ? level.enemies : [] },
  ];
  const seen = new Map();
  for (const { list, arr } of groups) {
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (!isPlainObject(o)) continue;
      const path = `${list}[${i}]`;
      if (!isFiniteNumber(o.gridX) || !Number.isInteger(o.gridX)) {
        errors.push(`${path}.gridX must be an integer top-left grid coordinate for schemaVersion ${LEVEL_SCHEMA_VERSION_V2}`);
      }
      if (!isFiniteNumber(o.gridZ) || !Number.isInteger(o.gridZ)) {
        errors.push(`${path}.gridZ must be an integer top-left grid coordinate for schemaVersion ${LEVEL_SCHEMA_VERSION_V2}`);
      }
      if (!isFiniteNumber(o.gridX) || !isFiniteNumber(o.gridZ)) continue;
      if (!floorObjectInsideAuthoringBounds(level, list, o)) {
        const fp = getFloorObjectFootprint(list, o);
        errors.push(`${path} footprint ${fp.width}x${fp.depth} must stay inside the playable map interior`);
      }
      for (const cell of floorObjectOccupiedCells(level, list, o)) {
        if (seen.has(cell)) {
          errors.push(`Duplicate floor footprint cell (${cell}): ${seen.get(cell)} and ${path}`);
        } else {
          seen.set(cell, path);
        }
      }
    }
  }
}

/**
 * @param {Record<string, unknown>} json
 * @param {string[]} errors
 */
function validateLegacyDuplicateFloorTiles(json, errors) {
  /** @type {{ x: number, z: number, kind: string }[]} */
  const floorKeys = [];
  if (Array.isArray(json.barriers)) {
    for (let i = 0; i < json.barriers.length; i++) {
      const b = json.barriers[i];
      if (isPlainObject(b) && isFiniteNumber(b.x) && isFiniteNumber(b.z)) {
        floorKeys.push({ x: b.x, z: b.z, kind: `barriers[${i}]` });
      }
    }
  }
  if (Array.isArray(json.gameObjects)) {
    for (let i = 0; i < json.gameObjects.length; i++) {
      const g = json.gameObjects[i];
      if (isPlainObject(g) && isFiniteNumber(g.x) && isFiniteNumber(g.z)) {
        floorKeys.push({ x: g.x, z: g.z, kind: `gameObjects[${i}]` });
      }
    }
  }
  if (Array.isArray(json.powerups)) {
    for (let i = 0; i < json.powerups.length; i++) {
      const p = json.powerups[i];
      if (isPlainObject(p) && isFiniteNumber(p.x) && isFiniteNumber(p.z)) {
        floorKeys.push({ x: p.x, z: p.z, kind: `powerups[${i}]` });
      }
    }
  }
  if (Array.isArray(json.enemies)) {
    for (let i = 0; i < json.enemies.length; i++) {
      const e = json.enemies[i];
      if (isPlainObject(e) && isFiniteNumber(e.x) && isFiniteNumber(e.z)) {
        floorKeys.push({ x: e.x, z: e.z, kind: `enemies[${i}]` });
      }
    }
  }
  const seen = new Map();
  for (const { x, z, kind } of floorKeys) {
    const key = `${x},${z}`;
    if (seen.has(key)) {
      errors.push(`Duplicate floor tile (${x}, ${z}): ${seen.get(key)} and ${kind}`);
    } else {
      seen.set(key, kind);
    }
  }
}

/**
 * @param {unknown[]} wallObjects
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @param {boolean} lobby
 * @param {string[]} errors
 */
function validateWallObjects(wallObjects, arenaWidth, arenaDepth, lobby, errors) {
  /** @type {Record<string, number>} */
  const roleCounts = {};
  for (let i = 0; i < wallObjects.length; i++) {
    const path = `wallObjects[${i}]`;
    const wo = wallObjects[i];
    if (!isPlainObject(wo)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const t = wo.type;
    if (t === "gate") {
      const edge = wo.edge;
      if (typeof edge !== "string" || !EDGES.has(edge)) {
        errors.push(`${path}.edge must be one of: north, south, east, west`);
      }
      const role = wo.role;
      if (typeof role !== "string" || !GATE_ROLES.has(role)) {
        errors.push(`${path}.role must be one of: entrance, exit, arena, garage, multiplayer, vibejam`);
      } else {
        roleCounts[role] = (roleCounts[role] ?? 0) + 1;
        if (role === "vibejam" && !lobby) {
          errors.push(`${path}.vibejam gates are only valid on the lobby level (level-0)`);
        }
      }
      const width = wo.width;
      if (!isFiniteNumber(width) || width !== GATE_WIDTH) {
        errors.push(`${path}.width must be ${GATE_WIDTH} for gates`);
      }
      if (typeof edge === "string" && EDGES.has(edge) && isFiniteNumber(width)) {
        const wallLen = edge === "north" || edge === "south" ? arenaWidth : arenaDepth;
        validateWallPosition(wallLen, width, /** @type {number} */ (wo.position), `${path}.position`, errors);
      }
      if (typeof role === "string" && GATE_ROLES.has(role)) {
        validateGateDestination(path, wo, errors);
      }
      if (typeof wo.signText !== "string") errors.push(`${path}.signText must be a string`);
      if (wo.lockedRibbonText !== undefined && typeof wo.lockedRibbonText !== "string") {
        errors.push(`${path}.lockedRibbonText must be a string when provided`);
      }
      if (typeof wo.locked !== "boolean") errors.push(`${path}.locked must be a boolean`);
    } else if (t === "cosmetic_wall") {
      const edge = wo.edge;
      if (typeof edge !== "string" || !EDGES.has(edge)) {
        errors.push(`${path}.edge must be one of: north, south, east, west`);
      }
      const width = wo.width;
      if (!isFiniteNumber(width) || width < 1 || width > 10 || !Number.isInteger(width)) {
        errors.push(`${path}.width must be an integer from 1 to 10`);
      }
      const variant = wo.variant;
      if (typeof variant !== "string" || !COSMETIC_VARIANTS.has(variant)) {
        errors.push(`${path}.variant must be one of: panel_a, panel_b, panel_c`);
      }
      if (typeof edge === "string" && EDGES.has(edge) && isFiniteNumber(width)) {
        const wallLen = edge === "north" || edge === "south" ? arenaWidth : arenaDepth;
        validateWallPosition(wallLen, width, /** @type {number} */ (wo.position), `${path}.position`, errors);
      }
    } else {
      errors.push(`${path}.type must be "gate" or "cosmetic_wall"`);
    }
  }

  if (lobby) {
    if ((roleCounts.entrance ?? 0) !== 1) {
      errors.push(`Lobby must have exactly one entrance gate (found ${roleCounts.entrance ?? 0})`);
    }
    if ((roleCounts.vibejam ?? 0) !== 1) {
      errors.push(`Lobby must have exactly one vibejam gate (found ${roleCounts.vibejam ?? 0})`);
    }
    const need = ["arena", "garage", "multiplayer"];
    for (const r of need) {
      if ((roleCounts[r] ?? 0) !== 1) {
        errors.push(`Lobby must have exactly one gate with role "${r}" (found ${roleCounts[r] ?? 0})`);
      }
    }
    if ((roleCounts.exit ?? 0) !== 0) {
      errors.push("Lobby must not include an exit gate (use arena, garage, multiplayer roles)");
    }
  } else {
    if ((roleCounts.entrance ?? 0) !== 1) {
      errors.push(`Non-lobby levels must have exactly one entrance gate (found ${roleCounts.entrance ?? 0})`);
    }
    if ((roleCounts.exit ?? 0) !== 1) {
      errors.push(`Non-lobby levels must have exactly one exit gate (found ${roleCounts.exit ?? 0})`);
    }
    for (const r of ["arena", "garage", "multiplayer"]) {
      if ((roleCounts[r] ?? 0) !== 0) {
        errors.push(`Non-lobby levels must not include lobby-only gate role "${r}"`);
      }
    }
  }
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} gate
 * @param {string[]} errors
 */
function validateGateDestination(path, gate, errors) {
  const role = gate.role;
  const dest = gate.destination;
  if (role === "entrance" || role === "vibejam") {
    if (dest !== null) errors.push(`${path}.destination must be null for ${role} gates`);
    return;
  }
  if (role === "exit") {
    if (dest !== "lobby") errors.push(`${path}.destination must be "lobby" for exit gates`);
    return;
  }
  if (role === "arena") {
    if (dest !== "level") errors.push(`${path}.destination must be "level" for arena gates`);
    return;
  }
  if (role === "garage") {
    if (dest !== "garage") errors.push(`${path}.destination must be "garage" for garage gates`);
    return;
  }
  if (role === "multiplayer") {
    if (dest !== null) errors.push(`${path}.destination must be null for multiplayer gates until multiplayer is implemented`);
  }
}

/**
 * @param {unknown[]} barriers
 * @param {string[]} errors
 */
function validateBarriers(barriers, errors) {
  for (let i = 0; i < barriers.length; i++) {
    const path = `barriers[${i}]`;
    const b = barriers[i];
    if (!isPlainObject(b)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const type = b.type;
    if (typeof type !== "string" || !BARRIER_TYPES.has(type)) {
      errors.push(`${path}.type must be one of: wall, building, structure`);
      continue;
    }
    expectFiniteNumber(`${path}.x`, b.x, errors);
    expectFiniteNumber(`${path}.z`, b.z, errors);
    validateOptionalBarrierSpan(`${path}.width`, b.width, errors);
    validateOptionalBarrierSpan(`${path}.depth`, b.depth, errors);
    validateOptionalFiniteNumber(`${path}.rotation`, b.rotation, errors);
    if (type === "building") {
      const h = b.height;
      if (!isFiniteNumber(h) || !Number.isInteger(h) || h < 1 || h > 5) {
        errors.push(`${path}.height must be an integer from 1 to 5`);
      }
      const shape = b.shape;
      if (typeof shape !== "string" || !BUILDING_SHAPES.has(shape)) {
        errors.push(`${path}.shape must be one of: square, triangle`);
      }
      if (shape === "triangle") {
        if (b.triangleQuarter !== undefined) {
          const tq = b.triangleQuarter;
          if (!isFiniteNumber(tq) || !Number.isInteger(tq) || tq < 0 || tq > 3) {
            errors.push(`${path}.triangleQuarter must be an integer from 0 to 3 when provided`);
          }
        }
      } else if (b.triangleQuarter !== undefined) {
        errors.push(`${path}.triangleQuarter is only valid when shape is triangle`);
      }
      if (b.banner !== undefined) {
        if (shape !== "square") {
          errors.push(`${path}.banner is only supported on square buildings`);
        } else if (!isPlainObject(b.banner)) {
          errors.push(`${path}.banner must be an object`);
        } else {
          const kind = b.banner.kind;
          if (typeof kind !== "string" || !BUILDING_BANNER_KINDS.has(kind)) {
            errors.push(`${path}.banner.kind must be one of: lobby_progress, lobby_garage`);
          }
        }
      }
    }
    if (type === "structure") {
      const variant = b.variant;
      if (typeof variant !== "string" || !STRUCTURE_VARIANTS.has(variant)) {
        errors.push(`${path}.variant must be one of: pylon, column, obelisk`);
      }
    }
  }
}

/**
 * @param {string} path
 * @param {unknown} v
 * @param {string[]} errors
 */
function validateOptionalBarrierSpan(path, v, errors) {
  if (v === undefined) return;
  if (!isFiniteNumber(v) || v <= 0) {
    errors.push(`${path} must be a positive finite number when provided`);
  }
}

/**
 * @param {string} path
 * @param {unknown} v
 * @param {string[]} errors
 */
function validateOptionalFiniteNumber(path, v, errors) {
  if (v === undefined) return;
  if (!isFiniteNumber(v)) {
    errors.push(`${path} must be a finite number when provided`);
  }
}

/**
 * @param {unknown[]} gameObjects
 * @param {string[]} errors
 * @param {boolean} v2
 */
function validateGameObjects(gameObjects, errors, v2) {
  /** @type {Map<string, number>} */
  const pairCounts = new Map();
  for (let i = 0; i < gameObjects.length; i++) {
    const path = `gameObjects[${i}]`;
    const g = gameObjects[i];
    if (!isPlainObject(g)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const type = g.type;
    if (typeof type !== "string" || !GAME_OBJECT_TYPES.has(type)) {
      errors.push(`${path}.type must be one of: boost_pad, portal`);
      continue;
    }
    expectFiniteNumber(`${path}.x`, g.x, errors);
    expectFiniteNumber(`${path}.z`, g.z, errors);
    if (type === "boost_pad") {
      validateOptionalBarrierSpan(`${path}.width`, g.width, errors);
      validateOptionalBarrierSpan(`${path}.depth`, g.depth, errors);
      if (v2 && g.rotation !== undefined) {
        errors.push(`${path}.rotation is not supported for v2 boost pads; use axis-aligned rectangular footprints`);
      } else {
        validateOptionalFiniteNumber(`${path}.rotation`, g.rotation, errors);
      }
    }
    if (type === "portal") {
      if (typeof g.portalHalfTurn !== "number" || !Number.isInteger(g.portalHalfTurn) || (g.portalHalfTurn !== 0 && g.portalHalfTurn !== 1)) {
        errors.push(`${path}.portalHalfTurn must be 0 or 1`);
      }
      const pairId = g.pairId;
      if (typeof pairId !== "string" || pairId.trim() === "") {
        errors.push(`${path}.pairId must be a non-empty string`);
      } else {
        pairCounts.set(pairId, (pairCounts.get(pairId) ?? 0) + 1);
      }
      const pc = g.pairColor;
      if (typeof pc !== "string" || !HEX_COLOR.test(pc)) {
        errors.push(`${path}.pairColor must be a CSS hex color (e.g. #FF00FF)`);
      }
    }
  }
  if (pairCounts.size > 5) {
    errors.push("At most 5 portal pairs are allowed per level");
  }
  for (const [pid, count] of pairCounts) {
    if (count !== 2) {
      errors.push(`Portal pairId "${pid}" must appear exactly twice (found ${count})`);
    }
  }
}

/**
 * @param {unknown[]} powerups
 * @param {string[]} errors
 */
function validatePowerups(powerups, errors) {
  for (let i = 0; i < powerups.length; i++) {
    const path = `powerups[${i}]`;
    const p = powerups[i];
    if (!isPlainObject(p)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const type = p.type;
    if (typeof type !== "string" || !POWERUP_TYPES.has(type)) {
      errors.push(`${path}.type must be one of: nitro_recharge, trail_extend, shield`);
      continue;
    }
    expectFiniteNumber(`${path}.x`, p.x, errors);
    expectFiniteNumber(`${path}.z`, p.z, errors);
    const expectedCat = POWERUP_TYPES.get(type);
    const cat = p.category;
    if (cat !== expectedCat) {
      errors.push(`${path}.category must be "${expectedCat}" for type "${type}"`);
    }
  }
}

/**
 * @param {unknown[]} enemies
 * @param {string[]} errors
 */
function validateEnemies(enemies, errors) {
  for (let i = 0; i < enemies.length; i++) {
    const path = `enemies[${i}]`;
    const e = enemies[i];
    if (!isPlainObject(e)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    expectFiniteNumber(`${path}.x`, e.x, errors);
    expectFiniteNumber(`${path}.z`, e.z, errors);
    expectFiniteNumber(`${path}.rotation`, e.rotation, errors);
    const color = e.color;
    if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      errors.push(`${path}.color must be a CSS hex color (e.g. #FF6600)`);
    }
    if (typeof e.category !== "string" || !ENEMY_CATEGORIES.has(e.category)) {
      errors.push(`${path}.category must be one of: easy, medium, hard, boss`);
    }
    const attrs = e.attributes;
    if (attrs !== undefined) {
      if (!isPlainObject(attrs)) {
        errors.push(`${path}.attributes must be an object when provided`);
        continue;
      }
      for (const key of LEGACY_ENEMY_ATTR_KEYS) {
        const v = attrs[key];
        if (v !== undefined && (!isFiniteNumber(v) || !Number.isInteger(v) || v < 1 || v > 10)) {
          errors.push(`${path}.attributes.${key} must be an integer from 1 to 10`);
        }
      }
      for (const k of Object.keys(attrs)) {
        if (!LEGACY_ENEMY_ATTR_KEYS.includes(k)) {
          errors.push(`${path}.attributes has unknown key "${k}"`);
        }
      }
    }
  }
}
