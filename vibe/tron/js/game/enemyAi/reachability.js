import { Box } from "../../vendor/cannon-es-module.js";

/**
 * @param {object} opts
 * @param {number} opts.ix
 * @param {number} opts.iz
 * @param {string} opts.selfId
 * @param {number} opts.immunitySegments
 * @param {boolean} opts.avoidOwnTrail
 * @param {boolean} opts.avoidEnemyTrails
 * @param {Array<{ map: { evaluateTileCollision?: Function }; ownerId: string; edgeCount: number }>} opts.sources
 */
export function isTrailTileBlocked(opts) {
  const { ix, iz, selfId, immunitySegments, avoidOwnTrail, avoidEnemyTrails, sources } = opts;
  for (const s of sources) {
    const map = s.map;
    if (!map || typeof map.evaluateTileCollision !== "function") continue;
    const own = s.ownerId === selfId;
    if (own && !avoidOwnTrail) continue;
    if (!own && !avoidEnemyTrails) continue;
    const kind = map.evaluateTileCollision(
      ix,
      iz,
      selfId,
      own ? s.edgeCount : 0,
      own ? immunitySegments : 0,
    );
    if (kind !== "clear") return true;
  }
  return false;
}

/**
 * @param {number} baseBudget
 * @param {number} distPlayer
 * @param {number} trailSourceCount
 */
export function effectiveSmartFloodBudget(baseBudget, distPlayer, trailSourceCount) {
  const n = Math.max(1, trailSourceCount);
  const sourceScale = 1 / Math.sqrt(n);
  let distScale;
  if (distPlayer < 20) distScale = 0.35;
  else if (distPlayer < 38) distScale = 0.52;
  else if (distPlayer < 70) distScale = 0.72;
  else distScale = 1;
  const capped = Math.floor(baseBudget * sourceScale * distScale);
  return Math.max(36, Math.min(baseBudget, capped));
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} halfW
 * @param {number} halfD
 * @param {number} radius
 * @param {import('cannon-es').Body[] | undefined} barrierBodies
 */
export function isSolidPointBlocked(x, z, halfW, halfD, radius, barrierBodies) {
  if (x <= -halfW + radius || x >= halfW - radius || z <= -halfD + radius || z >= halfD - radius) {
    return true;
  }
  if (!barrierBodies || barrierBodies.length === 0) return false;
  const inflate = Math.max(0.08, radius * 0.95);
  for (const b of barrierBodies) {
    if (!b || b.mass !== 0) continue;
    const shape = b.shapes[0];
    if (!(shape instanceof Box)) continue;
    const he = shape.halfExtents;
    const c = b.position;
    if (
      x >= c.x - he.x - inflate &&
      x <= c.x + he.x + inflate &&
      z >= c.z - he.z - inflate &&
      z <= c.z + he.z + inflate
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object} opts
 * @param {{ ix: number; iz: number }} opts.startTile
 * @param {{ tileToWorldCenter: Function; getBounds: Function }} opts.grid
 * @param {string} opts.selfId
 * @param {number} opts.immunitySegments
 * @param {Array<{ map: { evaluateTileCollision?: Function }; ownerId: string; edgeCount: number }>} opts.sources
 * @param {number} opts.budget
 * @param {number} opts.halfW
 * @param {number} opts.halfD
 * @param {number} opts.radius
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {boolean} opts.avoidOwnTrail
 * @param {boolean} opts.avoidEnemyTrails
 * @param {boolean} opts.avoidSolids
 * @param {number} [opts.maxRadius] — if set, BFS only enqueues tiles within Manhattan radius of `startTile`. Lets the score distinguish a 5-tile dead-end from an open lane (otherwise BFS spills back through the corridor mouth into the open arena).
 */
export function floodFillReachable(opts) {
  const {
    startTile,
    grid,
    selfId,
    immunitySegments,
    sources,
    budget,
    halfW,
    halfD,
    radius,
    barrierBodies,
    avoidOwnTrail,
    avoidEnemyTrails,
    avoidSolids,
    maxRadius,
  } = opts;
  const b = grid.getBounds();
  if (startTile.ix < 0 || startTile.ix >= b.cols || startTile.iz < 0 || startTile.iz >= b.rows) return 0;
  const useRadius = typeof maxRadius === "number" && maxRadius > 0;
  const q = [startTile];
  const seen = new Set([`${startTile.ix},${startTile.iz}`]);
  let count = 0;
  for (let qi = 0; qi < q.length && count < budget; qi++) {
    const t = q[qi];
    const wpos = grid.tileToWorldCenter(t.ix, t.iz);
    if (avoidSolids && isSolidPointBlocked(wpos.x, wpos.z, halfW, halfD, radius, barrierBodies)) {
      continue;
    }
    if (
      isTrailTileBlocked({
        ix: t.ix,
        iz: t.iz,
        selfId,
        immunitySegments,
        avoidOwnTrail,
        avoidEnemyTrails,
        sources,
      })
    ) {
      continue;
    }
    count++;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = t.ix + dx;
      const nz = t.iz + dz;
      if (nx < 0 || nx >= b.cols || nz < 0 || nz >= b.rows) continue;
      if (useRadius) {
        const md = Math.abs(nx - startTile.ix) + Math.abs(nz - startTile.iz);
        if (md > maxRadius) continue;
      }
      const key = `${nx},${nz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ ix: nx, iz: nz });
    }
  }
  return count;
}

/**
 * Tile count inside a Manhattan-radius diamond — `1 + 2R(R+1)`. Used to normalize directional reach.
 * @param {number} r
 */
export function manhattanDiamondTiles(r) {
  if (r <= 0) return 1;
  return 1 + 2 * r * (r + 1);
}

/**
 * Reachability uses full budget for all enemies; difficulty is from movement stats only.
 */
export function reachabilityTierMultiplier() {
  return 1;
}
