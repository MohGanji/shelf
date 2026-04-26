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
  tunnelGridLineStep: 8,
  neonIntensity: 0.95,
  cycleNeonIntensity: 0.5,
  buildingGlitchStyle: 0,
  fogDensity: 0.009,
  trailOpacity: 0.8,
  /** Additive colored glow shell: `trailWallThickness` × this (feeds hue into bloom). */
  trailGlowThickMul: 1.7,
  /** Additive colored glow shell: `trailWallHeight` × this. */
  trailGlowHeightMul: 1.5,
  /** Additive glow strength (× trail opacity × segment fade; try 0 to disable shell). */
  trailGlowAlpha: 0.18,
  trailFadeSpeed: 1.0,
  /** Legacy alias migrated into `playerBaseTrailLength`; kept for old saves/internal fallback only. */
  defaultTrailLength: 200,
  maxSpeed: 100,
  maxAcceleration: 70,
  maxHandlingRadPerSec: 6.0,
  maxNitroBars: 6,
  playerBaseTrailLength: 200,
  enemyBaseTrailLength: 200,
  playerTrailUpgradeMaxPercent: 50,
  playerBasePercent: 45,
  enemyEasyPercent: 33,
  enemyMediumPercent: 58,
  enemyHardPercent: 77,
  enemyBossPercent: 93,
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
  /** Opponent elim kill-cam: real-time segments (simulation frozen; separate from player derez). */
  enemyKillApproachSec: 0.85,
  enemyKillImplodeSec: 0.72,
  enemyKillReturnSec: 0.6,
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
  aiSmartPlannerEnabled: true,
  aiAvoidOwnTrailEnabled: true,
  aiAvoidEnemyTrailsEnabled: true,
  aiAvoidWallsAndBarriersEnabled: true,
  aiReachabilityEnabled: false,
  aiTrapAvoidanceEnabled: true,
  aiInterceptEnabled: true,
  aiCutoffEnabled: true,
  aiFlankingEnabled: true,
  aiPressureTrailsEnabled: true,
  aiPeerSeparationEnabled: true,
  aiNitroTacticsEnabled: true,
  aiBrakeForSafetyEnabled: true,
  aiDebugScoringEnabled: false,
  aiDeterministicPlannerEnabled: false,
  aiSafetyPercent: 95,
  aiAggressionPercent: 90,
  aiCutoffPercent: 95,
  aiPressurePercent: 95,
  aiLookaheadPercent: 90,
  aiStabilityPercent: 40,
  aiAggression: 1.0,
  aiReactionTime: 0.5,
  /** % of top speed: in a pinch (hazard, not imminent), never hold brake at/below this — gas + steer to avoid zero speed. */
  aiEvasionMinSpeedPct: 19,
  /** % of top speed added above min before brake is allowed again (hysteresis vs flicker). */
  aiEvasionBrakeRearmPct: 6.5,
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

/** @type {const} */
export const ENEMY_CATEGORIES = Object.freeze(["easy", "medium", "hard", "boss"]);

/**
 * @param {Record<string, unknown>} [devHudPatch]
 * @returns {typeof DEFAULT_DEV_HUD}
 */
