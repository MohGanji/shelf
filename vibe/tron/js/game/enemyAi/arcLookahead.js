/**
 * Curved-trajectory safety: predict where the cycle actually goes if it holds a steer for a
 * short horizon, accounting for speed-dependent turn rate (`baseTurnRate /
 * (1 + speed * steeringSpeedFalloff)`). Returns the first collision distance/time along the
 * arc, or the full horizon if clear. Replaces the legacy straight-ray + static-cone check —
 * matches the actual physics from `playerMovement.js`.
 */

import { TILE_SIZE } from "../../config.js";
import { isSolidPointBlocked, isTrailTileBlocked } from "./reachability.js";

/**
 * @typedef {object} ArcResult
 * @property {number} safeT — seconds along arc until first collision (≤ horizon)
 * @property {number} safeDist — distance traveled along arc before first hit
 * @property {boolean} blocked — true if any sample collided
 * @property {"none" | "solid" | "trail" | "ownTrail"} blockKind
 * @property {number} endX
 * @property {number} endZ
 * @property {number} endH
 */

/**
 * @param {object} opts
 * @param {number} opts.px
 * @param {number} opts.pz
 * @param {number} opts.heading
 * @param {-1 | 0 | 1} opts.cand — left key (-1) → +heading, right key (+1) → -heading; matches `candidateHeading()`
 * @param {number} opts.simSpeed — speed used for path integration (clamped, not necessarily current)
 * @param {number} opts.omega — base turn rate (rad/s), already nitro-adjusted
 * @param {number} opts.falloff — steeringSpeedFalloff (matches playerMovement.js)
 * @param {number} opts.horizon — seconds to look ahead
 * @param {number} opts.halfW
 * @param {number} opts.halfD
 * @param {number} opts.radius — playerRadius
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {string} opts.selfId
 * @param {number} opts.immunitySegments
 * @param {Array<{ map: { worldToTile?: Function; evaluateTileCollision?: Function }; ownerId: string; edgeCount: number }>} opts.sources
 * @param {boolean} opts.avoidOwnTrail
 * @param {boolean} opts.avoidEnemyTrails
 * @param {boolean} opts.avoidSolids
 * @param {{ worldToTile: Function } | null | undefined} opts.grid
 * @returns {ArcResult}
 */
export function simulateArcSafety(opts) {
  const {
    px,
    pz,
    heading,
    cand,
    simSpeed,
    omega,
    falloff,
    horizon,
    halfW,
    halfD,
    radius,
    barrierBodies,
    selfId,
    immunitySegments,
    sources,
    avoidOwnTrail,
    avoidEnemyTrails,
    avoidSolids,
    grid,
  } = opts;

  /** Match `candidateHeading()`: cand<0 → +delta. So turnDir = -cand. */
  const turnDir = cand < 0 ? 1 : cand > 0 ? -1 : 0;

  /**
   * Step distance is the controlling factor, not iteration count: we MUST sample at least once
   * per tile to guarantee a 1-tile-wide trail can never fall between samples. At top-speed
   * (~55 m/s) and 0.5s horizon, this is ~60 iterations × 3 cands × 4 enemies = 720/frame, well
   * within budget for tile lookups.
   */
  const stepDist = TILE_SIZE * 0.55;
  const stepTime = stepDist / Math.max(0.5, simSpeed);
  const maxIters = 96;

  let h = heading;
  let x = px;
  let z = pz;
  let t = 0;
  let safeT = horizon;
  let safeDist = horizon * simSpeed;
  /** @type {ArcResult["blockKind"]} */
  let blockKind = "none";

  let traveled = 0;
  let iter = 0;
  /** Sample the starting tile too — catches the case where the cycle is already on/abutting trail. */
  if ((avoidOwnTrail || avoidEnemyTrails) && grid && typeof grid.worldToTile === "function") {
    const tile0 = grid.worldToTile(x, z);
    if (
      isTrailTileBlocked({
        ix: tile0.ix,
        iz: tile0.iz,
        selfId,
        immunitySegments,
        avoidOwnTrail,
        avoidEnemyTrails,
        sources,
      })
    ) {
      return { safeT: 0, safeDist: 0, blocked: true, blockKind: "trail", endX: x, endZ: z, endH: h };
    }
  }
  while (t < horizon && iter < maxIters) {
    const subDt = Math.min(stepTime, horizon - t);
    iter++;
    /** Speed-dependent effective turn rate — same shape as `playerMovement.js`. */
    const effTurn = omega / (1 + Math.abs(simSpeed) * falloff);
    h += turnDir * effTurn * subDt;
    const dx = simSpeed * Math.sin(h) * subDt;
    const dz = simSpeed * Math.cos(h) * subDt;
    x += dx;
    z += dz;
    traveled += Math.hypot(dx, dz);
    t += subDt;

    if (avoidSolids && isSolidPointBlocked(x, z, halfW, halfD, radius, barrierBodies)) {
      safeT = t;
      safeDist = traveled;
      blockKind = "solid";
      break;
    }

    if ((avoidOwnTrail || avoidEnemyTrails) && grid && typeof grid.worldToTile === "function") {
      const tile = grid.worldToTile(x, z);
      if (
        isTrailTileBlocked({
          ix: tile.ix,
          iz: tile.iz,
          selfId,
          immunitySegments,
          avoidOwnTrail,
          avoidEnemyTrails,
          sources,
        })
      ) {
        safeT = t;
        safeDist = traveled;
        /** Still a "trail" hit — the AI doesn't need to distinguish own vs enemy here, only `enemies.js` does. */
        blockKind = "trail";
        break;
      }
    }
  }

  return { safeT, safeDist, blocked: blockKind !== "none", blockKind, endX: x, endZ: z, endH: h };
}
