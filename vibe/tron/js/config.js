/**
 * Base gameplay constants and default dev HUD values.
 * Runtime config merges save `devHud` over these defaults (see mergeRuntimeConfig).
 */

/**
 * When true, boot calls `AudioContext.resume()` immediately. If the browser blocks
 * autoplay, `createAudioEngine` still attaches one-time pointer/key unlock handlers.
 * Set to `false` to defer audio startup until an explicit `unlock()` / user gesture.
 * @type {boolean}
 */
export const AUDIO_AUTOPLAY = true;

/** @type {const} */
export const TILE_SIZE = 1;

/** World scale & reference constants (plan § World Scale & Units) */
export const WORLD = {
  tileSize: TILE_SIZE,
  defaultArenaWidth: 400,
  defaultArenaDepth: 400,
  lobbyArenaWidth: 400,
  lobbyArenaDepth: 200,
  defaultTopSpeed: 60,
  defaultAcceleration: 20,
  cycleMeshLength: 0.8,
  cycleMeshWidth: 0.3,
  cycleMeshHeight: 0.4,
  trailWallHeight: 0.6,
  trailWallThickness: 0.1,
  gateWidth: 5,
  arenaWallHeight: 3,
  lowSpeedThreshold: 10,
  minimumArenaSize: 40,
  segmentSpawnDistance: 1,
  coinOverlayDuration: 3,
};

/** Canonical cycle footprint + palette (plan § Light Cycle model) */
export const CYCLE_BOUNDS = {
  length: WORLD.cycleMeshLength,
  width: WORLD.cycleMeshWidth,
  height: WORLD.cycleMeshHeight,
};

export const TRON_COLORS = {
  playerCycle: 0x00ffff,
  enemyCycle: 0xff6600,
};

/** Default dev HUD keys — override chain: config defaults ← save devHud (plan save schema) */
export const DEFAULT_DEV_HUD = {
  bloomIntensity: 1.5,
  bloomThreshold: 0.3,
  chromaticAberration: 0.002,
  crtScanlines: false,
  gridBrightness: 0.4,
  neonIntensity: 1.0,
  fogDensity: 0.01,
  trailOpacity: 0.8,
  trailFadeSpeed: 1.0,
  defaultTrailLength: 40,
  trailExtendAmount: 10,
  nitroCapacityPlusAmount: 1,
  nitroBurstDuration: 0.5,
  nitroSpeedReturnTime: 0.25,
  shieldDeployTime: 0.15,
  coinOverlayDuration: 3.0,
  minimumArenaSize: 40,
  trailImmunitySegments: 4,
  portalExitImmunityDuration: 0.15,
  nitroMaxSpeedMultiplier: 1.2,
  shieldSlowdownPercent: 0.3,
  cycleTiltMax: 0.3,
  cycleTiltOnSteer: true,
  cyclePitchOnAccel: true,
  cycleLeanOnBrake: true,
  cyclePitchAccelAngle: 0.12,
  cycleLeanBrakeAngle: 0.1,
  cycleTiltSmoothing: 14,
  cycleWheelSpinScale: 3.2,
  nitroFovWiden: true,
  nitroCameraPullBack: true,
  nitroSpeedLines: true,
  nitroMotionBlur: true,
  nitroHandlingMultiplier: 0.6,
  derezSlowMo: true,
  derezCameraOverhead: true,
  derezCameraShake: true,
  derezGlitchFlash: true,
  portalWarpIntensity: 0.5,
  specialObjectCooldown: 5.0,
  shieldDuration: 5.0,
  nitroBarRechargeTime: 5.0,
  powerupRespawnTime: 10.0,
  boostPadStrength: 1.0,
  lowSpeedThreshold: 10,
  cycleFriction: 0.98,
  brakeDeceleration: 40,
  enginePitch: 1.0,
  nearMissDistance: 1.5,
  gearShiftCount: 5,
  aiAggression: 1.0,
  aiReactionTime: 0.5,
  aiAvoidanceRange: 5.0,
  steeringSpeedFalloff: 0.02,
  wallHeight: 3.0,
  musicCrossfadeDuration: 1.0,
  cameraDistance: 8,
  cameraHeight: 4,
  cameraLookAhead: 3,
  cameraDamping: 0.08,
  cameraTurnOffset: 1.5,
  /** Chase cam base vertical FOV (degrees). Nitro widens from here when enabled. */
  cameraBaseFov: 58,
  /** Extra FOV during nitro when `nitroFovWiden` is true. */
  nitroFovAdd: 14,
  /** Extra camera distance (units) during nitro when `nitroCameraPullBack` is true. */
  nitroPullBackAdd: 2.5,
};

/** Power-up palette (plan § Power-up color coding) */
export const POWERUP_COLORS = {
  instant: "#00ff66",
  levelPermanent: "#0088ff",
  equippable: "#cc00ff",
};

/** Portal pair palette (plan) */
export const PORTAL_PAIR_COLORS = ["#ff00ff", "#ffff00", "#00ff88", "#ff4444", "#44aaff"];

/**
 * @param {Record<string, unknown>} [devHudPatch]
 * @returns {typeof DEFAULT_DEV_HUD}
 */
export function mergeDevHud(devHudPatch = {}) {
  return { ...DEFAULT_DEV_HUD, ...devHudPatch };
}

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 */
export function mergeRuntimeConfig(devHud = {}) {
  return {
    world: WORLD,
    devHud: mergeDevHud(devHud),
  };
}

/** Full-screen tunnel transition (BOOT / gates) — see `engine/tunnel.js` */
export const CONFIG = {
  tunnelGateSeconds: 1,
  tunnelBootSeconds: 2.8,
  tunnelRadius: 14,
  tunnelLength: 240,
  tunnelRadialSegments: 64,
  tunnelGridRepeatU: 10,
  tunnelGridRepeatV: 6,
};

/**
 * Flattened config for arena foundation + physics playtest (P1.2).
 * @param {ReturnType<typeof mergeRuntimeConfig>} runtime
 */
export function getArenaPlaytestConfig(runtime) {
  const { world, devHud } = runtime;
  const wallH = devHud.wallHeight ?? world.arenaWallHeight;
  return {
    arenaWidth: world.defaultArenaWidth,
    arenaDepth: world.defaultArenaDepth,
    arenaWallHeight: wallH,
    physicsHz: 60,
    playerRadius: 0.35,
    playerMass: 5,
    /** Handling level 1 — rad/s before speed falloff (plan § Movement). */
    baseTurnRate: 2.5,
    /** units/s² toward top speed (plan: default 20). */
    acceleration: world.defaultAcceleration,
    maxMoveSpeed: world.defaultTopSpeed,
    /** Legacy force-based tuning (unused by arcade drive; kept for tooling). */
    moveAcceleration: 120,
    /** Horizontal damping off — coast/brake come from movement integration. */
    playerLinearDamping: 0,
    wallSlideDamping: 1,
    colors: {
      gridLine: 0x00d4ff,
      gridFloor: 0x020810,
      wallPanelA: 0x003344,
      wallPanelB: 0x006688,
      ambient: 0x88ccff,
      sun: 0xffffff,
    },
    devHud,
  };
}