export function mergeDevHud(devHudPatch = {}) {
  const patch = devHudPatch && typeof devHudPatch === "object" ? devHudPatch : {};
  const out = { ...DEFAULT_DEV_HUD, ...patch };
  if (
    Object.prototype.hasOwnProperty.call(patch, "defaultTrailLength") &&
    !Object.prototype.hasOwnProperty.call(patch, "playerBaseTrailLength")
  ) {
    const legacy = Number(patch.defaultTrailLength);
    if (Number.isFinite(legacy)) out.playerBaseTrailLength = legacy;
  }
  out.defaultTrailLength = out.playerBaseTrailLength;
  return out;
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
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function numInRange(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** @param {unknown} raw @param {number} fallback */
function percent(raw, fallback) {
  return numInRange(raw, fallback, 0, 100);
}

/**
 * @param {unknown} raw
 * @param {"easy" | "medium" | "hard" | "boss"} [fallback]
 * @returns {"easy" | "medium" | "hard" | "boss"}
 */
export function normalizeEnemyCategory(raw, fallback = "easy") {
  return raw === "easy" || raw === "medium" || raw === "hard" || raw === "boss"
    ? raw
    : fallback;
}

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 * @param {"easy" | "medium" | "hard" | "boss"} category
 */
export function enemyCategoryPercent(devHud, category) {
  if (category === "boss") return percent(devHud.enemyBossPercent, DEFAULT_DEV_HUD.enemyBossPercent);
  if (category === "hard") return percent(devHud.enemyHardPercent, DEFAULT_DEV_HUD.enemyHardPercent);
  if (category === "medium") return percent(devHud.enemyMediumPercent, DEFAULT_DEV_HUD.enemyMediumPercent);
  return percent(devHud.enemyEasyPercent, DEFAULT_DEV_HUD.enemyEasyPercent);
}

/**
 * Player stat level 1 starts at `playerBasePercent`; level 10 reaches 100%.
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 * @param {unknown} level
 */
export function playerAttributePercent(devHud, level) {
  /** Min 1% at level 1 so speed/handling never hit 0 from a 0% dev-HUD "Player base" save. */
  const base = Math.max(1, percent(devHud.playerBasePercent, DEFAULT_DEV_HUD.playerBasePercent));
  const lv = Math.max(1, Math.min(10, Math.floor(Number(level))));
  return base + ((lv - 1) * (100 - base)) / 9;
}

/**
 * @param {Partial<typeof DEFAULT_DEV_HUD>} devHud
 * @param {unknown} trailLengthLevel
 */
export function playerTrailLengthFromAttribute(devHud, trailLengthLevel) {
  const base = Math.max(4, Math.floor(numInRange(devHud.playerBaseTrailLength, DEFAULT_DEV_HUD.playerBaseTrailLength, 4, 2000)));
  const maxBonus = percent(devHud.playerTrailUpgradeMaxPercent, DEFAULT_DEV_HUD.playerTrailUpgradeMaxPercent);
  const lv = Math.max(1, Math.min(10, Math.floor(Number(trailLengthLevel))));
  const bonusPercent = ((lv - 1) * maxBonus) / 9;
  return Math.max(base, Math.ceil(base * (1 + bonusPercent / 100)));
}

/** @param {Partial<typeof DEFAULT_DEV_HUD>} devHud */
export function enemyBaseTrailLength(devHud) {
  return Math.max(4, Math.floor(numInRange(devHud.enemyBaseTrailLength, DEFAULT_DEV_HUD.enemyBaseTrailLength, 4, 2000)));
}

/**
 * Flattened config for arena foundation + physics playtest (P1.2 / P1.6 attributes).
 * @param {ReturnType<typeof mergeRuntimeConfig>} runtime
 * @param {Partial<{ speed: number; acceleration: number; handling: number; nitroBars: number; trailLength: number }>} [attributes] — from save; defaults to level 1
 * @param {{ arenaWidth?: number; arenaDepth?: number }} [arenaSize] — from loaded level JSON; defaults to `WORLD` defaults
 * @param {{ actorType?: "player" | "enemy"; enemyCategory?: "easy" | "medium" | "hard" | "boss" }} [opts]
 */
export function getArenaPlaytestConfig(runtime, attributes, arenaSize, opts = {}) {
  const { world, devHud } = runtime;
  const wallH = devHud.wallHeight ?? world.arenaWallHeight;
  const a = attributes ?? {};
  const actorType = opts.actorType === "enemy" ? "enemy" : "player";
  const maxSpeed = numInRange(devHud.maxSpeed, DEFAULT_DEV_HUD.maxSpeed, 1, 500);
  const maxAcceleration = numInRange(devHud.maxAcceleration, DEFAULT_DEV_HUD.maxAcceleration, 1, 250);
  const maxHandling = numInRange(devHud.maxHandlingRadPerSec, DEFAULT_DEV_HUD.maxHandlingRadPerSec, 0.25, 20);
  const maxNitro = Math.max(1, Math.floor(numInRange(devHud.maxNitroBars, DEFAULT_DEV_HUD.maxNitroBars, 1, 32)));

  let speedPct;
  let accelPct;
  let handlingPct;
  let nitroPct;
  let trailMaxSegments;
  if (actorType === "enemy") {
    const pct = enemyCategoryPercent(devHud, normalizeEnemyCategory(opts.enemyCategory));
    speedPct = accelPct = handlingPct = nitroPct = pct;
    trailMaxSegments = enemyBaseTrailLength(devHud);
  } else {
    speedPct = playerAttributePercent(devHud, typeof a.speed === "number" ? a.speed : 1);
    accelPct = playerAttributePercent(devHud, typeof a.acceleration === "number" ? a.acceleration : 1);
    handlingPct = playerAttributePercent(devHud, typeof a.handling === "number" ? a.handling : 1);
    nitroPct = playerAttributePercent(devHud, typeof a.nitroBars === "number" ? a.nitroBars : 1);
    trailMaxSegments = playerTrailLengthFromAttribute(devHud, typeof a.trailLength === "number" ? a.trailLength : 1);
  }

  const maxMoveSpeed = maxSpeed * (speedPct / 100);
  const acceleration = maxAcceleration * (accelPct / 100);
  const baseTurnRate = maxHandling * (handlingPct / 100);
  const nitroBarCount = Math.max(1, Math.ceil(maxNitro * (nitroPct / 100)));

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
