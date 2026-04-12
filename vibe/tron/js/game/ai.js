/**
 * Enemy AI (plan Phase 4): P4.2 steering — tile-map trail lookahead + solid (arena/barrier) ray checks.
 * P4.3 — hunting: intercept (trail-cut lead), tiered flanking, aggression + reaction-time smoothing.
 * P4.4 — self-preservation: `aiAvoidanceRange` for wall rays + peer separation; `aiReactionTime` smooths combined hunt + peer steer.
 */

import { Box } from "../vendor/cannon-es-module.js";
import { physicalTrailImmunitySegments } from "../config.js";

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
 * Flank blend weight by tier (plan § Flanking at Intelligence 4+).
 * @param {"easy" | "medium" | "hard"} tier
 */
function flankBlendForTier(tier) {
  if (tier === "easy") return 0;
  if (tier === "medium") return 0.26;
  return 0.48;
}

/**
 * Intercept lead time (seconds), scaled by intelligence and player speed.
 * @param {number} intelligence
 * @param {number} playerSpeed
 * @param {number} aggression — devHud.aiAggression
 */
function interceptLeadSeconds(intelligence, playerSpeed, aggression) {
  const i = Math.max(1, Math.min(10, intelligence));
  const base = 0.28 + i * 0.09;
  const spd = Math.max(0, playerSpeed);
  const spdBoost = 1 + Math.min(1.2, spd / 55);
  const agg = Math.max(0.25, Math.min(2.5, aggression));
  return Math.min(2.2, base * spdBoost * agg);
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
/**
 * Lateral bias in [-1, 1] to separate from the player and other cycles within avoidance range (P4.4).
 * Uses cross(forward, toPeer): peer to the left → positive steer (turn right), matching A/D keys in `computeEnemyCycleKeys`.
 *
 * @param {object} opts
 * @param {number} opts.px
 * @param {number} opts.pz
 * @param {number} opts.heading
 * @param {string} opts.selfId
 * @param {number} opts.avoidRange — `devHud.aiAvoidanceRange` (clamped floor 1.2)
 * @param {Array<{ id: string; x: number; z: number }>} opts.peers
 */
export function computePeerSeparationSteer(opts) {
  const { px, pz, heading, selfId, peers, avoidRange } = opts;
  const r = Math.max(1.2, avoidRange);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let acc = 0;

  for (const p of peers) {
    if (!p || p.id === selfId) continue;
    const relX = p.x - px;
    const relZ = p.z - pz;
    const dist = Math.hypot(relX, relZ);
    if (dist < 0.08 || dist > r) continue;
    const cross = fx * relZ - fz * relX;
    const sgn = cross === 0 ? 0 : cross > 0 ? 1 : -1;
    const w = (1 - dist / r) ** 1.35;
    acc += sgn * w;
  }

  if (acc === 0) return 0;
  const norm = Math.max(-1, Math.min(1, acc * 0.82));
  return norm;
}

/**
 * P4.5 — tiered nitro: hold Space during burst; Easy random taps, Medium chase/escape, Hard chains.
 * @param {object} p
 * @param {"easy" | "medium" | "hard"} p.tier
 * @param {number} p.intelligence
 * @param {number} p.agg
 * @param {boolean} p.dangerFwd
 * @param {boolean} p.wallNear
 * @param {number} p.clearF
 * @param {number} p.distPlayer
 * @param {number} p.pspd — player speed
 * @param {number} p.enemySpd
 * @param {number} p.huntDist
 * @param {import('cannon-es').Body["userData"]} p.userData
 * @param {number} p.dt
 * @param {import('../config.js').DEFAULT_DEV_HUD} p.devHud
 */
function computeEnemyNitroDesire(p) {
  const {
    tier,
    intelligence,
    agg,
    dangerFwd,
    wallNear,
    clearF,
    distPlayer,
    pspd,
    enemySpd,
    huntDist,
    userData,
    dt,
    devHud,
  } = p;

  const avoidRange = Math.max(2.5, devHud.aiAvoidanceRange);
  const minChase = 12;
  const maxChase = tier === "hard" ? 98 : tier === "medium" ? 86 : 58;
  const wantChase =
    distPlayer > minChase &&
    distPlayer < maxChase &&
    huntDist > 3.5 &&
    pspd > 3.5 &&
    enemySpd < pspd * 1.12 + 10;

  const wantEscape =
    (dangerFwd && clearF < avoidRange * 1.85) || (wallNear && clearF < avoidRange * 1.05);

  const wantSpeed = enemySpd < 22 && distPlayer > 22 && distPlayer < 92 && tier !== "easy";

  const now = performance.now();
  if (typeof userData._aiNitroCooldownUntilMs !== "number") userData._aiNitroCooldownUntilMs = 0;

  if (tier === "easy") {
    if (now < userData._aiNitroCooldownUntilMs) return false;
    const tickProb = 0.00075 * Math.min(3, 60 * dt) * (0.65 + intelligence * 0.06) * Math.min(1.4, agg);
    if (Math.random() < tickProb && enemySpd > 1.8) {
      userData._aiNitroCooldownUntilMs = now + 2400 + Math.random() * 5200;
      return true;
    }
    if (wantChase && Math.random() < 0.0011 * Math.min(3, 60 * dt)) {
      userData._aiNitroCooldownUntilMs = now + 2000 + Math.random() * 2600;
      return true;
    }
    return false;
  }

  if (tier === "medium") {
    if (now < userData._aiNitroCooldownUntilMs) return false;
    if (wantEscape) {
      userData._aiNitroCooldownUntilMs = now + 380 + Math.random() * 420;
      return true;
    }
    if (wantChase && distPlayer < 74) {
      userData._aiNitroCooldownUntilMs = now + 480 + Math.random() * 820;
      return true;
    }
    if (wantSpeed && Math.random() < 0.014) {
      userData._aiNitroCooldownUntilMs = now + 900;
      return true;
    }
    return false;
  }

  if (wantEscape) return true;
  if (wantChase && distPlayer < 90) return true;
  if (wantSpeed) return true;
  if (distPlayer < 24 && pspd > 9) return true;
  if (now >= userData._aiNitroCooldownUntilMs && wantChase && Math.random() < 0.085) {
    userData._aiNitroCooldownUntilMs = now + 220;
    return true;
  }
  return false;
}

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
 * @param {number} [opts.playerVx] — world X velocity (for intercept)
 * @param {number} [opts.playerVz] — world Z velocity
 * @param {number} [opts.playerSpeed] — scalar speed (for lead scaling)
 * @param {number} [opts.dt] — delta time (reaction smoothing)
 * @param {number} [opts.enemyIndex] — roster index (flank left/right alternation)
 * @param {string} opts.selfId
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} opts.trailSources
 * @param {import('./nitroSystem.js').NitroRuntimeState} [opts.nitroState] — P4.5 tiered nitro bursts
 * @param {Array<{ id: string; x: number; z: number }>} [opts.peers] — player + all enemy bodies for P4.4 separation
 * @returns {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean; steer: number; dangerFwd: boolean; dangerL: boolean; dangerR: boolean; escapeBlocked: boolean; distPlayer: number }}
 */
