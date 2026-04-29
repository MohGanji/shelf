import { TILE_SIZE } from "../../config.js";
import { AI_SPEED_TUNE_REF, getEnemyBias } from "./tiers.js";

/**
 * Rewritten for all-intelligent enemies per criteria: full cognitive baseline + per-enemy
 * baked randomness for unpredictability. Difficulty only via physical playCfg stats.
 * @type {number}
 */
const COGNITIVE_SKILL01 = 1.0;

/**
 * Global aggression with per-enemy random variation for unpredictability (criteria #5).
 */
function globalAggression01(devHud, selfId = '') {
  const baseA = Math.max(0.2, Math.min(3, devHud.aiAggression));
  const randAgg = getEnemyBias(selfId, 'agg', 0.4);
  const a = baseA * (0.8 + randAgg * 0.4);
  return Math.max(0, Math.min(1, (a - 0.2) / 2.8));
}

/**
 * Rewritten per-tick AI model from scratch: full intelligence for ALL enemies (easy/medium/hard/boss),
 * baked randomness via getEnemyBias(selfId), stronger movement bias, adjusted for criteria priorities.
 * intelligence param now influences slightly for future tuning.
 * @param {object} p
 * @param {number} [p.intelligence=10]
 * @param {string} [p.selfId]
 * @param {import('../../config.js').DEFAULT_DEV_HUD} p.devHud
 * @param {ReturnType<import('../../config.js').getArenaPlaytestConfig>} p.playCfg
 * @param {number} p.playerTop
 * @param {number} p.playerSpeed
 * @param {number} p.enemySpd
 * @param {boolean} p.nitroBurstActive
 */
export function buildEnemyAiModel(p) {
  const {
    intelligence = 10,
    selfId = '',
    devHud,
    playCfg,
    playerTop,
    playerSpeed,
    enemySpd,
    nitroBurstActive,
  } = p;

  const skill01 = Math.min(1.0, COGNITIVE_SKILL01 * (intelligence / 10)); // full for all
  const baseReact = Math.max(0.04, devHud.aiReactionTime);
  const randReact = getEnemyBias(selfId, 'react', 0.3);
  const react = Math.max(0.08, baseReact * (0.7 + randReact * 0.6)); // slight jitter

  const topSpeed = Math.max(0.01, playCfg.maxMoveSpeed);
  const omega =
    playCfg.baseTurnRate * (nitroBurstActive ? devHud.nitroHandlingMultiplier : 1);

  const randAgg = globalAggression01(devHud, selfId);

  /** Horizon tuned for safety-first lookahead + movement preference. */
  const horizonSec =
    (0.18 + skill01 * 0.45 + randAgg * 0.12) * (0.6 + react * 0.8);

  /** Turn capability for sharp brake+steer turns (criteria #2). */
  const turnCapabilityRad = Math.min(1.5, omega * horizonSec + 0.25);

  /** Stationary detection for aggressive charge (criteria #3). */
  const stationary01 = Math.max(
    0,
    Math.min(1, 1 - playerSpeed / Math.max(4, playerTop * (18 / AI_SPEED_TUNE_REF))),
  );

  /** Hunt commit with randomness for cut/sweep variability. */
  const randHunt = getEnemyBias(selfId, 'hunt', 0.35);
  const huntCommit01 = Math.max(
    0.4,
    Math.min(1, skill01 * 0.75 + randAgg * 0.35 + stationary01 * 0.45 + randHunt * 0.2),
  );

  /** Pace bias tuned for 'safe minimum speed' incentive (criteria #4): stay above vulnerable limit (~25-35% top) rather than always max speed. Allows deep braking for very sharp 90-120°+ turns while preventing stationary vuln. Reduced further per feedback. */
  const paceBias01 = Math.max(0.32, Math.min(1, 0.42 + skill01 * 0.32 + randAgg * 0.22));

  /** Trail sampling with safety margin. */
  let trailSteps = Math.round((enemySpd * horizonSec * 1.2) / TILE_SIZE + 3 + skill01 * 6);
  trailSteps = Math.min(Math.max(trailSteps, 7), 16);

  const halfWidthTrail = 2.2;
  const avoidRange = Math.max(3, devHud.aiAvoidanceRange * (0.9 + getEnemyBias(selfId, 'avoid', 0.25)));
  const rangeScale = Math.max(0.85, Math.min(1.45, 0.95 + (avoidRange - 5) * 0.04));
  trailSteps = Math.max(4, Math.round(trailSteps * rangeScale));

  const randFlank = getEnemyBias(selfId, 'flank', 0.5);
  let flankBlend =
    devHud.aiFlankingEnabled === false
      ? 0
      : 0.48 * Math.max(0.3, Math.min(3, devHud.aiAggression)) * (0.8 + randFlank * 0.4);
  flankBlend *= 1 + stationary01 * 0.6;

  const playerPeerSepScale = Math.min(1, playerSpeed / Math.max(3, 10 * (playerTop / AI_SPEED_TUNE_REF)));

  const steerDelta = Math.max(0.5, Math.min(0.9, 0.45 + turnCapabilityRad * 0.6));

  const randomPersonality = {
    aggBias: randAgg,
    huntBias: randHunt,
    flankBias: randFlank,
    reactJitter: randReact,
  };

  return {
    skill01,
    horizonSec,
    turnCapabilityRad,
    stationary01,
    huntCommit01,
    paceBias01,
    trailSteps,
    halfWidthTrail,
    avoidRange,
    flankBlend,
    playerPeerSepScale,
    steerDelta,
    topSpeed,
    omega,
    react,
    randomPersonality,
    selfId, // for downstream use
  };
}
