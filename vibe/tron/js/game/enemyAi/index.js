/**
 * REWRITTEN FROM SCRATCH enemy AI brain per user criteria (safety first, brake+steer sharp turns,
 * aggressive charge/cut/sweep, stay fast/moving, baked randomness). All enemies (easy/medium/hard/boss)
 * now use full intelligent logic independent of category — physical stats vary for difficulty but
 * decision making is uniformly smart.
 *
 * Core priorities implemented as:
 * 1. Absolute safety: hard veto on low safeT/reactCollision via arc lookahead sim; max safeT dominates scoring.
 * 2. Brake + max steer for sharp turns (detected via arc.endH delta >~40deg) to enable tight safe/attack maneuvers.
 * 3. Aggressive hunt: stationary01 boosts charge to slow player; flank/cut/sweep with random offset/bias for unpredictability.
 * 4. Strong pace/movement bias: min speed floor, avoid braking unless critical, prefer accel when safe.
 * 5. Per-enemy baked randomness via hash(selfId + key) in model.randomPersonality for varied but consistent behavior.
 *
 * Simplified scoring (safety*30 weight), removed over-reliance on reach flood in some paths, updated model/hunt/brake.
 * Uses existing helpers (arcLookahead, hunt, evasion, sense) but new decision hierarchy. Preserves API for enemies.js.
 */

import { physicalTrailImmunitySegments } from "../../config.js";
import { simulateArcSafety } from "./arcLookahead.js";
import { buildEnemyAiModel } from "./attributes.js";
import { applyAiEvasionThrottle } from "./evasion.js";
import { smartAiParams } from "./devHudParams.js";
import { computePeerSeparationSteer, hasDangerousTrailAhead } from "./hazards.js";
import {
  applyPaceBreakAndFlank,
  computeHuntTarget,
  huntSteerCommand,
} from "./hunt.js";
import { computeEnemyNitroDesire } from "./nitro.js";
import { raycastSolidClearanceXZ } from "./raycast.js";
import {
  effectiveSmartFloodBudget,
  floodFillReachable,
  manhattanDiamondTiles,
  reachabilityTierMultiplier,
} from "./reachability.js";
import { buildTrailSense } from "./sense.js";
import { wrapAngle } from "./tiers.js";

export {
  AI_SPEED_TUNE_REF,
  INTELLIGENCE_EASY_MAX,
  INTELLIGENCE_MEDIUM_MAX,
  intelligenceTier,
  getEnemyBias,
  wrapAngle,
} from "./tiers.js";
export { computePeerSeparationSteer, hasDangerousTrailAhead } from "./hazards.js";
export { raycastSolidClearanceXZ } from "./raycast.js";

