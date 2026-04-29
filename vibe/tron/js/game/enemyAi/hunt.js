import { AI_SPEED_TUNE_REF, wrapAngle } from "./tiers.js";

/**
 * Intercept lead — hard-equivalent cognition for all enemies. Lead drops when the player is
 * juking (`evasive01`) so feints don't lure the AI onto the bait line.
 * @param {number} playerSpeed
 * @param {number} aggression
 * @param {number} playerTop
 * @param {number} stationary01
 * @param {number} [evasive01=0]
 */
export function interceptLeadSeconds(playerSpeed, aggression, playerTop, stationary01, evasive01 = 0) {
  let base = 0.28 + 10 * 0.09;
  base *= 1 - stationary01 * 0.35;
  const spd = Math.max(0, playerSpeed);
  const spdNorm = Math.max(8, playerTop * (55 / AI_SPEED_TUNE_REF));
  const spdBoost = 1 + Math.min(1.2, spd / spdNorm);
  const agg = Math.max(0.25, Math.min(2.5, aggression));
  const evasion = Math.max(0, Math.min(1, evasive01));
  /** Hooking player → don't commit hard to lead; tracks current position more. */
  const evasionScale = 1 - evasion * 0.55;
  return Math.min(2.2, base * spdBoost * agg * evasionScale);
}

/**
 * Pick a flank side that complements teammates instead of doubling up. Each enemy projects
 * teammate positions onto the perp axis of (self → player); if teammates already cover the
 * +perp side, this enemy goes to -perp. Falls back to enemyIndex parity when alone.
 *
 * @param {object} o
 * @param {number} o.px
 * @param {number} o.pz
 * @param {{ x: number; z: number }} o.playerPos
 * @param {string} o.selfId
 * @param {Array<{ id: string; x: number; z: number }>} [o.peers]
 * @param {number} o.enemyIndex
 * @returns {1 | -1}
 */
export function chooseCooperativeFlankSide(o) {
  const { px, pz, playerPos, selfId, peers, enemyIndex } = o;
  const dx = playerPos.x - px;
  const dz = playerPos.z - pz;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3 || !peers || peers.length === 0) {
    return enemyIndex % 2 === 0 ? 1 : -1;
  }
  const nx = dx / len;
  const nz = dz / len;
  /** Perp (rotate +90°): (-nz, nx). */
  const perpX = -nz;
  const perpZ = nx;
  let acc = 0;
  let count = 0;
  for (const p of peers) {
    if (!p || p.id === selfId || p.id === "player") continue;
    const rx = p.x - playerPos.x;
    const rz = p.z - playerPos.z;
    const proj = rx * perpX + rz * perpZ;
    if (Math.abs(proj) < 0.5) continue;
    acc += proj > 0 ? 1 : -1;
    count++;
  }
  if (count === 0) return enemyIndex % 2 === 0 ? 1 : -1;
  return acc > 0 ? -1 : 1;
}

/**
 * Pace-break FSM: briefly re-aim when stuck closing on a slow player (orbit breaker, not flee).
 * Mutates `body.userData` pace fields.
 * @param {import('cannon-es').Body} body
 * @param {object} ctx
 * @param {number} ctx.playerSpeed
 * @param {number} ctx.playerTop
 * @param {number} ctx.distPlayer
 * @param {number} ctx.stationary01
 * @param {number} ctx.enemyIndex
 * @param {{ x: number; z: number }} ctx.playerPos
 * @param {number} ctx.px
 * @param {number} ctx.pz
 * @param {number} ctx.predX
 * @param {number} ctx.predZ
 * @returns {{ predX: number; predZ: number; paceBreak: boolean }}
 */
export function applyPaceBreakAndFlank(body, ctx) {
  const {
    playerSpeed,
    playerTop,
    distPlayer,
    stationary01,
    enemyIndex,
    playerPos,
    px,
    pz,
    predX: inPredX,
    predZ: inPredZ,
  } = ctx;

  const pMul = playerTop / AI_SPEED_TUNE_REF;
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
      playerSpeed < 9.5 * pMul &&
      stationary01 * Math.max(0, (100 - distPlayer) / 100) > 0.2 &&
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
  let predX = inPredX;
  let predZ = inPredZ;
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
  return { predX, predZ, paceBreak };
}

