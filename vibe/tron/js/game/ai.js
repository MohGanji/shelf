/**
 * Enemy AI (plan Phase 4): P4.2 steering — tile-map trail lookahead + solid (arena/barrier) ray checks.
 * P4.3 — hunting: intercept (trail-cut lead), tiered flanking, aggression + reaction-time smoothing.
 * P4.4 — self-preservation: `aiAvoidanceRange` for wall rays + peer separation; `aiReactionTime` smooths combined hunt + peer steer.
 * Slow / idle player: lateral sweep flanking scales up; peer separation from the **player** scales down so cycles can close and cut in.
 * `offenseBlend` + `pinCommit`: on a **slow/close** player, `applyAiEvasionThrottle` only sees `imminentHit` as hazard (not `dangerL/R` noise), and react-brakes are skipped — avoids S↔W stutter. Still obeys `imminentHit`.
 * Pace: planner favors **W** and high `enemySpd` / `topSpeed`; if stuck near a static player (~no progress) briefly **re-aims** `pred` away, keeps speed, then re-engages.
 * Evasion throttle: brake is “slow enough to carve,” not “stop.” Planner scores gas vs brake per steer;
 * a minimum-speed floor + rearm hysteresis keeps enemies off zero in pinches unless impact is imminent.
 * While braking in hazard, steer is forced non-zero when needed so S always pairs with A/D (sharp carve).
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
 * @param {number} [opts.playerPeerSepScale=1] — 0..1, scales only the **player** peer so slow/stationary targets
 *   are not shoved by separation (enemies can close for a side sweep or kill); other peers unchanged
 */
