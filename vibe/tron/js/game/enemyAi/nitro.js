import { AI_SPEED_TUNE_REF } from "./tiers.js";
import { smartAiParams } from "./devHudParams.js";

/**
 * Nitro desire — same logic tier-for-tier; weaker enemies fire less often only because
 * they have fewer bars / lower top speed from `playCfg`, not because of dumbed-down rules.
 * @param {object} p
 * @param {number} p.intelligence — unused; kept for call-site compatibility
 * @param {number} p.agg
 * @param {boolean} p.dangerFwd
 * @param {boolean} p.wallNear
 * @param {number} p.clearF
 * @param {number} p.distPlayer
 * @param {number} p.pspd
 * @param {number} p.enemySpd
 * @param {number} p.huntDist
 * @param {import('cannon-es').Body["userData"]} p.userData
 * @param {number} p.dt
 * @param {import('../../config.js').DEFAULT_DEV_HUD} p.devHud
 * @param {number} p.enemyTop
 * @param {number} p.playerTop
 * @param {number} p.stationary01
 */
export function computeEnemyNitroDesire(p) {
  const {
    agg,
    dangerFwd,
    wallNear,
    clearF,
    distPlayer,
    pspd,
    enemySpd,
    huntDist,
    userData,
    devHud,
    enemyTop,
    playerTop,
    stationary01,
  } = p;

  const pMul = playerTop / AI_SPEED_TUNE_REF;
  const eMul = enemyTop / AI_SPEED_TUNE_REF;
  const closeBoost = 0.65 + stationary01 * 0.5;

  if (devHud.aiNitroTacticsEnabled === false) return false;
  if (devHud.aiSmartPlannerEnabled !== false) {
    const smart = smartAiParams(devHud);
    const wantEscape = dangerFwd && clearF > Math.max(8, devHud.aiAvoidanceRange * 1.15);
    const huntMin = pspd < 10 * pMul ? 1.2 : 4;
    const chaseWindow = distPlayer > 14 && distPlayer < 105 && huntDist > huntMin;
    const speedDeficit = enemySpd < pspd * 1.06 + 8 * eMul;
    const wantChase = chaseWindow && speedDeficit && !dangerFwd && !wallNear;
    const wantRecoverSpeed =
      enemySpd < 18 * eMul && distPlayer > 24 && distPlayer < 100 && !dangerFwd;
    const now = performance.now();
    if (typeof userData._aiNitroCooldownUntilMs !== "number") userData._aiNitroCooldownUntilMs = 0;
    if (now < userData._aiNitroCooldownUntilMs) return false;
    if (wantEscape && smart.safety > 0.45) {
      userData._aiNitroCooldownUntilMs = now + 260;
      return true;
    }
    const chaseAggro = smart.aggression * closeBoost;
    if (wantChase && chaseAggro > 0.22) {
      userData._aiNitroCooldownUntilMs = now + 320 + (1 - chaseAggro) * 820;
      return true;
    }
    if (wantRecoverSpeed && smart.aggression > 0.55 && smart.safety < 0.96) {
      userData._aiNitroCooldownUntilMs = now + Math.round(850 * (1 - stationary01 * 0.35));
      return true;
    }
    return false;
  }

  const avoidRange = Math.max(2.5, devHud.aiAvoidanceRange);
  const minChase = 12;
  const maxChase = 98;
  const wantChaseMoving =
    distPlayer > minChase &&
    distPlayer < maxChase &&
    huntDist > 3.5 &&
    pspd > 3.5 * pMul &&
    enemySpd < pspd * 1.12 + 10 * eMul;
  const wantChaseVuln =
    distPlayer > minChase &&
    distPlayer < maxChase &&
    pspd < 3.5 * pMul &&
    huntDist > 1.15 &&
    enemySpd < 42 * eMul;
  const wantChase = wantChaseMoving || wantChaseVuln;

  const wantEscape =
    (dangerFwd && clearF < avoidRange * 1.85) || (wallNear && clearF < avoidRange * 1.05);

  const wantSpeed = enemySpd < 22 * eMul && distPlayer > 22 && distPlayer < 92;

  const now = performance.now();
  if (typeof userData._aiNitroCooldownUntilMs !== "number") userData._aiNitroCooldownUntilMs = 0;

  if (wantEscape) return true;
  if (wantChase && distPlayer < 90) return true;
  if (wantSpeed) return true;
  if (distPlayer < 24 && pspd > 9 * pMul) return true;
  if (now >= userData._aiNitroCooldownUntilMs && wantChase && Math.random() < 0.085 * closeBoost) {
    userData._aiNitroCooldownUntilMs = now + 220;
    return true;
  }
  return false;
}
