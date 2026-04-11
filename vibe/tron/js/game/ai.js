/**
 * Enemy AI (plan Phase 4): P4.2 steering — tile-map trail lookahead + solid (arena/barrier) ray checks.
 * Hunting / nitro / flanking land in P4.3+.
 */

import { Box } from "cannon-es";

/** Intelligence 1–3 → Easy tier (plan § AI Difficulty Tiers). */
export const INTELLIGENCE_EASY_MAX = 3;

/** Intelligence 4–7 → Medium tier. */
export const INTELLIGENCE_MEDIUM_MAX = 7;

/**
 * @param {number} intelligence — 1–10
 * @returns {"easy" | "medium" | "hard"}
 */
export function intelligenceTier(intelligence) {
  const i = Math.max(1, Math.min(10, Math.floor(intelligence)));
  if (i <= INTELLIGENCE_EASY_MAX) return "easy";
  if (i <= INTELLIGENCE_MEDIUM_MAX) return "medium";
  return "hard";
}

/**
 * @param {number} intelligence
 */
function lookaheadSteps(intelligence) {
  const i = Math.max(1, Math.min(10, Math.floor(intelligence)));
  if (i <= INTELLIGENCE_EASY_MAX) return 4;
  if (i <= INTELLIGENCE_MEDIUM_MAX) return 6;
  return 8;
}

/**
 * @param {number} intelligence
 */
function lookaheadHalfWidth(intelligence) {
  return intelligence >= 8 ? 2 : 1;
}

/**
 * @param {number} ang
 */
function wrapAngle(ang) {
  let a = ang;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Distance along a 2D ray until leaving the inner arena safe AABB (sphere center region).
 * @param {number} px
 * @param {number} pz
 * @param {number} dx
 * @param {number} dz
 * @param {number} halfW
 * @param {number} halfD
 * @param {number} r
 * @param {number} maxT
 */
function rayExitArenaInner(px, pz, dx, dz, halfW, halfD, r, maxT) {
  const xmin = -halfW + r;
  const xmax = halfW - r;
  const zmin = -halfD + r;
  const zmax = halfD - r;
  let best = Infinity;

  if (dx < -1e-8) {
    const t = (xmin - px) / dx;
    if (t > 0 && t < maxT) {
      const zz = pz + t * dz;
      if (zz >= zmin - 1e-5 && zz <= zmax + 1e-5) best = Math.min(best, t);
    }
  } else if (dx > 1e-8) {
    const t = (xmax - px) / dx;
    if (t > 0 && t < maxT) {
      const zz = pz + t * dz;
      if (zz >= zmin - 1e-5 && zz <= zmax + 1e-5) best = Math.min(best, t);
    }
  }

  if (dz < -1e-8) {
    const t = (zmin - pz) / dz;
    if (t > 0 && t < maxT) {
      const xx = px + t * dx;
      if (xx >= xmin - 1e-5 && xx <= xmax + 1e-5) best = Math.min(best, t);
    }
  } else if (dz > 1e-8) {
    const t = (zmax - pz) / dz;
    if (t > 0 && t < maxT) {
      const xx = px + t * dx;
      if (xx >= xmin - 1e-5 && xx <= xmax + 1e-5) best = Math.min(best, t);
    }
  }

  return best;
}

/**
 * Ray vs expanded barrier AABB in XZ (conservative sphere radius).
 * @param {number} ox
 * @param {number} oz
 * @param {number} dx
 * @param {number} dz
 * @param {import('cannon-es').Body} boxBody
 * @param {number} inflate
 * @param {number} maxT
 */
function rayBarrierXZ(ox, oz, dx, dz, boxBody, inflate, maxT) {
  const shape = boxBody.shapes[0];
  if (!(shape instanceof Box)) return Infinity;
  const he = shape.halfExtents;
  const c = boxBody.position;
  const minX = c.x - he.x - inflate;
  const maxX = c.x + he.x + inflate;
  const minZ = c.z - he.z - inflate;
  const maxZ = c.z + he.z + inflate;

  let t0 = 0;
  let t1 = maxT;

  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    const inv = 1 / dx;
    let ta = (minX - ox) * inv;
    let tb = (maxX - ox) * inv;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }

  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    const inv = 1 / dz;
    let ta = (minZ - oz) * inv;
    let tb = (maxZ - oz) * inv;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }

  if (t1 < t0 || t1 < 0) return Infinity;
  const hit = t0 >= 0 ? t0 : 0;
  return hit >= maxT ? Infinity : hit;
}

/**
 * Shortest distance along forward ray to arena boundary or barrier face (XZ).
 * @param {object} opts
 * @param {number} opts.px
 * @param {number} opts.pz
 * @param {number} opts.heading
 * @param {number} opts.halfW
 * @param {number} opts.halfD
 * @param {number} opts.playerRadius
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {number} [opts.maxDist=90]
 */
