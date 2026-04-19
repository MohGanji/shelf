import { nitroBarsFromAttributeLevel } from "./game/nitroSystem.js";

/**
 * Base gameplay constants and default dev HUD values.
 * Runtime config merges save `devHud` over these defaults (see mergeRuntimeConfig).
 */

/**
 * When true, boot attempts `AudioContext.resume()` without blocking (the resume promise can
 * stay pending under autoplay policy). Pointer/key handlers finish unlocking after the first gesture.
 * Set to `false` to skip the initial resume attempt.
 * @type {boolean}
 */
export const AUDIO_AUTOPLAY = true;

/**
 * P8.2 — Optional loop MP3s. Lobby + gameplay: two stems each (Dev HUD `lobbyMusicVariant` / `gameplayMusicVariant` 0 | 1).
 * If missing or fetch/decode fails, `audio.js` uses seamless procedural beds.
 * @type {{ lobbyVariants: readonly string[]; gameplayVariants: readonly string[] }}
 */
export const MUSIC_ASSET_URLS = {
  lobbyVariants: [
    "./assets/audio/music-lobby-v1.mp3",
    "./assets/audio/music-lobby-v2.mp3",
  ],
  gameplayVariants: [
    "./assets/audio/music-gameplay-v1.mp3",
    "./assets/audio/music-gameplay-v2.mp3",
  ],
};

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
  /**
   * Mesh + physics footprint (local Z = forward). Procedural cycle targets a **true** 3×1×1 AABB:
   * length `cycleMeshLength`, width/height `cycleMeshWidth`×`cycleMeshHeight`; wheels use full width as axle thickness (no side shrink from uniform scaling).
   */
  cycleMeshLength: 3,
  cycleMeshWidth: 1,
  cycleMeshHeight: 1,
  /**
   * Optional visual mesh URL — `.glb` / `.gltf` (recommended) or `.svg` (extruded side profile).
   * Empty string uses procedural geometry. Scale your model to roughly match {@link CYCLE_BOUNDS}; Y-up, +Z forward.
   */
  lightCycleModelUrl: "./assets/models/light-cycle-asset-gemini-3.1.gltf",
  trailWallHeight: 0.6,
  trailWallThickness: 0.1,
  gateWidth: 5,
  arenaWallHeight: 3,
  lowSpeedThreshold: 10,
  minimumArenaSize: 40,
  /** World units between rear-contact anchors. Smaller = smoother curves at speed (edge budget scales in trail.js). */
  segmentSpawnDistance: 0.25,
  coinOverlayDuration: 3,
};

/**
 * NEON cost per attribute upgrade step (level 1→2 … 9→10). Same curve for all five attributes.
 * Plan § Progression & Economy — Garage pulls from here (H2).
 * @type {readonly number[]}
 */
export const ATTRIBUTE_UPGRADE_COSTS = Object.freeze([10, 20, 35, 50, 75, 100, 150, 200, 300]);

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
  bloomIntensity: 0.95,
  /** UnrealBloomPass radius — reference-style “selective bloom” often pairs with higher threshold. */
  bloomRadius: 0.3,
  bloomThreshold: 0.3,
  chromaticAberration: 0.002,
  crtScanlines: false,
  gridBrightness: 0.2,
  /** Arena / editor / garage floor: draw every Nth world unit (4 ⇒ cells cover 4×4 units). */
  floorGridLineStep: 16,
  /** Building neon grid size: draw every Nth world unit (4 ⇒ cells cover 4×4 units). */
  buildingGridStep: 1,
  /** Boot/tunnel cylinder texture: line spacing = 32px × this (match floor feel when equal). */
  tunnelGridLineStep: 4,
  neonIntensity: 0.95,
  cycleNeonIntensity: 0.5,
  buildingGlitchStyle: 0,
  fogDensity: 0.009,
  trailOpacity: 0.8,
  trailFadeSpeed: 1.0,
  defaultTrailLength: 200,
  trailExtendAmount: 10,
  nitroCapacityPlusAmount: 1,
  nitroBurstDuration: 0.5,
  nitroSpeedReturnTime: 0.25,
  shieldDeployTime: 0.15,
  coinOverlayDuration: 3.0,
  minimumArenaSize: 40,
  /** Logical trail-length units immune at rear (~1 world unit per unit when anchor spacing is 1); scaled in collision. */
  trailImmunitySegments: 7,
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
  /** View-space fresnel rim on procedural cycle (film-style edge glow before bloom). */
  cycleFresnelRim: true,
  cycleFresnelRimIntensity: 1.0,
  nitroFovWiden: true,
  nitroCameraPullBack: true,
  nitroSpeedLines: true,
  nitroMotionBlur: true,
  nitroHandlingMultiplier: 0.6,
  derezSlowMo: true,
  derezCameraOverhead: true,
  derezCameraShake: true,
  derezGlitchFlash: true,
  /** Wall-clock seconds for player derez implosion before tunnel (plan P2.4). */
  derezSequenceSeconds: 2.0,
  /** Overhead camera height above cycle center during player derez. */
  derezOverheadHeight: 28,
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
  /** 0 = first lobby stem, 1 = second (`MUSIC_ASSET_URLS.lobbyVariants`). */
  lobbyMusicVariant: 0,
  /** 0 = first gameplay stem, 1 = second (`MUSIC_ASSET_URLS.gameplayVariants`). */
  gameplayMusicVariant: 0,
  /** Tighter chase cam so the cycle reads at a glance on large arenas (was 8 / 58°). */
  cameraDistance: 11.0,
  /** Raised so the bike and trail stay in frame near tall perimeter walls. */
  cameraHeight: 7.5,
  cameraLookAhead: 5.0,
  cameraDamping: 0.1,
  cameraTurnOffset: 1.5,
  /** Chase cam base vertical FOV (degrees). Nitro widens from here when enabled. */
  cameraBaseFov: 55,
  /** Extra FOV during nitro when `nitroFovWiden` is true. */
  nitroFovAdd: 12.0,
  /** Extra camera distance (units) during nitro when `nitroCameraPullBack` is true. */
  nitroPullBackAdd: 5.0,
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
 * Physical trail edges per ~1 world unit of path (one tile-map segment index per anchor spacing).
 * Must match the budget used in `game/trail.js` for `anchorBudgetScale`.
 * @param {Partial<typeof WORLD>} [world]
 * @returns {number} integer >= 1
 */
