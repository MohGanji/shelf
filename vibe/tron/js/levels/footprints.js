/**
 * Shared grid footprint helpers for level authoring.
 *
 * Legacy levels use centered world-space `x`/`z`. V2 authoring may also store
 * top-left `gridX`/`gridZ`; helpers keep `x`/`z` synced for the current runtime.
 */

export const LEVEL_SCHEMA_VERSION_V2 = 2;

/** Portals use a fixed 5×5 floor footprint, same as wall gates in schema (see `GATE_WIDTH`). */
export const PORTAL_FLOOR_FOOTPRINT = 5;

/** @param {unknown} v */
function finiteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/** @param {unknown} v @param {number} fallback */
function positiveGridSpan(v, fallback) {
  if (!finiteNumber(v)) return fallback;
  return Math.max(1, Math.round(v));
}

/**
 * @param {Record<string, unknown>} level
 * @returns {boolean}
 */
export function isV2Level(level) {
  return level.schemaVersion === LEVEL_SCHEMA_VERSION_V2;
}

/**
 * V2 `mapWidth`/`mapDepth` include the 1-tile perimeter wall. Legacy levels fall
 * back to the existing centered arena dimensions.
 *
 * @param {Record<string, unknown>} level
 */
export function getAuthoringMapSize(level) {
  const arenaWidth = finiteNumber(level.arenaWidth) ? level.arenaWidth : 0;
  const arenaDepth = finiteNumber(level.arenaDepth) ? level.arenaDepth : 0;
  return {
    mapWidth: finiteNumber(level.mapWidth) ? level.mapWidth : arenaWidth,
    mapDepth: finiteNumber(level.mapDepth) ? level.mapDepth : arenaDepth,
  };
}

/**
 * @param {Record<string, unknown>} level
 * @param {number} gridX
 * @param {number} gridZ
 * @param {number} width
 * @param {number} depth
 */
export function gridTopLeftToWorldCenter(level, gridX, gridZ, width, depth) {
  const { mapWidth, mapDepth } = getAuthoringMapSize(level);
  return {
    x: gridX - mapWidth / 2 + width / 2,
    z: gridZ - mapDepth / 2 + depth / 2,
  };
}

/**
 * @param {Record<string, unknown>} level
 * @param {number} x
 * @param {number} z
 */
export function worldPointToGridCell(level, x, z) {
  const { mapWidth, mapDepth } = getAuthoringMapSize(level);
  return {
    gridX: Math.floor(x + mapWidth / 2),
    gridZ: Math.floor(z + mapDepth / 2),
  };
}

const TRI_BUILDING_ROT_QUARTER = Math.PI * 0.5;

/**
 * @param {number} r
 * @returns {0 | 1 | 2 | 3}
 */
export function triangleBuildingRotationQuarterIndex(r) {
  if (typeof r !== "number" || !Number.isFinite(r)) return 0;
  const q = Math.round(r / TRI_BUILDING_ROT_QUARTER);
  return /** @type {0 | 1 | 2 | 3} */(((q % 4) + 4) % 4);
}

/**
 * @param {number} q
 */
export function triangleBuildingRotationRadFromQuarterIndex(q) {
  const n = ((Math.floor(q) % 4) + 4) % 4;
  return n * TRI_BUILDING_ROT_QUARTER;
}

/**
 * @param {number} r
 */
export function snapTriangleBuildingRotationY(r) {
  return triangleBuildingRotationRadFromQuarterIndex(triangleBuildingRotationQuarterIndex(r));
}

/**
 * V2 triangle buildings: `triangleQuarter` 0–3 (hypotenuse / local geometry; see `createRightTrianglePrismGeometry`)
 * is canonical. If missing, `rotation` (rad) is snapped to 90° steps. Same value drives mesh, Cannon quat, and slide logic.
 * @param {Record<string, unknown>} o
 */
export function resolveTriangleBuildingRotationY(o) {
  const q = o.triangleQuarter;
  if (typeof q === "number" && Number.isInteger(q)) {
    return triangleBuildingRotationRadFromQuarterIndex(q);
  }
  const r = typeof o.rotation === "number" && Number.isFinite(o.rotation) ? o.rotation : 0;
  return snapTriangleBuildingRotationY(r);
}