export function raycastSolidClearanceXZ(opts) {
  const {
    px,
    pz,
    heading,
    halfW,
    halfD,
    playerRadius,
    barrierBodies,
    maxDist = 90,
  } = opts;
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const r = playerRadius;

  let best = rayExitArenaInner(px, pz, dx, dz, halfW, halfD, r, maxDist);
  if (barrierBodies && barrierBodies.length) {
    const inflate = Math.max(0.08, r * 0.95);
    for (const b of barrierBodies) {
      if (!b || b.mass !== 0) continue;
      const t = rayBarrierXZ(px, pz, dx, dz, b, inflate, maxDist);
      if (t < best) best = t;
    }
  }
  return best;
}

/**
 * True if any trail tile map reports dangerous trail in the lookahead cone.
 * @param {object} opts
 * @param {number} opts.x
 * @param {number} opts.z
 * @param {number} opts.heading
 * @param {string} opts.selfId
 * @param {number} opts.immunitySegments
 * @param {number} opts.steps
 * @param {number} opts.halfWidth
 * @param {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} opts.sources
 */
export function hasDangerousTrailAhead(opts) {
  const { x, z, heading, selfId, immunitySegments, steps, halfWidth, sources } = opts;
  for (const s of sources) {
    const map = s.map;
    const oid = s.ownerId;
    const edges = s.edgeCount;
    const imm = oid === selfId ? immunitySegments : 0;
    const numSelfEdges = oid === selfId ? edges : 0;
    if (
      map.hasTrailAhead({
        x,
        z,
        heading,
        selfId,
        numSelfEdges,
        immunitySegments: imm,
        steps,
        halfWidth,
      })
    ) {
      return true;
    }
  }
  return false;
}

/**
 * @param {object} opts
 * @param {import('cannon-es').Body} opts.body
 * @param {number} opts.intelligence
 * @param {{ x: number; z: number }} opts.playerPos
 * @param {string} opts.selfId
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} opts.trailSources
 * @returns {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean; steer: number }}
 */
export function computeEnemyCycleKeys(opts) {
  const {
    body,
    intelligence,
    playerPos,
    selfId,
    devHud,
    playCfg,
    barrierBodies,
    trailSources,
  } = opts;

  const heading = typeof body.userData.heading === "number" ? body.userData.heading : 0;
  const px = body.position.x;
  const pz = body.position.z;

  const tpx = playerPos.x - px;
  const tpz = playerPos.z - pz;
  const toH = Math.atan2(tpx, tpz);
  const dh = wrapAngle(toH - heading);
  let seekSteer = 0;
  if (dh > 0.04) seekSteer = 1;
  else if (dh < -0.04) seekSteer = -1;

  const steps = lookaheadSteps(intelligence);
  const halfWTrail = lookaheadHalfWidth(intelligence);
  const imm = devHud.trailImmunitySegments;

  /**
   * @param {number} ang
   */
  function trailDangerAt(ang) {
    return hasDangerousTrailAhead({
      x: px,
      z: pz,
      heading: ang,
      selfId,
      immunitySegments: imm,
      steps,
      halfWidth: halfWTrail,
      sources: trailSources,
    });
  }

  const dangerFwd = trailDangerAt(heading);
  const dangerL = trailDangerAt(heading + 0.55);
  const dangerR = trailDangerAt(heading - 0.55);
  const dangerHL = trailDangerAt(heading + 1.05);
  const dangerHR = trailDangerAt(heading - 1.05);

  const halfW = playCfg.arenaWidth / 2;
  const halfD = playCfg.arenaDepth / 2;
  const pr = playCfg.playerRadius;
  const avoidRange = Math.max(2.5, devHud.aiAvoidanceRange);

  const clearF = raycastSolidClearanceXZ({
    px,
    pz,
    heading,
    halfW,
    halfD,
    playerRadius: pr,
    barrierBodies,
    maxDist: avoidRange * 2.2,
  });
  const clearL = raycastSolidClearanceXZ({
    px,
    pz,
    heading: heading + 0.65,
    halfW,
    halfD,
    playerRadius: pr,
    barrierBodies,
    maxDist: avoidRange * 2.2,
  });
  const clearR = raycastSolidClearanceXZ({
    px,
    pz,
    heading: heading - 0.65,
    halfW,
    halfD,
    playerRadius: pr,
    barrierBodies,
    maxDist: avoidRange * 2.2,
  });

  const wallNear = clearF < avoidRange;
  const safeL = !dangerL;
  const safeR = !dangerR;
  const safeHL = !dangerHL;
  const safeHR = !dangerHR;

  /** @type {number} */
  let steer = seekSteer;

  if (dangerFwd || wallNear) {
    if (safeL && !safeR) steer = 1;
    else if (safeR && !safeL) steer = -1;
    else if (safeL && safeR) steer = clearL >= clearR ? 1 : -1;
    else if (safeHL && !safeHR) steer = 1;
    else if (safeHR && !safeHL) steer = -1;
    else steer = clearL >= clearR ? 1 : -1;
  } else {
    if (!dangerL && dangerR) steer = 1;
    else if (!dangerR && dangerL) steer = -1;
    else steer = seekSteer;
  }

  const keys = {
    w: true,
    a: steer < 0,
    s: false,
    d: steer > 0,
    space: false,
    steer,
  };
  return keys;
}
