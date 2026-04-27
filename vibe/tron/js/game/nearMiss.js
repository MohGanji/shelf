import { Box } from "../vendor/cannon-es-module.js";
import { physicalTrailImmunitySegments } from "../config.js";

/**
 * P2.5 — Near-miss: distance to lethal trail tiles (immunity-aligned), arena walls (gate-aware),
 * and interior barrier boxes. Audio-only feedback; no visuals (plan § Near-miss).
 */

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {number} minX
 * @param {number} maxX
 * @param {number} minZ
 * @param {number} maxZ
 */
function distPointToRect2d(px, pz, minX, maxX, minZ, maxZ) {
  const qx = clamp(px, minX, maxX);
  const qz = clamp(pz, minZ, maxZ);
  return Math.hypot(px - qx, pz - qz);
}

/**
 * Distance in XZ from `p` to the inner arena boundary, ignoring segments covered by open gates.
 *
 * @param {number} px
 * @param {number} pz
 * @param {number} halfW
 * @param {number} halfD
 * @param {null | undefined | { north: { x0: number; x1: number }[]; south: { x0: number; x1: number }[]; east: { z0: number; z1: number }[]; west: { z0: number; z1: number }[] }} fp
 */
export function nearestArenaWallDistanceXZ(px, pz, halfW, halfD, fp) {
  const gateEps = 0.04;
  let best = Infinity;

  {
    const d = pz + halfD;
    if (d > 1e-5) {
      let inGap = false;
      if (fp?.south) {
        for (const { x0, x1 } of fp.south) {
          if (px >= x0 - gateEps && px <= x1 + gateEps) {
            inGap = true;
            break;
          }
        }
      }
      if (!inGap) best = Math.min(best, d);
    }
  }
  {
    const d = halfD - pz;
    if (d > 1e-5) {
      let inGap = false;
      if (fp?.north) {
        for (const { x0, x1 } of fp.north) {
          if (px >= x0 - gateEps && px <= x1 + gateEps) {
            inGap = true;
            break;
          }
        }
      }
      if (!inGap) best = Math.min(best, d);
    }
  }
  {
    const d = px + halfW;
    if (d > 1e-5) {
      let inGap = false;
      if (fp?.west) {
        for (const { z0, z1 } of fp.west) {
          if (pz >= z0 - gateEps && pz <= z1 + gateEps) {
            inGap = true;
            break;
          }
        }
      }
      if (!inGap) best = Math.min(best, d);
    }
  }
  {
    const d = halfW - px;
    if (d > 1e-5) {
      let inGap = false;
      if (fp?.east) {
        for (const { z0, z1 } of fp.east) {
          if (pz >= z0 - gateEps && pz <= z1 + gateEps) {
            inGap = true;
            break;
          }
        }
      }
      if (!inGap) best = Math.min(best, d);
    }
  }

  return best;
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {import('cannon-es').Body[] | undefined} barrierBodies
 */
export function nearestBarrierDistanceXZ(px, pz, barrierBodies) {
  if (!barrierBodies || barrierBodies.length === 0) return Infinity;
  let best = Infinity;
  for (const boxBody of barrierBodies) {
    if (!boxBody || boxBody.mass !== 0) continue;
    const shape = boxBody.shapes[0];
    if (!(shape instanceof Box)) continue;
    const he = shape.halfExtents;
    const c = boxBody.position;
    const d = distPointToRect2d(px, pz, c.x - he.x, c.x + he.x, c.z - he.z, c.z + he.z);
    best = Math.min(best, d);
  }
  return best;
}

/**
 * @param {number} px
 * @param {number} pz
 * @param {ReturnType<import("./collisionResolve.js").buildTrailSources>} trailSources
 * @param {import("../config.js").DEFAULT_DEV_HUD} devHud
 * @param {ReturnType<import("../config.js").getArenaPlaytestConfig>} playCfg
 * @param {Parameters<typeof nearestArenaWallDistanceXZ>[4]} openFootprints
 * @param {import("cannon-es").Body[] | undefined} barrierBodies
 */
export function computePlayerNearMissDistance(
  px,
  pz,
  trailSources,
  devHud,
  playCfg,
  openFootprints,
  barrierBodies,
) {
  const halfW = playCfg.arenaWidth / 2;
  const halfD = playCfg.arenaDepth / 2;
  const cap = typeof devHud.nearMissDistance === "number" && Number.isFinite(devHud.nearMissDistance)
    ? devHud.nearMissDistance
    : 1.5;

  const selfId = "player";
  let best = Infinity;

  for (const s of trailSources) {
    const n = selfId === s.ownerId ? s.getEdgeCount() : 0;
    const imm = selfId === s.ownerId ? physicalTrailImmunitySegments(devHud, playCfg.world) : 0;
    const d = s.map.nearestHazardDistance(px, pz, selfId, n, imm, cap);
    best = Math.min(best, d);
  }

  best = Math.min(best, nearestArenaWallDistanceXZ(px, pz, halfW, halfD, openFootprints));
  best = Math.min(best, nearestBarrierDistanceXZ(px, pz, barrierBodies));

  return best;
}

/**
 * Minimum distance to lethal trail tiles only (immunity-aligned). Ignores arena walls / barriers —
 * used for trail proximity audio bed.
 *
 * @param {number} px
 * @param {number} pz
 * @param {ReturnType<import("./collisionResolve.js").buildTrailSources>} trailSources
 * @param {import("../config.js").DEFAULT_DEV_HUD} devHud
 * @param {ReturnType<import("../config.js").getArenaPlaytestConfig>} playCfg
 */
export function computeNearestTrailHazardDistanceOnly(px, pz, trailSources, devHud, playCfg) {
  const capRaw =
    typeof devHud.trailProximityFalloffDistance === "number" && Number.isFinite(devHud.trailProximityFalloffDistance)
      ? devHud.trailProximityFalloffDistance
      : 30;
  const cap = Math.max(4, capRaw);
  const selfId = "player";
  let best = Infinity;
  for (const s of trailSources) {
    const n = selfId === s.ownerId ? s.getEdgeCount() : 0;
    const imm = selfId === s.ownerId ? physicalTrailImmunitySegments(devHud, playCfg.world) : 0;
    const d = s.map.nearestHazardDistance(px, pz, selfId, n, imm, cap);
    best = Math.min(best, d);
  }
  return best;
}