export function trailAnchorBudgetScale(world = WORLD) {
  const sd =
    typeof world?.segmentSpawnDistance === "number" && Number.isFinite(world.segmentSpawnDistance)
      ? world.segmentSpawnDistance
      : WORLD.segmentSpawnDistance;
  return Math.max(1, Math.round(1 / sd));
}

/**
 * Convert Dev HUD **logical** self-immunity (steps of ~1 world unit when spacing was 1) to **physical**
 * edge count for `trailTileMap` / collision (one index per anchor segment).
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 * @param {Partial<typeof WORLD>} [world]
 */
export function physicalTrailImmunitySegments(devHud, world = WORLD) {
  const raw = devHud?.trailImmunitySegments;
  const logical = Math.max(
    0,
    Math.floor(
      typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_DEV_HUD.trailImmunitySegments,
    ),
  );
  return logical * trailAnchorBudgetScale(world);
}

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD> | null | undefined} [devHud]
 * @returns {number} integer in [1, 32]
 */
export function getFloorGridLineStep(devHud) {
  const m = mergeDevHud(devHud ?? {});
  const r = m.floorGridLineStep;
  const n = typeof r === "number" && Number.isFinite(r) ? Math.round(r) : DEFAULT_DEV_HUD.floorGridLineStep;
  return Math.max(1, Math.min(32, n));
}

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD> | null | undefined} [devHud]
 * @returns {number} integer in [1, 32]
 */
export function getTunnelGridLineStep(devHud) {
  const m = mergeDevHud(devHud ?? {});
  const r = m.tunnelGridLineStep;
  const n = typeof r === "number" && Number.isFinite(r) ? Math.round(r) : DEFAULT_DEV_HUD.tunnelGridLineStep;
  return Math.max(1, Math.min(32, n));
}

/**
 * Active lobby / hub music URL from Dev HUD `lobbyMusicVariant` (0…N-1).
 * @param {Partial<typeof DEFAULT_DEV_HUD> | null | undefined} devHud
 * @returns {string}
 */
export function getLobbyMusicUrl(devHud) {
  const list = MUSIC_ASSET_URLS.lobbyVariants;
  if (!Array.isArray(list) || list.length === 0) return "";
  let idx = 0;
  if (
    devHud &&
    typeof devHud.lobbyMusicVariant === "number" &&
    Number.isFinite(devHud.lobbyMusicVariant)
  ) {
    idx = Math.max(0, Math.min(list.length - 1, Math.floor(devHud.lobbyMusicVariant)));
  }
  return list[idx] ?? "";
}

/**
 * Active gameplay music asset URL from Dev HUD `gameplayMusicVariant` (0…N-1).
 * @param {Partial<typeof DEFAULT_DEV_HUD> | null | undefined} devHud
 * @returns {string}
 */
export function getGameplayMusicUrl(devHud) {
  const list = MUSIC_ASSET_URLS.gameplayVariants;
  if (!Array.isArray(list) || list.length === 0) return "";
  let idx = 0;
  if (
    devHud &&
    typeof devHud.gameplayMusicVariant === "number" &&
    Number.isFinite(devHud.gameplayMusicVariant)
  ) {
    idx = Math.max(0, Math.min(list.length - 1, Math.floor(devHud.gameplayMusicVariant)));
  }
  return list[idx] ?? "";
}

/**
 * Merged gameplay config: static `WORLD` plus devHud overrides from save (plan § Config Override Chain).
 *
 * @typedef {{ world: typeof WORLD; devHud: ReturnType<typeof mergeDevHud> }} RuntimeConfig
 */

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 * @returns {RuntimeConfig}
 */