/**
 * @param {object} opts
 * @param {import('cannon-es').Body} opts.body
 * @param {number} opts.intelligence
 * @param {{ x: number; z: number }} opts.playerPos
 * @param {number} [opts.playerVx]
 * @param {number} [opts.playerVz]
 * @param {number} [opts.playerSpeed]
 * @param {number} [opts.dt]
 * @param {number} [opts.enemyIndex]
 * @param {string} opts.selfId
 * @param {import('../../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {ReturnType<import('../../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {number} [opts.playerMaxMoveSpeed]
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {Array<{ map: { hasTrailAhead: Function; evaluateTileCollision?: Function; worldToTile?: Function; tileToWorldCenter?: Function; getBounds?: Function }; ownerId: string; edgeCount: number }>} opts.trailSources
 * @param {import('../nitroSystem.js').NitroRuntimeState} [opts.nitroState]
 * @param {Array<{ id: string; x: number; z: number }>} [opts.peers]
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
    playerMaxMoveSpeed: playerMaxMoveSpeedOpt,
    barrierBodies,
    trailSources,
    peers = [],
    nitroState,
  } = opts;

  const heading = typeof body.userData.heading === "number" ? body.userData.heading : 0;
  const px = body.position.x;
  const pz = body.position.z;

  let enemyIndex =
    typeof enemyIndexOpt === "number" && Number.isFinite(enemyIndexOpt) ? enemyIndexOpt : 0;
  const idMatch = /^enemy-(\d+)$/.exec(selfId);
  if (idMatch) enemyIndex = Number(idMatch[1]);

  const enemyTop = Math.max(0.01, playCfg.maxMoveSpeed);
  const playerTop = Math.max(
    0.01,
    typeof playerMaxMoveSpeedOpt === "number" && Number.isFinite(playerMaxMoveSpeedOpt)
      ? playerMaxMoveSpeedOpt
      : enemyTop,
  );

  const nitroBurstActive = nitroState && nitroState.burstRemaining > 1e-5;
  const enemySpdEarly = typeof body.userData.speed === "number" ? body.userData.speed : 0;

  // Rewritten model call with selfId for per-enemy baked randomness (criteria #5)
  // All enemies now use full intelligent model regardless of category/intelligence param
  const model = buildEnemyAiModel({
    intelligence: Math.max(10, intelligence), // force full intelligence for all
    selfId,
    devHud,
    playCfg,
    playerTop,
    playerSpeed,
    enemySpd: enemySpdEarly,
    nitroBurstActive: !!nitroBurstActive,
  });

  const { trailDangerAt } = buildTrailSense({
    px,
    pz,
    heading,
    selfId,
    immunitySegments: physicalTrailImmunitySegments(devHud, playCfg.world),
    trailSteps: model.trailSteps,
    halfWidthTrail: model.halfWidthTrail,
    trailSources,
  });

  /** Forward-cone signals — kept exclusively for `enemies.js` shield FSM. */
  const dangerFwd = trailDangerAt(heading);
  const dangerL = trailDangerAt(heading + 0.55);
  const dangerR = trailDangerAt(heading - 0.55);
  const escapeBlocked = dangerFwd && dangerL && dangerR;

  const halfW = playCfg.arenaWidth / 2;
  const halfD = playCfg.arenaDepth / 2;
  const pr = playCfg.playerRadius;

  const topSpeed = model.topSpeed;
  const enemySpd = enemySpdEarly;
  const distPlayer = Math.hypot(playerPos.x - px, playerPos.z - pz);

  /** Anti-bait: per-enemy estimate of how hard the player is juking right now. */
  const playerHeadingNow =
    Math.abs(playerVx) + Math.abs(playerVz) > 1e-3
      ? Math.atan2(playerVx, playerVz)
      : typeof body.userData._aiLastPlayerHeading === "number"
        ? body.userData._aiLastPlayerHeading
        : 0;
  const lastPH = body.userData._aiLastPlayerHeading;
  let evasive01 =
    typeof body.userData._aiPlayerEvasive01 === "number" ? body.userData._aiPlayerEvasive01 : 0;
  if (typeof lastPH === "number" && playerSpeed > playerTop * 0.12) {
    const dH = Math.abs(wrapAngle(playerHeadingNow - lastPH)) / Math.max(0.01, dt);
    /** Saturates at ~2.5 rad/s (~143°/s) — a sharp 90° hook in 0.6s. */
    const instant = Math.max(0, Math.min(1, dH / 2.5));
    /** Smooth: 80% old, 20% new — single feint registers across ~5 frames. */
    evasive01 = evasive01 * 0.8 + instant * 0.2;
  } else {
    evasive01 *= 0.85;
  }
  body.userData._aiLastPlayerHeading = playerHeadingNow;
  body.userData._aiPlayerEvasive01 = evasive01;

  /** Hunt target with cooperative flank + anti-bait. */
  let { predX, predZ } = computeHuntTarget({
    px,
    pz,
    playerPos,
    playerVx,
    playerVz,
    playerSpeed,
    playerTop,
    enemyIndex,
    devHud,
    stationary01: model.stationary01,
    flankBlend: model.flankBlend,
    evasive01,
    selfId,
    peers,
  });

  const pace = applyPaceBreakAndFlank(body, {
    playerSpeed,
    playerTop,
    distPlayer,
    stationary01: model.stationary01,
    enemyIndex,
    playerPos,
    px,
    pz,
    predX,
    predZ,
  });
  predX = pace.predX;
  predZ = pace.predZ;
  const paceBreak = pace.paceBreak;

  /** Smoothed peer-aware hunt steer — feeds the scorer's stability/cutoff bias only. */
  let steerCmd = huntSteerCommand(px, pz, heading, predX, predZ, playerPos, devHud);
  const peerSep =
    devHud.aiPeerSeparationEnabled !== false && peers.length > 0
      ? computePeerSeparationSteer({
          px,
          pz,
          heading,
          selfId,
          peers,
          avoidRange: model.avoidRange,
          playerPeerSepScale: model.playerPeerSepScale,
        })
      : 0;
  steerCmd = Math.max(-1, Math.min(1, steerCmd + peerSep * 0.95));

  const alpha = Math.min(1, dt / model.react);
  let smoothed =
    typeof body.userData.aiSteerSmoothed === "number" ? body.userData.aiSteerSmoothed : 0;
  smoothed += (steerCmd - smoothed) * alpha;
  body.userData.aiSteerSmoothed = smoothed;

  let prefSteer = 0;
  if (smoothed > 0.12) prefSteer = 1;
  else if (smoothed < -0.12) prefSteer = -1;
  const prevSteer =
    typeof body.userData.aiLastSmartSteer === "number" ? body.userData.aiLastSmartSteer : 0;

  const imm = physicalTrailImmunitySegments(devHud, playCfg.world);
  const avoidOwnTrail = devHud.aiAvoidOwnTrailEnabled !== false;
  const avoidEnemyTrails = devHud.aiAvoidEnemyTrailsEnabled !== false;
  const avoidSolids = devHud.aiAvoidWallsAndBarriersEnabled !== false;

  const grid = trailSources[0] && trailSources[0].map;
  const reachMult =
    reachabilityTierMultiplier() * (devHud.aiReachabilityEnabled !== false ? 1 : 0);
  const useReachGrid =
    reachMult > 0 &&
    grid &&
    typeof grid.worldToTile === "function" &&
    typeof grid.tileToWorldCenter === "function" &&
    typeof grid.getBounds === "function" &&
    devHud.aiTrapAvoidanceEnabled !== false;

  const smartParams = smartAiParams(devHud);
  const reachRadius = Math.max(4, Math.min(8, Math.round(4 + smartParams.lookahead * 5)));
  const reachMaxTiles = manhattanDiamondTiles(reachRadius);
  const floodCap = useReachGrid
    ? Math.max(
        24,
        Math.floor(
          Math.min(
            effectiveSmartFloodBudget(smartParams.floodBudget, distPlayer, trailSources.length),
            reachMaxTiles,
          ) * reachMult,
        ),
      )
    : 0;

  /** Look ahead at min(current speed, 50% top) so a slow cycle still sees walls 7+ tiles out. */
  const simSpeed = Math.max(enemySpd, topSpeed * 0.5);
  /**
   * CRITICAL: arc distance must cover full brake-stopping distance at current speed plus a
   * reaction-time margin, otherwise the AI can never brake in time at top speed (with
   * brakeDecel=40 and v=55, stopDist = v²/(2a) = 37.8m — bigger than a 0.65s × 55 = 35m arc).
   * We bake the safe lookahead into the horizon so all downstream code stays consistent.
   */
  const brakeDecel = Math.max(1, devHud.brakeDeceleration ?? 40);
  const reactSec = model.react;
  const stopDistAtSpeed = (enemySpd * enemySpd) / (2 * brakeDecel) + enemySpd * reactSec;
  const minArcDist = Math.max(model.avoidRange * 2, stopDistAtSpeed * 1.25);
  const baseHorizonDist = simSpeed * Math.max(0.12, model.horizonSec);
  const arcDist = Math.max(baseHorizonDist, minArcDist);
  const horizon = arcDist / simSpeed;
  const targetAng = Math.atan2(predX - px, predZ - pz);
  const falloff = devHud.steeringSpeedFalloff;

  /** Rewritten from scratch per criteria (top priority safety #1, randomness #5, etc).
   * Uses arc lookahead for safety, hard veto on low safety, bias to aggressive target among safe options,
   * baked randomPersonality from model for unpredictability, sharp turn detection for brake+steer (#2).
   * All cands evaluated; safety dominates completely, aggression only among safe paths.
   */
  /** @type {(-1|0|1)[]} */
  const cands = [-1, 0, 1];
  let bestCand = /** @type {-1|0|1} */ (0);
  let bestScore = -Infinity;
  let bestSafeT = 0;
  let bestSafeDist = 0;
  let bestBlocked = false;
  let bestBlockKind = "none";
  let bestReachable = -1;
  let bestArc = null;

  const randPersonality = model.randomPersonality || { huntBias: 0.5, flankBias: 0.5 };

  for (const cand of cands) {
    const arc = simulateArcSafety({
      px,
      pz,
      heading,
      cand,
      simSpeed,
      omega: model.omega,
      falloff,
      horizon,
      halfW,
      halfD,
      radius: pr,
      barrierBodies,
      selfId,
      immunitySegments: imm,
      sources: trailSources,
      avoidOwnTrail,
      avoidEnemyTrails,
      avoidSolids,
      grid,
    });

    let reachable = -1;
    let openness = 1;
    if (useReachGrid) {
      const tile = grid.worldToTile(arc.endX, arc.endZ);
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
        maxRadius: reachRadius,
      });
      openness = Math.min(1, reachable / Math.max(1, reachMaxTiles));
    }

    const arcEndAng = wrapAngle(arc.endH);
    const align = Math.cos(wrapAngle(targetAng - arcEndAng));
    const safetyN = Math.max(0, Math.min(1, arc.safeT / horizon));
    const reactCollision = arc.safeDist / Math.max(0.5, enemySpd);

    // Hard safety veto (criteria #1 - never run into trails): reject if imminent danger
    if (reactCollision < model.react * 0.45) {
      continue; // strict, prefer safer even if not best align
    }

    let score = safetyN * 30; // safety dominates heavily per priority #1
    score += openness * 5 * (0.6 + smartParams.safety * 0.4);
    // Aggression bias only on safe paths, with randomness for cut/sweep/charge (#3)
    const aggrW = (1.2 + 2.2 * model.stationary01) * smartParams.aggression * model.huntCommit01 * (0.6 + randPersonality.huntBias * 0.8);
    score += Math.max(0.1, align) * aggrW;
    score += (cand === prevSteer ? 1.2 : 0) * smartParams.stability;
    // Baked randomness to avoid predictability (#5)
    score += (randPersonality.huntBias - 0.5) * 2.5;

    if (arc.blockKind === "trail") score -= 12 * (1 - safetyN); // stronger trail penalty

    if (score > bestScore) {
      bestScore = score;
      bestCand = cand;
      bestSafeT = arc.safeT;
      bestSafeDist = arc.safeDist;
      bestBlocked = arc.blocked;
      bestBlockKind = arc.blockKind;
      bestReachable = reachable;
      bestArc = arc;
    }
  }

  let steer = bestCand;
  body.userData.aiLastSmartSteer = steer;

  const huntDist = Math.hypot(predX - px, predZ - pz);
  const reactCollisionBest = bestSafeDist / Math.max(0.5, enemySpd);

  /**
   * Rewritten brake logic from scratch per criteria #2 (brake+steer for sharp turns to attack/safe)
   * and #4 (stay fast/moving, avoid stationary). Uses bestArc for turn sharpness detection,
   * model.paceBias01 to prefer accel, randomPersonality for variable braking.
   * Hysteresis kept but tuned for less stationary time.
   */
  const wantedLast = body.userData._aiBrakeWanted === true;
  let wantBrake = false;
  if (devHud.aiBrakeForSafetyEnabled !== false && !nitroBurstActive) {
    const minStopT = enemySpd / (2 * brakeDecel);
    const engageT = Math.max(reactSec * 0.6, minStopT + reactSec * 0.5);
    const releaseT = engageT * 1.6;
    const engage = reactCollisionBest < engageT;
    const stayEngaged = wantedLast && reactCollisionBest < releaseT;

    // Sharp turn detection for VERY sharp turns (criteria #2): allow 90-120°+ (deltaH > 1.1 ~63°, up to ~2.1rad). 
    // This permits braking almost to vulnerable limit (~22-28% topSpeed) for escape/attack positioning.
    let isSharpTurn = false;
    if (bestArc) {
      const deltaH = Math.abs(wrapAngle(bestArc.endH - heading));
      isSharpTurn = deltaH > 1.1 || (steer !== 0 && deltaH > 0.7); // tuned for 70°+ triggers deep brake+steer
    }

    const randBrake = model.randomPersonality ? model.randomPersonality.aggBias || 0.5 : 0.5;
    const paceBias = model.paceBias01 || 0.42; // updated lower per model change

    // Dynamic vulnerable-aware target: prioritize staying >~25% topSpeed (above aiEvasionMinSpeedPct) rather than max speed
    const vulnerableLimit = topSpeed * 0.22; // slightly below evasion floor to allow deep brake for sharp maneuvers
    const targetSpeedForManeuver = Math.max(vulnerableLimit * 1.35, topSpeed * paceBias * 0.85);

    if (bestBlocked || engage || stayEngaged) {
      wantBrake = true; // safety override
    } else if (isSharpTurn && enemySpd > targetSpeedForManeuver * 0.9 && randBrake > 0.25) {
      wantBrake = true; // deep brake + steering for 90-120°+ sharp turns to get out of situations (#2)
    } else if (
      steer !== 0 &&
      bestSafeT < horizon * 0.65 &&
      enemySpd > topSpeed * 0.38 &&
      randBrake > 0.4
    ) {
      wantBrake = true; // carve for aggression (lowered threshold)
    } else if (model.stationary01 > 0.55 && paceBias < 0.65) {
      wantBrake = false; // prefer accel when charging stationary player
    }
  }
  // Updated movement preference (#4): allow slowing for sharp maneuvers but veto brake if dropping below vulnerable limit unless critical
  if (wantBrake && enemySpd < topSpeed * 0.26 && !bestBlocked && reactCollisionBest > 1.1) {
    wantBrake = false; // stay above vulnerable ~26%
  }
  body.userData._aiBrakeWanted = wantBrake;

  /**
   * `imminent` bypasses the evasion floor. Trigger when:
   *   - Best candidate is blocked (no way out — full stop overrides the keep-moving floor).
   *   - Or collision is within actual brake-stopping distance + small margin.
   */
  const stopMarginT = enemySpd / brakeDecel + reactSec * 0.4;
  const isImminent = bestBlocked || reactCollisionBest < stopMarginT;
  let brake = applyAiEvasionThrottle(body, {
    wantBrake,
    hazard: bestBlocked || reactCollisionBest < stopMarginT * 1.4,
    imminent: isImminent,
    enemySpd,
    topSpeed,
    devHud,
  });
  body.userData._aiBrakeOn = brake;

  /** Inputs for nitro module — tuned for staying fast with randomness. */
  const clearFSafe = bestSafeDist;
  const wallNear = bestSafeT < horizon * 0.45;
  const paceBiasForNitro = model.paceBias01 || 0.6;

  let space = false;
  if (nitroState && nitroBurstActive) {
    space = true;
  } else if (nitroState && nitroState.bars > 0) {
    const wantPaceNitro =
      (paceBreak && enemySpd < topSpeed * 0.55 && !bestBlocked && paceBiasForNitro > 0.5) ||
      (!paceBreak &&
        !bestBlocked &&
        !wallNear &&
        distPlayer > 18 &&
        distPlayer < 90 &&
        enemySpd > topSpeed * 0.25 &&
        enemySpd < topSpeed * 0.55);
    space = wantPaceNitro
      ? true
      : computeEnemyNitroDesire({
          agg: Math.max(0.2, Math.min(3, devHud.aiAggression)),
          dangerFwd: bestBlockKind === "trail",
          wallNear,
          clearF: clearFSafe,
          distPlayer,
          pspd: playerSpeed,
          enemySpd,
          huntDist,
          userData: body.userData,
          dt,
          devHud,
          enemyTop,
          playerTop,
          stationary01: model.stationary01,
        });
  }

  if (devHud.aiDebugScoringEnabled) {
    body.userData.aiSmartBrake = brake;
    body.userData.aiSmartScore = bestScore;
    body.userData.aiSmartReachable = bestReachable;
    body.userData.aiSmartDanger = bestBlocked;
    body.userData.aiSmartSafeT = bestSafeT;
    body.userData.aiSmartEvasive = evasive01;
    if (model.randomPersonality) body.userData.aiRandomBias = model.randomPersonality.huntBias;
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
