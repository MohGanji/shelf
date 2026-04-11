/**
 * Full nitro battery: discrete bars, burst chaining while Space held, passive recharge,
 * speed-return phase after burst (plan § Nitro System, P1.6).
 */

/**
 * Map attribute level 1–10 → nitro bar count (5 at 1 … 12 at 10).
 * @param {number} level
 */
export function nitroBarsFromAttributeLevel(level) {
  const lv = Math.max(1, Math.min(10, Math.floor(level)));
  const n = Math.round(5 + ((lv - 1) * 7) / 9);
  return Math.max(5, Math.min(12, n));
}

/**
 * @typedef {object} NitroRuntimeState
 * @property {number} bars — full bars available (integer)
 * @property {number} rechargeAccum — fractional progress toward next bar (0–1)
 * @property {number} burstRemaining — seconds left in current burst (0 = none)
 * @property {number} speedReturnRemaining — seconds left in post-burst speed cap decay
 * @property {number} speedReturnDuration — total duration for current return phase
 * @property {number} speedReturnStartSpeed — speed when return phase began
 * @property {boolean} prevSpace
 * @property {number} emptyFlash — seconds of HUD red flash remaining
 */

/**
 * @param {number} maxBars
 * @returns {NitroRuntimeState}
 */
export function createNitroState(maxBars) {
  const m = Math.max(1, Math.floor(maxBars));
  return {
    bars: m,
    rechargeAccum: 0,
    burstRemaining: 0,
    speedReturnRemaining: 0,
    speedReturnDuration: 0,
    speedReturnStartSpeed: 0,
    prevSpace: false,
    emptyFlash: 0,
  };
}

/**
 * @param {NitroRuntimeState} state
 * @param {number} maxBars
 */
export function clampNitroCapacity(state, maxBars) {
  const m = Math.max(1, Math.floor(maxBars));
  if (state.bars > m) state.bars = m;
}

/**
 * @param {object} opts
 * @param {NitroRuntimeState} opts.state
 * @param {number} opts.dt
 * @param {boolean} opts.space
 * @param {number} opts.maxBars
 * @param {number} opts.burstDuration
 * @param {number} opts.rechargeTime — seconds per bar
 * @param {number} opts.nitroSpeedReturnTime
 * @param {number} opts.topSpeed — normal max (no nitro)
 * @param {boolean} opts.holdingGas — W held
 * @param {number} opts.currentSpeed — horizontal speed magnitude
 * @param {() => void} [opts.onEmptyPress]
 */
export function updateNitroBattery(opts) {
  const {
    state,
    dt,
    space,
    maxBars,
    burstDuration,
    rechargeTime,
    nitroSpeedReturnTime,
    topSpeed,
    holdingGas,
    currentSpeed,
    onEmptyPress,
  } = opts;

  if (dt <= 0) return;

  const spaceEdge = space && !state.prevSpace;
  state.prevSpace = space;

  const wasBursting = state.burstRemaining > 0;
  if (state.burstRemaining > 0) {
    state.burstRemaining = Math.max(0, state.burstRemaining - dt);
  }
  const nowBursting = state.burstRemaining > 0;
  const burstEnded = wasBursting && !nowBursting;

  let chainedFromBurstEnd = false;
  if (!nowBursting) {
    const shouldStart =
      (spaceEdge && state.bars > 0) ||
      (burstEnded && space && state.bars > 0);
    if (shouldStart) {
      state.burstRemaining = burstDuration;
      state.bars -= 1;
      state.speedReturnRemaining = 0;
      if (burstEnded) chainedFromBurstEnd = true;
    } else if (spaceEdge && state.bars === 0) {
      state.emptyFlash = 0.35;
      onEmptyPress?.();
    }
  }

  if (
    burstEnded &&
    !chainedFromBurstEnd &&
    holdingGas &&
    currentSpeed > topSpeed + 1e-4 &&
    nitroSpeedReturnTime > 1e-4
  ) {
    state.speedReturnRemaining = nitroSpeedReturnTime;
    state.speedReturnDuration = nitroSpeedReturnTime;
    state.speedReturnStartSpeed = currentSpeed;
  }

  if (state.speedReturnRemaining > 0) {
    if (!holdingGas) {
      state.speedReturnRemaining = 0;
    } else {
      state.speedReturnRemaining = Math.max(0, state.speedReturnRemaining - dt);
    }
  }

  const cap = Math.max(1, Math.floor(maxBars));
  if (state.bars >= cap) {
    state.rechargeAccum = 0;
  } else if (rechargeTime > 1e-6) {
    state.rechargeAccum += dt / rechargeTime;
    while (state.rechargeAccum >= 1 && state.bars < cap) {
      state.rechargeAccum -= 1;
      state.bars += 1;
    }
  }

  if (state.emptyFlash > 0) {
    state.emptyFlash = Math.max(0, state.emptyFlash - dt);
  }
}

/**
 * @param {NitroRuntimeState} state
 */
export function isNitroBurstActive(state) {
  return state.burstRemaining > 0;
}

/**
 * @param {NitroRuntimeState} state
 * @returns {null | { remaining: number; duration: number; startSpeed: number }}
 */
export function getSpeedReturnForMovement(state) {
  if (state.speedReturnRemaining <= 0 || state.speedReturnDuration <= 0) return null;
  return {
    remaining: state.speedReturnRemaining,
    duration: state.speedReturnDuration,
    startSpeed: state.speedReturnStartSpeed,
  };
}