const PORTAL_YAW_90 = Math.PI * 0.5;

/**
 * Portals on a 5×5 square footprint only need 0° or 90° yaw; 180°/270° are equivalent by symmetry of the pair.
 * Level data uses `portalHalfTurn` only; legacy `rotation` (rad) is still read here if present until fully migrated in memory.
 * @param {Record<string, unknown>} o
 */
export function resolvePortalRotationY(o) {
  if (typeof o.portalHalfTurn === "number" && Number.isInteger(o.portalHalfTurn)) {
    return ((o.portalHalfTurn % 2) + 2) % 2 === 1 ? PORTAL_YAW_90 : 0;
  }
  const r = typeof o.rotation === "number" && Number.isFinite(o.rotation) ? o.rotation : 0;
  const q = Math.round(r / (Math.PI / 2));
  const m = ((q % 4) + 4) % 4;
  return m === 0 || m === 2 ? 0 : PORTAL_YAW_90;
}

/**
 * @param {number} r
 * @returns {0 | 1}
 */
export function portalHalfTurnIndexFromRotation(r) {
  if (typeof r !== "number" || !Number.isFinite(r)) return 0;
  const q = Math.round(r / (Math.PI / 2));
  const m = ((q % 4) + 4) % 4;
  return m === 0 || m === 2 ? 0 : 1;
}

/**
 * @param {Record<string, unknown>} o
 * @returns {0 | 1}
 */
export function portalHalfTurnIndexFromObject(o) {
  if (typeof o.portalHalfTurn === "number" && Number.isInteger(o.portalHalfTurn)) {
    return /** @type {0 | 1} */ (((o.portalHalfTurn % 2) + 2) % 2);
  }
  const r = typeof o.rotation === "number" && Number.isFinite(o.rotation) ? o.rotation : 0;
  return portalHalfTurnIndexFromRotation(r);
}

/**
 * Portals use only `portalHalfTurn` in JSON; strips legacy `rotation` after deriving half-turn.
 * Mutates `level` in place. Call before `validateLevel` (also invoked from there).
 * @param {Record<string, unknown>} level
 */
export function normalizePortalGameObjectsInLevel(level) {
  const arr = level.gameObjects;
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (item);
    if (o.type !== "portal") continue;
    o.portalHalfTurn = portalHalfTurnIndexFromObject(o);
    delete o.rotation;
  }
}

/**
 * @param {"barriers" | "gameObjects" | "powerups" | "enemies" | string} list
 * @param {Record<string, unknown>} o
 */
export function getFloorObjectFootprint(list, o) {
  if (list === "powerups") {
    return { width: 2, depth: 2, fixedSize: true, shape: "rect", rotation: 0 };
  }
  if (list === "enemies") {
    const r = finiteNumber(o.rotation) ? o.rotation : 0;
    const quarter = Math.round(r / (Math.PI / 2));
    const sideways = Math.abs(quarter % 2) === 1;
    return {
      width: sideways ? 3 : 1,
      depth: sideways ? 1 : 3,
      fixedSize: true,
      shape: "rect",
      rotation: quarter * (Math.PI / 2),
    };
  }
  if (list === "gameObjects") {
    if (o.type === "boost_pad") {
      return {
        width: positiveGridSpan(o.width, 4),
        depth: positiveGridSpan(o.depth, 4),
        fixedSize: false,
        shape: "rect",
        rotation: 0,
      };
    }
    if (o.type === "portal") {
      return {
        width: PORTAL_FLOOR_FOOTPRINT,
        depth: PORTAL_FLOOR_FOOTPRINT,
        fixedSize: true,
        shape: "rect",
        rotation: resolvePortalRotationY(/** @type {Record<string, unknown>} */ (o)),
      };
    }
  }
  if (list === "barriers") {
    const shape =
      o.type === "building" && o.shape === "triangle"
        ? String(o.shape)
        : "rect";
    const fixedSize = o.type === "structure";
    const rotY =
      o.type === "building" && o.shape === "triangle"
        ? resolveTriangleBuildingRotationY(/** @type {Record<string, unknown>} */ (o))
        : finiteNumber(o.rotation)
          ? o.rotation
          : 0;
    return {
      width: positiveGridSpan(o.width, 1),
      depth: positiveGridSpan(o.depth, 1),
      fixedSize,
      shape,
      rotation: rotY,
    };
  }
  return { width: 1, depth: 1, fixedSize: false, shape: "rect", rotation: 0 };
}

