import { TILE_SIZE } from "../config.js";

/**
 * Tile-based trail occupancy for collision + AI lookahead (plan § Physics Responsibility Split, A3).
 * Each logical trail edge stamps the tiles its chord crosses; a cell stores the minimum segment
 * index per owner on that tile (worst case for self-immunity).
 */

/**
 * @typedef {'clear' | 'own-lethal' | 'other-trail'} TrailCollisionKind
 */

/**
 * @param {number} arenaWidth
 * @param {number} arenaDepth
 * @param {number} [tileSize=TILE_SIZE]
 */
export function createTrailTileMap({ arenaWidth, arenaDepth, tileSize = TILE_SIZE }) {
  const ts = tileSize > 0 ? tileSize : TILE_SIZE;
  const cols = Math.max(1, Math.floor(arenaWidth / ts));
  const rows = Math.max(1, Math.floor(arenaDepth / ts));
  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;

  /** @type {Map<string, Map<string, number>>} */
  const cells = new Map();

  function key(ix, iz) {
    return `${ix},${iz}`;
  }

  /**
   * @param {number} x
   * @param {number} z
   * @returns {{ ix: number; iz: number }}
   */
  function worldToTile(x, z) {
    let ix = Math.floor((x + halfW) / ts);
    let iz = Math.floor((z + halfD) / ts);
    if (ix < 0) ix = 0;
    else if (ix > cols - 1) ix = cols - 1;
    if (iz < 0) iz = 0;
    else if (iz > rows - 1) iz = rows - 1;
    return { ix, iz };
  }

  function stampCell(ix, iz, ownerId, segmentIndex) {
    const k = key(ix, iz);
    let m = cells.get(k);
    if (!m) {
      m = new Map();
      cells.set(k, m);
    }
    const prev = m.get(ownerId);
    const next = prev === undefined ? segmentIndex : Math.min(prev, segmentIndex);
    m.set(ownerId, next);
  }

  /**
   * Integer line plot (Bresenham) in tile space.
   * @param {number} ix0
   * @param {number} iz0
   * @param {number} ix1
   * @param {number} iz1
   * @param {(ix: number, iz: number) => void} plot
   */
  function bresenham(ix0, iz0, ix1, iz1, plot) {
    let x0 = ix0;
    let z0 = iz0;
    const dx = Math.abs(ix1 - ix0);
    const dz = Math.abs(iz1 - iz0);
    const sx = ix0 < ix1 ? 1 : -1;
    const sz = iz0 < iz1 ? 1 : -1;
    let err = dx - dz;
    for (;;) {
      plot(x0, z0);
      if (x0 === ix1 && z0 === iz1) break;
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }
  }

  /**
   * Stamp one logical trail edge (world XZ chord) into the map.
   * @param {number} ax
   * @param {number} az
   * @param {number} bx
   * @param {number} bz
   * @param {number} segmentIndex
   * @param {string} ownerId
   */
  function stampEdge(ax, az, bx, bz, segmentIndex, ownerId) {
    const ta = worldToTile(ax, az);
    const tb = worldToTile(bx, bz);
    bresenham(ta.ix, ta.iz, tb.ix, tb.iz, (ix, iz) => {
      stampCell(ix, iz, ownerId, segmentIndex);
    });
  }

  function clear() {
    cells.clear();
  }

  /**
   * @param {number} x
   * @param {number} z
   * @param {string} selfId
   * @param {number} numEdges — current logical edge count for `selfId` (anchors.length - 1)
   * @param {number} immunitySegments — devHud trailImmunitySegments (N newest edges safe for self)
   * @returns {TrailCollisionKind}
   */
  function evaluateCollision(x, z, selfId, numEdges, immunitySegments) {
    const { ix, iz } = worldToTile(x, z);
    const k = key(ix, iz);
    const cell = cells.get(k);
    if (!cell || cell.size === 0) return "clear";

    for (const [oid] of cell) {
      if (oid !== selfId) return "other-trail";
    }

    const minSeg = cell.get(selfId);
    if (minSeg === undefined) return "clear";

    const n = Math.max(0, Math.floor(numEdges));
    const imm = Math.max(0, Math.floor(immunitySegments));
    if (n === 0) return "clear";

    const cutoff = n - imm;
    if (minSeg < cutoff) return "own-lethal";
    return "clear";
  }

  /**
   * AI / lookahead: sample tiles in front of a world position along `heading` (Y rotation, +Z forward).
   * Returns true if any stamped tile in the arc contains trail from another owner, or lethal own trail.
   *
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.z
   * @param {number} opts.heading — radians, forward = +Z in local space
   * @param {string} opts.selfId
   * @param {number} opts.numSelfEdges
   * @param {number} opts.immunitySegments
   * @param {number} [opts.steps=6] — tile steps forward
   * @param {number} [opts.halfWidth=1] — lateral tile spread (Manhattan)
   */
  function hasTrailAhead({
    x,
    z,
    heading,
    selfId,
    numSelfEdges,
    immunitySegments,
    steps = 6,
    halfWidth = 1,
  }) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);

    const { ix: cx, iz: cz } = worldToTile(x, z);

    for (let s = 1; s <= steps; s++) {
      for (let w = -halfWidth; w <= halfWidth; w++) {
        const tx = cx + Math.round(fx * s + rx * w);
        const tz = cz + Math.round(fz * s + rz * w);
        if (tx < 0 || tx > cols - 1 || tz < 0 || tz > rows - 1) continue;
        const k = key(tx, tz);
        const cell = cells.get(k);
        if (!cell || cell.size === 0) continue;

        for (const [oid] of cell) {
          if (oid !== selfId) return true;
        }

        const minSeg = cell.get(selfId);
        if (minSeg === undefined) continue;
        const n = Math.max(0, Math.floor(numSelfEdges));
        const imm = Math.max(0, Math.floor(immunitySegments));
        const cutoff = n - imm;
        if (minSeg < cutoff) return true;
      }
    }
    return false;
  }

  return {
    worldToTile,
    stampEdge,
    clear,
    evaluateCollision,
    hasTrailAhead,
    /** Read-only stats for debugging */
    getCellCount() {
      return cells.size;
    },
  };
}