export function computeEnemyCycleKeys(opts) {
  const {
    body,
    intelligence,
    playerPos,
    playerVx = 0,
    playerVz = 0,
    playerSpeed = 0,
    dt = 1 / 60,
    enemyIndex: enemyIndexOpt,
    selfId,
    devHud,
    playCfg,
    barrierBodies,
    trailSources,
    peers = [],
    nitroState,
  } = opts;

  const heading = typeof body.userData.heading === "number" ? body.userData.heading : 0;
  const px = body.position.x;
  const pz = body.position.z;

  let enemyIndex = typeof enemyIndexOpt === "number" && Number.isFinite(enemyIndexOpt) ? enemyIndexOpt : 0;
  const idMatch = /^enemy-(\d+)$/.exec(selfId);
  if (idMatch) enemyIndex = Number(idMatch[1]);

  const tier = intelligenceTier(intelligence);
  const agg = Math.max(0.2, Math.min(3, devHud.aiAggression));
  const leadT = interceptLeadSeconds(intelligence, playerSpeed, agg);
  let predX = playerPos.x + playerVx * leadT;
  let predZ = playerPos.z + playerVz * leadT;

  const flankBase = flankBlendForTier(tier) * agg;
  const toPredX = predX - px;
  const toPredZ = predZ - pz;
  const distPred = Math.hypot(toPredX, toPredZ);
  if (distPred > 1e-4 && flankBase > 1e-6) {
    const inv = 1 / distPred;
    const nx = toPredX * inv;
    const nz = toPredZ * inv;
    const perpX = -nz;
    const perpZ = nx;
    const side = enemyIndex % 2 === 0 ? 1 : -1;
    const flankMag = flankBase * Math.min(20, 3 + distPred * 0.38);
    predX += perpX * flankMag * side;
    predZ += perpZ * flankMag * side;
  }

  const ttx = predX - px;
  const ttz = predZ - pz;
  const huntDist = Math.hypot(ttx, ttz);
  let dh;
  if (huntDist < 0.12) {
    const tpx = playerPos.x - px;
    const tpz = playerPos.z - pz;
    dh = wrapAngle(Math.atan2(tpx, tpz) - heading);
  } else {
    dh = wrapAngle(Math.atan2(ttx, ttz) - heading);
  }

  const errGain = 2.85 * Math.min(1.2, 0.65 + agg * 0.35);
  let steerCmd = Math.max(-1, Math.min(1, dh * errGain));

  const avoidRange = Math.max(2.5, devHud.aiAvoidanceRange);
  const peerSep =
    peers.length > 0
      ? computePeerSeparationSteer({
          px,
          pz,
          heading,
          selfId,
          peers,
          avoidRange,
        })
      : 0;
  steerCmd = Math.max(-1, Math.min(1, steerCmd + peerSep * 0.95));

  const react = Math.max(0.04, devHud.aiReactionTime);
  const alpha = Math.min(1, dt / react);
  let smoothed =
    typeof body.userData.aiSteerSmoothed === "number" ? body.userData.aiSteerSmoothed : 0;
  smoothed += (steerCmd - smoothed) * alpha;
  body.userData.aiSteerSmoothed = smoothed;

  let seekSteer = 0;
  if (smoothed > 0.12) seekSteer = 1;
  else if (smoothed < -0.12) seekSteer = -1;

  const rangeScale = Math.max(0.88, Math.min(1.38, 0.92 + (avoidRange - 5) * 0.035));
  const steps = Math.max(3, Math.round(lookaheadSteps(intelligence) * rangeScale));
  const halfWTrail = lookaheadHalfWidth(intelligence);
  const imm = physicalTrailImmunitySegments(devHud, playCfg.world);

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

  const distPlayer = Math.hypot(playerPos.x - px, playerPos.z - pz);
  const enemySpd = typeof body.userData.speed === "number" ? body.userData.speed : 0;
  const escapeBlocked = dangerFwd && !safeL && !safeR;

  /** P4.5 — nitro Space: chain while bursting; otherwise tiered desire. */
  let space = false;
  if (nitroState && nitroState.burstRemaining > 1e-5) {
    space = true;
  } else if (nitroState && nitroState.bars > 0) {
    space = computeEnemyNitroDesire({
      tier,
      intelligence,
      agg,
      dangerFwd,
      wallNear,
      clearF,
      distPlayer,
      pspd: playerSpeed,
      enemySpd,
      huntDist,
      userData: body.userData,
      dt,
      devHud,
    });
  }

  return {
    w: true,
    a: steer < 0,
    s: false,
    d: steer > 0,
    space,
    steer,
    dangerFwd,
    dangerL,
    dangerR,
    escapeBlocked,
    distPlayer,
  };
}
