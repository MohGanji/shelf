import { aiHudNumber } from "./devHudParams.js";

/**
 * Brake only bleeds speed down to a floor unless impact is imminent.
 * @param {import('cannon-es').Body} body
 * @param {object} o
 * @param {boolean} o.wantBrake
 * @param {boolean} o.hazard
 * @param {boolean} o.imminent
 * @param {number} o.enemySpd
 * @param {number} o.topSpeed
 * @param {import('../../config.js').DEFAULT_DEV_HUD} o.devHud
 */
export function applyAiEvasionThrottle(body, o) {
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