/**
 * @param {Record<string, unknown>} o
 */
export function hasGridPlacement(o) {
  return finiteNumber(o.gridX) && finiteNumber(o.gridZ);
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 */
export function getFloorObjectTopLeft(level, list, o) {
  const fp = getFloorObjectFootprint(list, o);
  if (hasGridPlacement(o)) {
    return { gridX: Math.round(/** @type {number} */ (o.gridX)), gridZ: Math.round(/** @type {number} */ (o.gridZ)) };
  }
  if (finiteNumber(o.x) && finiteNumber(o.z)) {
    const { gridX, gridZ } = worldPointToGridCell(
      level,
      /** @type {number} */ (o.x) - fp.width / 2 + 0.5,
      /** @type {number} */ (o.z) - fp.depth / 2 + 0.5,
    );
    return { gridX, gridZ };
  }
  return { gridX: 0, gridZ: 0 };
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 */
export function getFloorObjectWorldCenter(level, list, o) {
  const fp = getFloorObjectFootprint(list, o);
  if (hasGridPlacement(o)) {
    return gridTopLeftToWorldCenter(
      level,
      Math.round(/** @type {number} */ (o.gridX)),
      Math.round(/** @type {number} */ (o.gridZ)),
      fp.width,
      fp.depth,
    );
  }
  return {
    x: finiteNumber(o.x) ? /** @type {number} */ (o.x) : 0,
    z: finiteNumber(o.z) ? /** @type {number} */ (o.z) : 0,
  };
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 * @param {number} gridX
 * @param {number} gridZ
 */
export function setFloorObjectGridPlacement(level, list, o, gridX, gridZ) {
  const fp = getFloorObjectFootprint(list, o);
  o.gridX = Math.round(gridX);
  o.gridZ = Math.round(gridZ);
  const c = gridTopLeftToWorldCenter(level, /** @type {number} */ (o.gridX), /** @type {number} */ (o.gridZ), fp.width, fp.depth);
  o.x = c.x;
  o.z = c.z;
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 */
export function floorObjectOccupiedCells(level, list, o) {
  const fp = getFloorObjectFootprint(list, o);
  const { gridX, gridZ } = getFloorObjectTopLeft(level, list, o);
  /** @type {string[]} */
  const cells = [];
  for (let dz = 0; dz < fp.depth; dz++) {
    for (let dx = 0; dx < fp.width; dx++) {
      cells.push(`${gridX + dx},${gridZ + dz}`);
    }
  }
  return cells;
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {Record<string, unknown>} o
 */
export function floorObjectInsideAuthoringBounds(level, list, o) {
  const fp = getFloorObjectFootprint(list, o);
  const { gridX, gridZ } = getFloorObjectTopLeft(level, list, o);
  const { mapWidth, mapDepth } = getAuthoringMapSize(level);
  const v2 = isV2Level(level);
  const min = v2 ? 1 : 0;
  const maxX = v2 ? mapWidth - 1 : mapWidth;
  const maxZ = v2 ? mapDepth - 1 : mapDepth;
  return gridX >= min && gridZ >= min && gridX + fp.width <= maxX && gridZ + fp.depth <= maxZ;
}

/**
 * Deep-clone a level and ensure v2 top-left grid records also expose centered
 * `x`/`z` for runtime systems that have not moved to grid coordinates yet.
 *
 * @param {Record<string, unknown>} level
 * @returns {Record<string, unknown>}
 */
export function normalizeLevelForRuntime(level) {
  const out = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(level)));
  for (const list of ["barriers", "gameObjects", "powerups", "enemies"]) {
    const arr = out[list];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const o = /** @type {Record<string, unknown>} */ (item);
      if (!hasGridPlacement(o)) continue;
      const c = getFloorObjectWorldCenter(out, list, o);
      o.x = c.x;
      o.z = c.z;
    }
  }
  return out;
}
