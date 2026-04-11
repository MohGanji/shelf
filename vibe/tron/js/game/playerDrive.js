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
 */
export function tickPlayerArcadeDrive(opts) {
  const { body, dt, keys, nitroState, playCfg, devHud, onNitroEmptyPress } = opts;

  const spd0 = typeof body.userData.speed === "number" ? body.userData.speed : 0;

  updateNitroBattery({
    state: nitroState,
    dt,
    space: keys.space,
    maxBars: playCfg.nitroBarCount,
    burstDuration: devHud.nitroBurstDuration,
    rechargeTime: devHud.nitroBarRechargeTime,
    nitroSpeedReturnTime: devHud.nitroSpeedReturnTime,
    topSpeed: playCfg.maxMoveSpeed,
    holdingGas: keys.w,
    currentSpeed: spd0,
    onEmptyPress: onNitroEmptyPress,
  });

  const nitroBurstActive = isNitroBurstActive(nitroState);
  const nitroHandlingFactor = nitroBurstActive ? devHud.nitroHandlingMultiplier : 1;
  const speedReturn = getSpeedReturnForMovement(nitroState);

  integratePlayerCycleMovement(body, dt, keys, nitroBurstActive, playCfg, devHud, {
    nitroHandlingFactor,
    speedReturn,
  });

  return { nitroBurstActive };
}