export function computePeerSeparationSteer(opts) {
  const { px, pz, heading, selfId, peers, avoidRange, playerPeerSepScale = 1 } = opts;
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
    let w = (1 - dist / r) ** 1.35;
    if (p.id === "player") w *= Math.max(0, Math.min(1, playerPeerSepScale));
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

  if (devHud.aiNitroTacticsEnabled === false) return false;
  if (devHud.aiSmartPlannerEnabled !== false) {
    const smart = smartAiParams(devHud);
    const wantEscape = dangerFwd && clearF > Math.max(8, devHud.aiAvoidanceRange * 1.15);
    const huntMin = pspd < 10 ? 1.2 : 4;
    const chaseWindow = distPlayer > 14 && distPlayer < 105 && huntDist > huntMin;
    const speedDeficit = enemySpd < pspd * 1.06 + 8;
    const wantChase = chaseWindow && speedDeficit && !dangerFwd && !wallNear;
    const wantRecoverSpeed = enemySpd < 18 && distPlayer > 24 && distPlayer < 100 && !dangerFwd;
    const now = performance.now();
    if (typeof userData._aiNitroCooldownUntilMs !== "number") userData._aiNitroCooldownUntilMs = 0;
    if (now < userData._aiNitroCooldownUntilMs) return false;
    if (wantEscape && smart.safety > 0.45) {
      userData._aiNitroCooldownUntilMs = now + 260;
      return true;
    }
    if (wantChase && smart.aggression > 0.28) {
      userData._aiNitroCooldownUntilMs = now + 320 + (1 - smart.aggression) * 900;
      return true;
    }
    if (wantRecoverSpeed && smart.aggression > 0.62 && smart.safety < 0.96) {
      userData._aiNitroCooldownUntilMs = now + 850;
      return true;
    }
    return false;
  }

  const avoidRange = Math.max(2.5, devHud.aiAvoidanceRange);
  const minChase = 12;
  const maxChase = tier === "hard" ? 98 : tier === "medium" ? 86 : 58;
  const wantChaseMoving =
    distPlayer > minChase &&
    distPlayer < maxChase &&
    huntDist > 3.5 &&
    pspd > 3.5 &&
    enemySpd < pspd * 1.12 + 10;
  const wantChaseVuln =
    distPlayer > minChase &&
    distPlayer < maxChase &&
    pspd < 3.5 &&
    huntDist > 1.15 &&
    enemySpd < 42;
  const wantChase = wantChaseMoving || wantChaseVuln;

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

/** @param {unknown} raw @param {number} fallback */
function percent01(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback / 100;
  return Math.max(0, Math.min(1, n / 100));
}

/** @param {import('../config.js').DEFAULT_DEV_HUD} devHud */
function smartAiParams(devHud) {
  const safety = percent01(devHud.aiSafetyPercent, 95);
  const aggression = percent01(devHud.aiAggressionPercent, 90);
  const cutoff = percent01(devHud.aiCutoffPercent, 95);
  const pressure = percent01(devHud.aiPressurePercent, 95);
  const lookahead = percent01(devHud.aiLookaheadPercent, 90);
  const stability = percent01(devHud.aiStabilityPercent, 40);
  return {
    safety,
    aggression,
    cutoff,
    pressure,
    lookahead,
    stability,
    lookaheadTiles: Math.round(5 + lookahead * 17),
    floodBudget: Math.round(90 + lookahead * 420),
    projectionDist: 2.5 + lookahead * 7.5,
  };
}

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
function isTrailTileBlocked(opts) {
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
 * Each flood step calls `isTrailTileBlocked`, which scans **every** trail tile map. Cost grows with
 * `trailSources.length` × budget × planner branches; it explodes in close multi-enemy fights. Scale
 * the budget down when many trails are active or when already near the player (local geometry dominates).
 *
 * @param {number} baseBudget — from {@link smartAiParams} (often 400+)
 * @param {number} distPlayer
 * @param {number} trailSourceCount — player + live enemies
 */
function effectiveSmartFloodBudget(baseBudget, distPlayer, trailSourceCount) {
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
function isSolidPointBlocked(x, z, halfW, halfD, radius, barrierBodies) {
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
 */
function floodFillReachable(opts) {
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
  } = opts;
  const b = grid.getBounds();
  if (startTile.ix < 0 || startTile.ix >= b.cols || startTile.iz < 0 || startTile.iz >= b.rows) return 0;
  const q = [startTile];
  const seen = new Set([`${startTile.ix},${startTile.iz}`]);
  let count = 0;
  for (let qi = 0; qi < q.length && count < budget; qi++) {
    const t = q[qi];
    const wpos = grid.tileToWorldCenter(t.ix, t.iz);
    if (
      avoidSolids &&
      isSolidPointBlocked(wpos.x, wpos.z, halfW, halfD, radius, barrierBodies)
    ) {
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
      const key = `${nx},${nz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push({ ix: nx, iz: nz });
    }
  }
  return count;
}

/**
 * Unifies brake + gas for pinch escape: brake only bleeds speed down to a floor, then W is required
 * so the cycle keeps rolling while steering. Rearm hysteresis avoids brake↔gas flicker at the boundary.
 * @param {import('cannon-es').Body} body
 * @param {object} o
 * @param {boolean} o.wantBrake
 * @param {boolean} o.hazard
 * @param {boolean} o.imminent — true = allow full brake even near zero speed
 * @param {number} o.enemySpd
 * @param {number} o.topSpeed
 * @param {import('../config.js').DEFAULT_DEV_HUD} o.devHud
 */
function applyAiEvasionThrottle(body, o) {
  const { wantBrake, hazard, imminent, enemySpd, topSpeed, devHud } = o;
  const u = body.userData;
  const floorPct = aiHudNumber(devHud.aiEvasionMinSpeedPct, 19, 10, 85) / 100;
  const rearmExtraPct = aiHudNumber(devHud.aiEvasionBrakeRearmPct, 6.5, 2, 18) / 100;
  const minSpd = topSpeed * floorPct;
  const rearmSpd = minSpd + topSpeed * rearmExtraPct;

  if (!hazard || imminent) {
    u._aiEvasionCanBrake = true;
    return wantBrake;
  }

  if (typeof u._aiEvasionCanBrake !== "boolean") u._aiEvasionCanBrake = true;
  if (enemySpd <= minSpd) u._aiEvasionCanBrake = false;
  else if (enemySpd >= rearmSpd) u._aiEvasionCanBrake = true;

  if (wantBrake && !u._aiEvasionCanBrake) return false;
  return wantBrake;
}

/** @param {unknown} raw @param {number} def @param {number} min @param {number} max */
function aiHudNumber(raw, def, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
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
  /** 1 = sitting duck, 0 = normal — boosts lateral sweep & reduces “don’t step on the player” peer shove. */
  const slowVuln = Math.max(0, Math.min(1, 1 - playerSpeed / 15));
  const leadT = interceptLeadSeconds(intelligence, playerSpeed, agg);
  let predX = playerPos.x + playerVx * leadT;
  let predZ = playerPos.z + playerVz * leadT;

  const flankBase = devHud.aiFlankingEnabled === false ? 0 : flankBlendForTier(tier) * agg;
  const sweepAdd =
    devHud.aiFlankingEnabled === false
      ? 0
      : slowVuln *
        slowVuln *
        (tier === "hard" ? 0.46 : tier === "medium" ? 0.35 : 0.27) *
        Math.min(2.1, agg);
  const effectiveFlank = flankBase + sweepAdd;
  const toPredX = predX - px;
  const toPredZ = predZ - pz;
  const distPred = Math.hypot(toPredX, toPredZ);
  if (distPred > 1e-4 && effectiveFlank > 1e-6) {
    const inv = 1 / distPred;
    const nx = toPredX * inv;
    const nz = toPredZ * inv;
    const perpX = -nz;
    const perpZ = nx;
    const side = enemyIndex % 2 === 0 ? 1 : -1;
    const flankMag = effectiveFlank * Math.min(22, 3.5 + distPred * (0.38 + 0.2 * slowVuln));
    predX += perpX * flankMag * side;
    predZ += perpZ * flankMag * side;
  }

  const distPlayer = Math.hypot(playerPos.x - px, playerPos.z - pz);
  const offenseBlend = Math.max(
    0,
    Math.min(
      1,
      slowVuln * Math.max(0, (78 - distPlayer) / 78) * (distPlayer > 1.4 ? 1 : 0.45),
    ),
  );
  const uPace = body.userData;
  const nowMs = performance.now();
  if (typeof uPace._aiPaceBreakUntilMs !== "number") uPace._aiPaceBreakUntilMs = 0;
  if (typeof uPace._aiPaceBestDist !== "number") {
    uPace._aiPaceBestDist = distPlayer;
    uPace._aiPaceStuckAtMs = nowMs;
  }
  if (typeof uPace._aiPaceStuckAtMs !== "number") uPace._aiPaceStuckAtMs = nowMs;
  if (typeof uPace._aiPaceInsideBreak !== "boolean") uPace._aiPaceInsideBreak = false;
  if (nowMs < uPace._aiPaceBreakUntilMs) uPace._aiPaceInsideBreak = true;
  else {
    if (uPace._aiPaceInsideBreak) {
      uPace._aiPaceInsideBreak = false;
      uPace._aiPaceBestDist = distPlayer;
      uPace._aiPaceStuckAtMs = nowMs;
    } else if (distPlayer < uPace._aiPaceBestDist - 0.75) {
      uPace._aiPaceBestDist = distPlayer;
      uPace._aiPaceStuckAtMs = nowMs;
    }
    if (
      nowMs >= uPace._aiPaceBreakUntilMs &&
      playerSpeed < 9.5 &&
      slowVuln * Math.max(0, (100 - distPlayer) / 100) > 0.2 &&
      distPlayer < 105 &&
      distPlayer > 4.5 &&
      nowMs - uPace._aiPaceStuckAtMs > 1000
    ) {
      uPace._aiPaceBreakUntilMs = nowMs + 2800;
      uPace._aiPaceBestDist = distPlayer;
      uPace._aiPaceStuckAtMs = nowMs;
    }
  }
  const paceBreak = nowMs < uPace._aiPaceBreakUntilMs;
  if (paceBreak) {
    const rx = px - playerPos.x;
    const rz = pz - playerPos.z;
    const rlen = Math.hypot(rx, rz) || 1e-4;
    const runS = 50 + (enemyIndex % 5) * 3.5;
    const srx = (rx / rlen) * runS;
    const srz = (rz / rlen) * runS;
    const sideP = enemyIndex % 2 === 0 ? 1 : -1;
    predX = px + srx + (-rz / rlen) * 15 * sideP;
    predZ = pz + srz + (rx / rlen) * 15 * sideP;
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
  const playerPeerSepScale = Math.min(1, playerSpeed / 9);
  const peerSep =
    devHud.aiPeerSeparationEnabled !== false && peers.length > 0
      ? computePeerSeparationSteer({
          px,
          pz,
          heading,
          selfId,
          peers,
          avoidRange,
          playerPeerSepScale,
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
  const enemySpdEarly = typeof body.userData.speed === "number" ? body.userData.speed : 0;
  const topSpeed = playCfg.maxMoveSpeed;

  /** @type {number} */
  let steer = seekSteer;
  let brake = false;

  if (devHud.aiSmartPlannerEnabled !== false) {
    const p = smartAiParams(devHud);
    const planSafe = 1 - 0.76 * offenseBlend * (paceBreak ? 0.38 : 1);
    const paceN = Math.min(1, enemySpdEarly / Math.max(0.01, topSpeed));
    const paceWeight = 2.45 * p.aggression * 0.9;
    const pinApproach =
      !paceBreak && playerSpeed < 9.5 && distPlayer < 60 && distPlayer > 0.9;
    const grid = trailSources[0] && trailSources[0].map;
    const avoidOwnTrail = devHud.aiAvoidOwnTrailEnabled !== false;
    const avoidEnemyTrails = devHud.aiAvoidEnemyTrailsEnabled !== false;
    const avoidSolids = devHud.aiAvoidWallsAndBarriersEnabled !== false;
    const useReachability =
      devHud.aiReachabilityEnabled !== false &&
      grid &&
      typeof grid.worldToTile === "function" &&
      typeof grid.tileToWorldCenter === "function" &&
      typeof grid.getBounds === "function";
    const useTrapAvoidance = devHud.aiTrapAvoidanceEnabled !== false;
    const useIntercept = devHud.aiInterceptEnabled !== false;
    const useCutoff = devHud.aiCutoffEnabled !== false;
    const usePressure = devHud.aiPressureTrailsEnabled !== false;
    const evasionMinFrac = aiHudNumber(devHud.aiEvasionMinSpeedPct, 19, 10, 85) / 100;
    const prevSteer = typeof body.userData.aiLastSmartSteer === "number" ? body.userData.aiLastSmartSteer : 0;
    const targetX = useIntercept ? predX : playerPos.x;
    const targetZ = useIntercept ? predZ : playerPos.z;
    const targetAng = Math.atan2(targetX - px, targetZ - pz);
    /** Player along our forward axis (+ = player ahead of us, − = behind). */
    const playerAlongFwd =
      (playerPos.x - px) * Math.sin(heading) + (playerPos.z - pz) * Math.cos(heading);
    let best = {
      steer: seekSteer,
      score: -Infinity,
      danger: false,
      reachable: 0,
      useBrake: false,
    };
    const nitroBurstActive = nitroState && nitroState.burstRemaining > 1e-5;
    const brakeChoices = nitroBurstActive ? [false] : [false, true];
    const candidates = [-1, 0, 1];
    for (const cand of candidates) {
      for (const useBrake of brakeChoices) {
        const candHeading = heading + (cand < 0 ? 0.78 : cand > 0 ? -0.78 : 0);
        const dx = Math.sin(candHeading);
        const dz = Math.cos(candHeading);
        const spdFactor = Math.min(1, enemySpdEarly / Math.max(0.01, topSpeed));
        const projMul =
          useBrake ? 0.55 + (1 - spdFactor) * 0.22 : 1;
        const sampleDist = p.projectionDist * projMul;
        const sampleX = px + dx * sampleDist;
        const sampleZ = pz + dz * sampleDist;
        const trailStepsBase = Math.max(
          3,
          Math.floor(p.lookaheadTiles * (useBrake ? 0.78 : 1)),
        );
        const trailSteps =
          distPlayer < 26 ? Math.min(trailStepsBase, 5) : trailStepsBase;
        const trailDanger =
          (avoidOwnTrail || avoidEnemyTrails) &&
          hasDangerousTrailAhead({
            x: px,
            z: pz,
            heading: candHeading,
            selfId,
            immunitySegments: imm,
            steps: trailSteps,
            halfWidth: halfWTrail,
            sources: trailSources,
          });
        const solidClear = avoidSolids
          ? raycastSolidClearanceXZ({
              px,
              pz,
              heading: candHeading,
              halfW,
              halfD,
              playerRadius: pr,
              barrierBodies,
              maxDist: avoidRange * (1.8 + p.lookahead),
            })
          : Infinity;
        const solidDanger = avoidSolids && solidClear < avoidRange * 0.9;
        let reachable = p.floodBudget;
        if (useReachability) {
          const tile = grid.worldToTile(sampleX, sampleZ);
          const floodCap = effectiveSmartFloodBudget(p.floodBudget, distPlayer, trailSources.length);
          reachable = floodFillReachable({
            startTile: tile,
            grid,
            selfId,
            immunitySegments: imm,
            sources: trailSources,
            budget: floodCap,
            halfW,
            halfD,
            radius: pr,
            barrierBodies,
            avoidOwnTrail,
            avoidEnemyTrails,
            avoidSolids,
          });
        }

        const align = Math.cos(wrapAngle(targetAng - candHeading));
        const directDist = Math.hypot(targetX - sampleX, targetZ - sampleZ);
        const directPressure = 1 / (1 + directDist * 0.045);
        const playerToEnemyNow = Math.hypot(playerPos.x - px, playerPos.z - pz);
        const playerToCandidate = Math.hypot(playerPos.x - sampleX, playerPos.z - sampleZ);
        const closing = Math.max(
          -1,
          Math.min(1, (playerToEnemyNow - playerToCandidate) / Math.max(1, sampleDist)),
        );
        const slowCloseBonus =
          !paceBreak && playerSpeed < 13 && distPlayer < 90
            ? slowVuln * p.aggression * 1.5 * Math.max(0, closing)
            : 0;
        const cutoffScore = useCutoff ? Math.max(0, closing) * 0.7 + Math.max(0, align) * 0.3 : 0;
        const pressureScore = usePressure ? directPressure * (0.6 + Math.min(0.4, distPlayer / 120)) : 0;
        const reachScore = Math.min(1, reachable / Math.max(1, p.floodBudget));
        const trapPenalty = useTrapAvoidance && reachable < p.floodBudget * 0.18 ? 1 : 0;
        let dangerPenalty = (trailDanger ? 1 : 0) + (solidDanger ? 0.85 : 0);
        if (useBrake && enemySpdEarly > topSpeed * 0.22) {
          dangerPenalty *= 0.86;
        }
        const stabilityBonus = cand === prevSteer ? p.stability * 0.9 : cand === 0 && prevSteer === 0 ? p.stability * 0.6 : 0;

        let score = 0;
        score += reachScore * (2.2 + p.safety * 5.5) * planSafe;
        score += Math.max(0, align) * p.aggression * 3.2;
        score += slowCloseBonus;
        score += cutoffScore * p.cutoff * 3.5;
        score += pressureScore * p.pressure * 2.2;
        score += stabilityBonus;
        score -= dangerPenalty * (5 + p.safety * 12) * planSafe;
        score -= trapPenalty * (3 + p.safety * 8) * planSafe;
        if (cand === seekSteer) score += p.aggression * 0.45;

        if (!useBrake) {
          score += paceWeight * (0.22 + 0.78 * paceN);
          score += 1.35 * p.aggression * (1 - paceN) * (1 - paceN);
        } else {
          const hardHazard = trailDanger || solidDanger;
          if (!hardHazard) {
            score -= 1.1 * p.aggression * (0.55 + 0.45 * paceN) * (paceBreak ? 1.25 : 1);
          }
        }

        if (useBrake && enemySpdEarly <= topSpeed * (evasionMinFrac + 0.035)) {
          score -= (paceBreak ? 2.0 : 4.0) + p.safety * (paceBreak ? 0.3 : 0.6);
        }
        if (pinApproach && useBrake) {
          score -=
            4.2 * p.aggression * (trailDanger || solidDanger || solidClear < avoidRange * 0.85 ? 0.42 : 1.25);
        }

        if (useBrake) {
          const pinch = reachable < p.floodBudget * (0.22 + p.safety * 0.06);
          const needSlow =
            wallNear ||
            dangerFwd ||
            dangerL ||
            dangerR ||
            clearF < avoidRange * 1.15;
          const needSlowTame = paceBreak ? 0.08 : 1 - 0.9 * offenseBlend;
          if (pinch) {
            score += 1.15 + p.aggression * 1.1 + p.safety * 0.95;
          }
          if (needSlow && enemySpdEarly > topSpeed * 0.28) {
            score += (0.65 + spdFactor * (0.85 + p.safety * 0.7)) * needSlowTame;
          }
          if (
            useCutoff &&
            playerAlongFwd < -4 &&
            distPlayer < 92 &&
            distPlayer > 10 &&
            enemySpdEarly > topSpeed * 0.34 &&
            Math.abs(wrapAngle(Math.atan2(playerPos.x - px, playerPos.z - pz) - candHeading)) < 1.05
          ) {
            score += p.cutoff * p.aggression * 1.65;
          }
          const wasteful =
            distPlayer > 78 &&
            !wallNear &&
            !dangerFwd &&
            !trailDanger &&
            reachable > p.floodBudget * 0.42;
          if (wasteful) {
            score -= 1.05 * (1.45 - p.aggression * 0.55);
          }
        }

        if (score > best.score) {
          best = {
            steer: cand,
            score,
            danger: dangerPenalty > 0,
            reachable,
            useBrake: useBrake,
          };
        }
      }
    }
    steer = best.steer;
    body.userData.aiLastSmartSteer = steer;
    if (devHud.aiDebugScoringEnabled) {
      body.userData.aiSmartScore = best.score;
      body.userData.aiSmartReachable = best.reachable;
      body.userData.aiSmartDanger = best.danger;
      body.userData.aiSmartBrakePlanner = best.useBrake;
    }
    if (devHud.aiBrakeForSafetyEnabled !== false) {
      brake = best.useBrake;
      if (
        !brake &&
        !paceBreak &&
        best.danger &&
        best.reachable < p.floodBudget * 0.12 &&
        offenseBlend < 0.5
      ) {
        brake = true;
      }
    }
  } else if (dangerFwd || wallNear) {
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

  const enemySpd = typeof body.userData.speed === "number" ? body.userData.speed : 0;
  const escapeBlocked = dangerFwd && !safeL && !safeR;

  const hazardBrake = dangerFwd || wallNear || dangerL || dangerR || escapeBlocked;
  /** Only skip the gas pulse when a solid impact is truly close (not merely “trail uneasy”). */
  const imminentHit =
    clearF < pr * 2.85 + enemySpd * Math.max(0.04, dt) * 2.4 ||
    (dangerFwd && clearF < 5.8 && enemySpd > topSpeed * 0.36);
  /**
   * Slow/close target: do not treat `dangerL` / `dangerR` as “hazard” for the evasion min-speed
   * brake dance (they flicker); only **imminent** wall/trail contact keeps hazard on.
   */
  const pinCommit =
    !paceBreak && playerSpeed < 9.5 && distPlayer < 62 && distPlayer > 0.85 && !imminentHit;
  const allowPinReact = !pinCommit || imminentHit;

  /** Speed×reaction horizon (cf. Armagetron `Speed * Delay`): brake to buy turn radius before impact. */
  if (
    devHud.aiBrakeForSafetyEnabled !== false &&
    !(nitroState && nitroState.burstRemaining > 1e-5)
  ) {
    const reactH = Math.max(0.04, devHud.aiReactionTime);
    const stopDist = enemySpd * reactH * 1.45 + pr * 0.35;
    const allowPaceReact = !paceBreak || imminentHit;
    if (
      allowPaceReact &&
      allowPinReact &&
      !brake &&
      clearF < stopDist &&
      clearF < avoidRange * 1.85 &&
      enemySpd > topSpeed * 0.18
    ) {
      brake = true;
    }
    if (allowPaceReact && allowPinReact && !brake && escapeBlocked && enemySpd > topSpeed * 0.12) {
      brake = true;
    }
  }
  if (
    devHud.aiBrakeForSafetyEnabled !== false &&
    !(nitroState && nitroState.burstRemaining > 1e-5)
  ) {
    const hazardForEvas = paceBreak || pinCommit ? imminentHit : hazardBrake;
    brake = applyAiEvasionThrottle(body, {
      wantBrake: brake,
      hazard: hazardForEvas,
      imminent: imminentHit,
      enemySpd,
      topSpeed,
      devHud,
    });
  }
  if (pinCommit && !imminentHit) {
    brake = false;
  }

  if (brake && hazardBrake && steer === 0) {
    const sm =
      typeof body.userData.aiSteerSmoothed === "number" ? body.userData.aiSteerSmoothed : 0;
    if (Math.abs(sm) > 0.055) {
      steer = sm > 0 ? 1 : -1;
    } else if (seekSteer !== 0) {
      steer = seekSteer;
    } else if (safeL && !safeR) steer = 1;
    else if (safeR && !safeL) steer = -1;
    else if (safeL && safeR) steer = clearL >= clearR ? 1 : -1;
    else if (safeHL && !safeHR) steer = 1;
    else if (safeHR && !safeHL) steer = -1;
    else steer = clearL >= clearR ? 1 : -1;
  }

  /** P4.5 — nitro Space: chain while bursting; otherwise tiered desire. */
  let space = false;
  if (nitroState && nitroState.burstRemaining > 1e-5) {
    space = true;
  } else if (nitroState && nitroState.bars > 0) {
    const wantPaceNitro =
      (paceBreak && enemySpd < topSpeed * 0.58 && !dangerFwd) ||
      (!paceBreak &&
        !dangerFwd &&
        !wallNear &&
        distPlayer > 22 &&
        distPlayer < 95 &&
        enemySpd > topSpeed * 0.14 &&
        enemySpd < topSpeed * 0.4);
    space = wantPaceNitro
      ? true
      : computeEnemyNitroDesire({
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

  if (devHud.aiDebugScoringEnabled) {
    body.userData.aiSmartBrake = brake;
  }

  return {
    w: !brake,
    a: steer < 0,
    s: brake,
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
