/**
 * Arcade light-cycle drive tick: keyboard state + nitro battery + movement integration (plan P1.5 / P1.6).
 * Single entry point so gameplay loop does not duplicate nitro/movement ordering rules.
 */

import {
  getSpeedReturnForMovement,
  isNitroBurstActive,
  updateNitroBattery,
} from "./nitroSystem.js";
import { integratePlayerCycleMovement } from "./playerMovement.js";

/**
 * @param {object} opts
 * @param {import('cannon-es').Body} opts.body
 * @param {number} opts.dt
 * @param {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean }} opts.keys
 * @param {import('./nitroSystem.js').NitroRuntimeState} opts.nitroState
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {() => void} [opts.onNitroEmptyPress]
 * @param {() => void} [opts.onNitroBurstStart]
 * @param {boolean} [opts.levelStarted=true] — when false (plan X3), W and Space are ignored until the first W (handled in `main.js`)
 */
export function tickPlayerArcadeDrive(opts) {
  const { body, dt, keys, nitroState, playCfg, devHud, onNitroEmptyPress, onNitroBurstStart } = opts;
  if (body.userData?.tronEliminated) {
    body.velocity.x = 0;
    body.velocity.z = 0;
    body.userData.speed = 0;
    return { nitroBurstActive: false };
  }
  const levelStarted = opts.levelStarted !== false;

  const keysDrive = levelStarted
    ? keys
    : { ...keys, w: false, space: false };

  const spd0 = typeof body.userData.speed === "number" ? body.userData.speed : 0;

  updateNitroBattery({
    state: nitroState,
    dt,
    space: keysDrive.space,
    maxBars: playCfg.nitroBarCount,
    burstDuration: devHud.nitroBurstDuration,
    rechargeTime: devHud.nitroBarRechargeTime,
    nitroSpeedReturnTime: devHud.nitroSpeedReturnTime,
    topSpeed: playCfg.maxMoveSpeed,
    holdingGas: keysDrive.w,
    currentSpeed: spd0,
    onEmptyPress: onNitroEmptyPress,
    onBurstStart: onNitroBurstStart,
  });

  const nitroBurstActive = isNitroBurstActive(nitroState);
  const nitroHandlingFactor = nitroBurstActive ? devHud.nitroHandlingMultiplier : 1;
  const speedReturn = getSpeedReturnForMovement(nitroState);

  integratePlayerCycleMovement(body, dt, keysDrive, nitroBurstActive, playCfg, devHud, {
    nitroHandlingFactor,
    speedReturn,
  });

  return { nitroBurstActive };
}
