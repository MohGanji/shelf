/**
 * Legacy level JSON -> schemaVersion 2: map size + gridX/gridZ on floor objects.
 * Resolves v2 "no overlapping footprints" by dropping the smaller area barrier
 * when a duplicate pair is reported (barrier-barrier only).
 * Usage: node scripts/migrate-levels-to-v2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateLevel } from "../js/levels/schema.js";
import {
  getFloorObjectTopLeft,
  setFloorObjectGridPlacement,
  LEVEL_SCHEMA_VERSION_V2,
  getFloorObjectFootprint,
} from "../js/levels/footprints.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const levelsDir = path.join(__dirname, "../levels");

const LISTS = ["barriers", "gameObjects", "powerups", "enemies"];

/**
 * @param {Record<string, unknown>} b
 */
function barrierGridArea(b) {
  const fp = getFloorObjectFootprint("barriers", b);
  return fp.width * fp.depth;
}

/**
 * @param {Record<string, unknown>} level
 */
function migrateLevelInPlace(level) {
  level.schemaVersion = LEVEL_SCHEMA_VERSION_V2;
  const aw = level.arenaWidth;
  const ad = level.arenaDepth;
  if (typeof aw !== "number" || typeof ad !== "number") {
    throw new Error("Missing arenaWidth/arenaDepth");
  }
  level.mapWidth = aw + 2;
  level.mapDepth = ad + 2;

  const gameObjects = level.gameObjects;
  if (Array.isArray(gameObjects)) {
    for (const g of gameObjects) {
      if (g && typeof g === "object" && g.type === "boost_pad" && "rotation" in g) {
        delete /** @type {Record<string, unknown>} */ (g).rotation;
      }
    }
  }

  for (const list of LISTS) {
    const arr = level[list];
    if (!Array.isArray(arr)) continue;
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      const ob = /** @type {Record<string, unknown>} */ (o);
      delete ob.gridX;
      delete ob.gridZ;
    }
  }

  for (const list of LISTS) {
    const arr = level[list];
    if (!Array.isArray(arr)) continue;
    for (const o of arr) {
      if (!o || typeof o !== "object") continue;
      const ob = /** @type {Record<string, unknown>} */ (o);
      const { gridX, gridZ } = getFloorObjectTopLeft(/** @type {Record<string, unknown>} */ (level), list, ob);
      setFloorObjectGridPlacement(/** @type {Record<string, unknown>} */ (level), list, ob, gridX, gridZ);
    }
  }
}

/**
 * @param {string} err
 * @returns {{ a: string; i: number; b: string; j: number } | null}
 */
function parseDuplicatePair(err) {
  const m = err.match(
    /Duplicate floor footprint cell [^:]+:\s*(\w+)\[(\d+)\]\s+and\s+(\w+)\[(\d+)\]/,
  );
  if (!m) return null;
  return { a: m[1], i: Number(m[2]), b: m[3], j: Number(m[4]) };
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} list
 * @param {number} index
 */
function removeAt(level, list, index) {
  const arr = level[list];
  if (!Array.isArray(arr) || index < 0 || index >= arr.length) return false;
  arr.splice(index, 1);
  return true;
}

/**
 * @param {Record<string, unknown>} level
 * @param {string} a
 * @param {number} i
 * @param {string} b
 * @param {number} j
 * @returns {boolean}
 */
function removeSmallerOfDuplicatePair(level, a, i, b, j) {
  if (a === "barriers" && b === "barriers") {
    const arr = level.barriers;
    if (!Array.isArray(arr)) return false;
    const ba = arr[i];
    const bb = arr[j];
    if (!ba || !bb) return false;
    const aa = barrierGridArea(/** @type {Record<string, unknown>} */ (ba));
    const ab = barrierGridArea(/** @type {Record<string, unknown>} */ (bb));
    const removeIdx = aa < ab ? i : ab < aa ? j : Math.max(i, j);
    arr.splice(removeIdx, 1);
    return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} level
 * @returns {boolean}
 */
function resolveDuplicatesUntilStable(level) {
  let max = 500;
  while (max-- > 0) {
    migrateLevelInPlace(level);
    const v = validateLevel(level);
    if (v.valid) return true;
    const first = v.errors[0] ?? "";
    const p = parseDuplicatePair(first);
    if (!p || p.a !== "barriers" || p.b !== "barriers") {
      return false;
    }
    if (!removeSmallerOfDuplicatePair(level, p.a, p.i, p.b, p.j)) {
      return false;
    }
  }
  return false;
}

function processFile(file) {
  const p = path.join(levelsDir, file);
  const raw = fs.readFileSync(p, "utf8");
  /** @type {Record<string, unknown>} */
  const level = JSON.parse(raw);
  if (level.id === "level-0") {
    console.log("skip (lobby)", file);
    return;
  }
  if (level.schemaVersion === LEVEL_SCHEMA_VERSION_V2) {
    const v = validateLevel(level);
    if (v.valid) {
      console.log("skip (already v2 valid)", file);
      return;
    }
    console.log("re-migrate (v2 invalid)", file, v.errors.slice(0, 3));
  }
  for (const list of LISTS) {
    const arr = level[list];
    if (!Array.isArray(arr)) continue;
    for (const o of arr) {
      if (o && typeof o === "object") {
        delete /** @type {Record<string, unknown>} */ (o).gridX;
        delete /** @type {Record<string, unknown>} */ (o).gridZ;
      }
    }
  }
  delete level.schemaVersion;
  delete level.mapWidth;
  delete level.mapDepth;

  if (!resolveDuplicatesUntilStable(level)) {
    migrateLevelInPlace(level);
    const v = validateLevel(level);
    console.error("FAIL", file);
    for (const e of v.errors.slice(0, 30)) console.error("  -", e);
    if (v.errors.length > 30) console.error("  ...", v.errors.length - 30, "more");
    return;
  }
  fs.writeFileSync(p, `${JSON.stringify(level, null, 2)}\n`, "utf8");
  console.log("OK", file);
}

function main() {
  const files = fs
    .readdirSync(levelsDir)
    .filter((f) => f.startsWith("level-") && f.endsWith(".json"))
    .sort();
  for (const file of files) processFile(file);
}

main();
