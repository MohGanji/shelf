/**
 * Player light-cycle driving: heading + forward speed (no reverse), speed-dependent turn rate,
 * coast friction, braking — see plan § Movement (P1.5).
 */

/**
 * @typedef {object} PlayerMoveOptions
 * @property {number} [nitroHandlingFactor] — multiply turn rate (burst penalty, typically below 1)
 * @property {null | { remaining: number; duration: number; startSpeed: number }} [speedReturn]
 */

/**
 * @param {import('cannon-es').Body} body
 * @param {number} dt
 * @param {{ w: boolean; a: boolean; s: boolean; d: boolean }} keys
 * @param {boolean} nitroBurstActive — nitro overrides brake while active
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @param {PlayerMoveOptions} [options]
 */
export function integratePlayerCycleMovement(
  body,
  dt,
  keys,
  nitroBurstActive,
  playCfg,
  devHud,
  options = {},
) {
  if (dt <= 0) return;

  let heading =
    typeof body.userData.heading === "number" ? body.userData.heading : 0;
  let speed = typeof body.userData.speed === "number" ? body.userData.speed : 0;

  const steer = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const baseTurn = playCfg.baseTurnRate;
  const handleMul =
    typeof options.nitroHandlingFactor === "number" ? options.nitroHandlingFactor : 1;
  const effTurn =
    (baseTurn / (1 + Math.abs(speed) * devHud.steeringSpeedFalloff)) * handleMul;
  heading += steer * effTurn * dt;

  const friction = devHud.cycleFriction;
  const brakeRate = devHud.brakeDeceleration;
  const accel = playCfg.acceleration;
  const top = playCfg.maxMoveSpeed;
  const nitroCap = top * devHud.nitroMaxSpeedMultiplier;

  const braking = keys.s && !nitroBurstActive;
  const accelerating = keys.w && !braking;

  if (nitroBurstActive) {
    /** Stronger than normal accel while burst is active (full nitro system in P1.6). */
    const push = accel * 2.5;
    speed = Math.min(nitroCap, speed + push * dt);
  } else if (braking) {
    speed = Math.max(0, speed - brakeRate * dt);
  } else if (accelerating) {
    speed = Math.min(top, speed + accel * dt);
  } else {
    const steps = dt * playCfg.physicsHz;
    speed *= Math.pow(friction, steps);
  }

  const sr = options.speedReturn;
  if (sr && sr.duration > 0 && sr.remaining > 0 && keys.w) {
    const u = 1 - sr.remaining / sr.duration;
    const t = u < 0 ? 0 : u > 1 ? 1 : u;
    const top = playCfg.maxMoveSpeed;
    const cap = sr.startSpeed + (top - sr.startSpeed) * t;
    speed = Math.min(speed, cap);
  }

  body.velocity.x = speed * Math.sin(heading);
  body.velocity.z = speed * Math.cos(heading);

  body.userData.heading = heading;
  body.userData.speed = speed;
}

/**
 * After wall slide, align stored heading/speed with horizontal velocity so bouncing feels correct.
 * @param {import('cannon-es').Body} body
 * @param {number} [minSpeed=0.08]
 */
export function syncHeadingSpeedFromVelocity(body, minSpeed = 0.08) {
  const vx = body.velocity.x;
  const vz = body.velocity.z;
  const hs = Math.hypot(vx, vz);
  if (hs > minSpeed) {
    body.userData.heading = Math.atan2(vx, vz);
    body.userData.speed = hs;
  } else {
    body.userData.speed = hs;
  }
}