/**
 * Build intercept + flank target in world XZ.
 * @param {object} p
 * @param {number} p.px
 * @param {number} p.pz
 * @param {{ x: number; z: number }} p.playerPos
 * @param {number} p.playerVx
 * @param {number} p.playerVz
 * @param {number} p.playerSpeed
 * @param {number} p.playerTop
 * @param {number} p.enemyIndex
 * @param {import('../../config.js').DEFAULT_DEV_HUD} p.devHud
 * @param {number} p.stationary01
 * @param {number} p.flankBlend
 * @param {number} [p.evasive01=0] — player heading-rate juke factor; reduces lead + flank when high
 * @param {string} [p.selfId]
 * @param {Array<{ id: string; x: number; z: number }>} [p.peers]
 */
export function computeHuntTarget(p) {
  const {
    px,
    pz,
    playerPos,
    playerVx,
    playerVz,
    playerSpeed,
    playerTop,
    enemyIndex,
    devHud,
    stationary01,
    flankBlend,
    evasive01 = 0,
    selfId,
    peers,
  } = p;

  const agg = Math.max(0.2, Math.min(3, devHud.aiAggression));
  const leadT = interceptLeadSeconds(playerSpeed, agg, playerTop, stationary01, evasive01);
  let predX = playerPos.x + playerVx * leadT;
  let predZ = playerPos.z + playerVz * leadT;

  /** Anti-bait: scale flank down when player is juking. */
  const evasion = Math.max(0, Math.min(1, evasive01));
  const effectiveFlank = flankBlend * (1 - 0.45 * evasion);
  const toPredX = predX - px;
  const toPredZ = predZ - pz;
  const distPred = Math.hypot(toPredX, toPredZ);
  if (distPred > 1e-4 && effectiveFlank > 1e-6) {
    const inv = 1 / distPred;
    const nx = toPredX * inv;
    const nz = toPredZ * inv;
    const perpX = -nz;
    const perpZ = nx;
    const side = chooseCooperativeFlankSide({
      px,
      pz,
      playerPos,
      selfId: selfId ?? "",
      peers,
      enemyIndex,
    });
    const flankMag =
      effectiveFlank *
      Math.min(26, 3.8 + distPred * (0.42 + 0.28 * stationary01));
    predX += perpX * flankMag * side;
    predZ += perpZ * flankMag * side;
  }

  if (devHud.aiPressureTrailsEnabled !== false && devHud.aiCutoffEnabled !== false) {
    const smart = 0.55 + stationary01 * 0.35;
    const closingBias = Math.max(0, Math.min(1, (playerSpeed + 2) / Math.max(8, playerTop * 0.35)));
    const cut = smart * (0.22 + (1 - closingBias) * 0.2);
    const pv = Math.hypot(playerVx, playerVz);
    if (pv > 0.45) {
      const ph = Math.atan2(playerVx, playerVz);
      const fx = Math.sin(ph);
      const fz = Math.cos(ph);
      predX += -fz * 6 * cut;
      predZ += fx * 6 * cut;
    }
  }

  return { predX, predZ };
}

/**
 * Bearing error → raw steer command before survival / reachability.
 * @param {number} px
 * @param {number} pz
 * @param {number} heading
 * @param {number} predX
 * @param {number} predZ
 * @param {{ x: number; z: number }} playerPos
 * @param {import('../../config.js').DEFAULT_DEV_HUD} devHud
 */
export function huntSteerCommand(px, pz, heading, predX, predZ, playerPos, devHud) {
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
  const agg = Math.max(0.2, Math.min(3, devHud.aiAggression));
  const errGain = 2.85 * Math.min(1.2, 0.65 + agg * 0.35);
  return Math.max(-1, Math.min(1, dh * errGain));
}