export function mergeRuntimeConfig(devHud = {}) {
  return {
    world: WORLD,
    devHud: mergeDevHud(devHud),
  };
}

/**
 * Boot-time helper: load merged runtime from normalized player save (`save.devHud` is partial overrides).
 * All gameplay should use this object (or `getArenaPlaytestConfig`) — not raw `DEFAULT_DEV_HUD` / `WORLD` alone.
 *
 * @param {{ devHud?: Record<string, unknown> }} playerSave
 * @returns {RuntimeConfig}
 */
export function createRuntimeFromPlayerSave(playerSave) {
  return mergeRuntimeConfig(playerSave?.devHud ?? {});
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
 * @param {number} level — attribute level 1–10
 * @param {number} min
 * @param {number} max
 */
function attrScalar(level, min, max) {
  const lv = Math.max(1, Math.min(10, Math.floor(level)));
  return min + ((lv - 1) * (max - min)) / 9;
}

/**
 * Flattened config for arena foundation + physics playtest (P1.2 / P1.6 attributes).
 * @param {ReturnType<typeof mergeRuntimeConfig>} runtime
 * @param {Partial<{ speed: number; acceleration: number; handling: number; nitroBars: number }>} [attributes] — from save; defaults to level 1
 * @param {{ arenaWidth?: number; arenaDepth?: number }} [arenaSize] — from loaded level JSON; defaults to `WORLD` defaults
 */
export function getArenaPlaytestConfig(runtime, attributes, arenaSize) {
  const { world, devHud } = runtime;
  const wallH = devHud.wallHeight ?? world.arenaWallHeight;
  const a = attributes ?? {};
  const maxMoveSpeed = attrScalar(typeof a.speed === "number" ? a.speed : 1, world.defaultTopSpeed, 120);
  const acceleration = attrScalar(
    typeof a.acceleration === "number" ? a.acceleration : 1,
    world.defaultAcceleration,
    50,
  );
  const baseTurnRate = attrScalar(typeof a.handling === "number" ? a.handling : 1, 2.5, 5.0);
  const nitroBarCount = nitroBarsFromAttributeLevel(
    typeof a.nitroBars === "number" ? a.nitroBars : 1,
  );
  const baseTrailLen = typeof devHud.defaultTrailLength === "number" ? devHud.defaultTrailLength : 100;
  /** Trail Length attribute 1–10 → max segment count scales from baseTrailLen to 2.5x baseTrailLen. */
  const trailMaxSegments = Math.round(
    attrScalar(typeof a.trailLength === "number" ? a.trailLength : 1, baseTrailLen, baseTrailLen * 2.5),
  );

  const arenaWidth =
    arenaSize && typeof arenaSize.arenaWidth === "number" && Number.isFinite(arenaSize.arenaWidth)
      ? arenaSize.arenaWidth
      : world.defaultArenaWidth;
  const arenaDepth =
    arenaSize && typeof arenaSize.arenaDepth === "number" && Number.isFinite(arenaSize.arenaDepth)
      ? arenaSize.arenaDepth
      : world.defaultArenaDepth;

  const cycleHalfWidth = world.cycleMeshWidth * 0.5;
  const cycleHalfLength = world.cycleMeshLength * 0.5;
  const cycleHalfHeight = world.cycleMeshHeight * 0.5;
  /** XZ enclosing radius for cycle↔cycle, barriers, AI rays (oriented box uses half extents in physics). */
  const playerRadius = Math.hypot(cycleHalfWidth, cycleHalfLength);

  return {
    arenaWidth,
    arenaDepth,
    /** World-scale constants (tile size, trail ribbon geometry, etc.) — same as `runtime.world`. */
    world,
    arenaWallHeight: wallH,
    physicsHz: 60,
    cycleHalfWidth,
    cycleHalfLength,
    cycleHalfHeight,
    playerRadius,
    /** Body center Y — cycle box bottom near floor (matches `createPlayerBody` / spawn). */
    playerSpawnY: cycleHalfHeight + 0.06,
    playerMass: 5,
    /** rad/s before speed falloff (plan § Movement; scales with Handling attribute). */
    baseTurnRate,
    /** units/s² toward top speed (Acceleration attribute). */
    acceleration,
    maxMoveSpeed,
    /** Nitro segments from Nitro Bars attribute (5–12). */
    nitroBarCount,
    /** Max trail wall segments from Trail Length attribute (40–100). */
    trailMaxSegments,
    /** Legacy force-based tuning (unused by arcade drive; kept for tooling). */
    moveAcceleration: 120,
    /** Horizontal damping off — coast/brake come from movement integration. */
    playerLinearDamping: 0,
    wallSlideDamping: 1,
    colors: {
      gridLine: 0x00e8ff,
      gridFloor: 0x020611,
      wallPanelA: 0x003344,
      wallPanelB: 0x006688,
      ambient: 0x8ecfff,
      sun: 0xffffff,
    },
    devHud,
  };
}
