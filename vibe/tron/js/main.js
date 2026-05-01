import {
  AUDIO_AUTOPLAY,
  CONFIG,
  CYCLE_BOUNDS,
  MUSIC_ASSET_URLS,
  LOBBY_GRID_FLOOR_HEX,
  getLobbyMusicUrl,
  getGameplayMusicUrl,
  createRuntimeFromPlayerSave,
  getArenaPlaytestConfig,
  visualPresetDevHudPatch,
} from "./config.js";
import { GameMode, isArenaRideableMode } from "./gameState.js";
import { createChaseCamera } from "./engine/camera.js";
import {
  addCoins,
  isDailyClearedOn,
  isLevelUnlockedLinear,
  loadOrCreateSave,
  patchSettings,
  persistSave,
  recordDailyCleared,
  recordLevelComplete,
  setFlagSeenGarage,
  setTutorialCleared,
} from "./data/savedata.js";
import { createAudioEngine } from "./engine/audio.js";
import { applyLargeArenaGraphicsOverrides, getGraphicsProfile } from "./engine/graphicsProfile.js";
import { createGameRenderer } from "./engine/renderer.js";
import { isTunnelBlockingInput, playTunnel } from "./engine/tunnel.js";
import {
  applyContinuousArenaWallSlide,
  applyContinuousBarrierSlide,
  createPhysicsWorld,
  createPlayerBody,
  syncCyclePhysicsYaw,
} from "./engine/physics.js";
import { createTronCycleKeyState } from "./engine/input.js";
import {
  applyArenaEnvMapToSubtree,
  applyArenaFloorEnvMap,
  applyArenaStageEnvironment,
  buildArenaFromCampaignLevel,
  runtimeUnlockCampaignExitGate,
} from "./game/arena.js";
import { createArenaAmbience } from "./game/arenaAmbience.js";
import { createEnemyKillRipple } from "./game/enemyKillRipple.js";
import {
  applyExitGateRuntimeOpenVisual,
  computePlayerSpawnFromEntranceGate,
  extractGatesFromWallObjects,
  getGateInwardPoint,
  queryOpenGateAtPosition,
  updateGateAnimations,
  withLobbyArenaGateLock,
  withLobbyDailyGateRuntime,
  withLobbyRuntimeGateOverrides,
} from "./game/gates.js";
import { createWaypointBeacon } from "./game/waypointBeacon.js";
import { createLightCycle, preloadLightCycleAsset } from "./game/cycle.js";
import { syncHeadingSpeedFromVelocity } from "./game/playerMovement.js";
import { tickPlayerArcadeDrive } from "./game/playerDrive.js";
import { clampNitroCapacity, createNitroState, isNitroBurstActive } from "./game/nitroSystem.js";
import { createGameplayParticles, hexColorToInt } from "./game/particles.js";
import { createBoostPadField, createPortalField } from "./game/objects.js";
import { createCampaignPowerupField, refillNitroBars } from "./game/powerups.js";
import { createPickupFeedback } from "./ui/pickupFeedback.js";
import { cosmeticColorToCssHex } from "./game/neonCosmetic.js";
import { createTrailWallSystem } from "./game/trail.js";
import {
  applyEnemyWallAndBarrierSlide,
  beginEnemyCinematicElimination,
  createCampaignEnemyEntities,
  eliminateCampaignEnemy,
  endEnemyCinematicDerez,
  syncEnemyHeadingSpeed,
  updateEnemyCycleMeshes,
  updateEnemyTrails,
} from "./game/enemies.js";
import {
  buildTrailSources,
  evaluateCyclePairContact,
  tryTrailHitOnBody,
} from "./game/collisionResolve.js";
import {
  computeNearestTrailHazardDistanceOnly,
  computePlayerNearMissDistance,
} from "./game/nearMiss.js";
import {
  extractArenaDimensionsFromLevel,
  findCampaignLevelByCampaignIndex,
  findCampaignLevelById,
  getWipLevelValidated,
  fetchDailyLobbyMeta,
  fetchLevelByFilename,
  getLocalYyyyMmDd,
  loadCampaignLevels,
  parseCampaignLevelIndex,
  selectPlaytestCampaignLevel,
  TUTORIAL_LEVEL_FILENAME,
} from "./levels/loader.js";
import { consumeSessionBootTarget, setSessionBootTarget } from "./sessionBoot.js";
import { peekEditorPlaytestReturn, setEditorPlaytestReturn } from "./sessionEditorPlaytest.js";
import { mountEditorDestinationScreen, mountGarageDestinationScreen } from "./ui/garage.js";
import {
  createLevelExitDestinationOverlayController,
  createPauseMenuController,
  isControlsOverlayBlockingInput,
  isLevelExitDestinationOverlayBlockingInput,
  isPauseOverlayBlockingInput,
  showFirstVisitControlsOverlayIfNeeded,
} from "./ui/menus.js";
import { createDevHudController } from "./ui/devhud.js";
import { createArenaMinimapRenderer } from "./ui/hud.js";
import { LOBBY_LEVEL_ID } from "./levels/schema.js";
import { tickCampaignExitBanners, tickLobbyBannerControllers } from "./game/billboardBanners.js";
import {
  attachVibeJamReturnPortalVfx,
  buildVibeJamExitToHubUrl,
  buildVibeJamReturnToRefUrl,
  getVibeJamRefParam,
  isVibeJamPortalArrival,
} from "./game/vibejam.js";
import * as THREE from "./vendor/three-module.js";

/** HUD pickup fly animation — matches arena pickup silhouette at readable screen size */
const PICKUP_FLIGHT_SRC = Object.freeze({
  nitro_recharge: new URL("../assets/ui/pickup-flight-nitro.svg", import.meta.url).href,
  shield: new URL("../assets/ui/pickup-flight-shield.svg", import.meta.url).href,
});

/**
 * Aim toward the fixed bottom-left HUD panel (#cycle-hud): inward from that corner so the eye tracks “into” the HUD zone.
 * @param {HTMLElement | null} hudPanel
 * @param {HTMLElement | null} fallbackEl — nitro strip or equip wrap if panel unavailable
 */
function getHudPickupFlightCornerTargetPx(hudPanel, fallbackEl) {
  const hr = hudPanel?.getBoundingClientRect();
  const ok =
    hudPanel &&
    !hudPanel.hidden &&
    hr &&
    hr.width > 4 &&
    hr.height > 4 &&
    Number.isFinite(hr.left);
  if (ok && hr) {
    const insetX = Math.min(36, hr.width * 0.14);
    const insetY = Math.min(28, hr.height * 0.18);
    return { tx: hr.left + insetX, ty: hr.bottom - insetY };
  }
  if (!fallbackEl) return null;
  const fr = fallbackEl.getBoundingClientRect();
  return { tx: fr.left + fr.width * 0.5, ty: fr.top + fr.height * 0.45 };
}

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

/** @param {number} sec */
function formatHudMmSs(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 0–1 → smooth 0–1 (enemy kill-cam, etc.) */
function smoothstep01(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Emissive / tunnel bloom during enemy cinematic elimination only (`vizAmbienceSlowPulse`). */
function computeEnemyKillAmbientBurst(devHud, enemyKillState) {
  const out = { floorBump: 0, tunnelBurst: 0 };
  if (!enemyKillState || devHud.vizAmbienceSlowPulse === false) return out;
  const e = enemyKillState.entity;
  if (!e.cinematicDerezActive || !e.derezSnapshot) return out;

  const now = performance.now();
  const approachSec = Math.max(0.12, devHud.enemyKillApproachSec ?? 0.85);
  const implodeSec = Math.max(0.08, devHud.enemyKillImplodeSec ?? 0.72);
  const returnSec = Math.max(0.08, devHud.enemyKillReturnSec ?? 0.6);

  let phase = enemyKillState.phase;
  let t0 = enemyKillState.phaseStartMs;
  if (!enemyKillState.keyframed) {
    phase = "approach";
    t0 = now;
  }

  /** @type {number} */
  let envelope = 0;
  if (phase === "approach") {
    const u = (now - t0) / (approachSec * 1000);
    envelope = smoothstep01(Math.min(1, u)) * 0.42;
  } else if (phase === "implode") {
    const u = Math.min(1, (now - t0) / (implodeSec * 1000));
    const rise = smoothstep01(u);
    envelope = 0.38 + 0.72 * rise;
    envelope += 0.42 * Math.sin(u * Math.PI * 9);
    envelope = Math.min(1.95, Math.max(0, envelope));
  } else if (phase === "return") {
    const u = Math.min(1, (now - t0) / (returnSec * 1000));
    envelope = 0.82 * (1 - smoothstep01(u));
  }

  const rip = 1 + 0.24 * Math.sin(now * 0.048);
  const intensity = envelope * rip;
  out.floorBump = intensity;
  out.tunnelBurst = Math.min(2.45, intensity * 1.18);
  return out;
}

/**
 * Third-person frame for the rival cycle: offset back along player→enemy and slightly to the side (not overhead).
 * @param {import('./vendor/three-module.js').Vector3} outPos
 * @param {import('./vendor/three-module.js').Vector3} outLook
 * @param {number} playerX
 * @param {number} playerZ
 * @param {number} baseY
 * @param {{ x: number; y: number; z: number; heading: number }} snap
 */
function computeEnemyKillCamEndFrame(outPos, outLook, playerX, playerZ, baseY, snap) {
  const ex = snap.x;
  const ey = baseY;
  const ez = snap.z;
  const dx = ex - playerX;
  const dz = ez - playerZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.2) {
    outPos.set(ex, ey + 2.2, ez + 6.5);
    outLook.set(ex, ey + 0.4, ez);
    return;
  }
  const ux = dx / dist;
  const uz = dz / dist;
  const h = 2.2;
  const back = 6.8;
  const side = 1.15;
  const perpX = -uz;
  const perpZ = ux;
  outPos.set(
    ex - ux * back + perpX * side,
    ey + h,
    ez - uz * back + perpZ * side,
  );
  outLook.set(ex, ey + 0.4, ez);
}

async function main() {
  /** Plan X1 — explicit mode for lobby / level / overlays / destinations. */
  let gameMode = GameMode.BOOT;

  const canvas = /** @type {HTMLCanvasElement} */ ($("game-canvas"));
  const bootOverlay = $("boot-overlay");
  const lobbyBanner = $("lobby-placeholder");
  const exitRideHintBanner = $("exit-ride-hint-banner");

  const save = loadOrCreateSave();
  const runtime = createRuntimeFromPlayerSave(save);

  const vjPortalArrival = isVibeJamPortalArrival();
  const vjRefRaw = getVibeJamRefParam();
  const vjReturnFlow = vjPortalArrival && typeof vjRefRaw === "string" && vjRefRaw.length > 0;

  try {
    await preloadLightCycleAsset();
  } catch {
    /* procedural cycle mesh */
  }

  const campaign = await loadCampaignLevels();

  const ymdLocal = getLocalYyyyMmDd();
  const dailyLobbyMeta = await fetchDailyLobbyMeta(ymdLocal);

  /** Consume once here so a crash/close during the boot tunnel cannot strand `tron-session-boot-v1` (would boot the wrong arena on every visit). */
  const sessionBoot = consumeSessionBootTarget();
  const skipArenaForBoot =
    sessionBoot && (sessionBoot.mode === "garage" || sessionBoot.mode === "editor");

  /** P7.1 / P7.2 — lobby + gate locks, or campaign level after arena gate, or skip arena for garage/editor boot. */
  /** @type {Record<string, unknown> | null} */
  let activeCampaignLevel = null;
  /** @type {{ arenaWidth: number; arenaDepth: number } | undefined} */
  let arenaSizeFromCampaign;
  /** P6.9 — current arena JSON came from WIP play-test boot (validated). */
  let arenaFromWipPlaytest = false;
  /** @type {string} */
  let activeDailyYmd = "";

  if (skipArenaForBoot) {
    arenaSizeFromCampaign = undefined;
  } else if (sessionBoot?.mode === "daily" && typeof sessionBoot.ymd === "string") {
    const ymdBoot = String(sessionBoot.ymd).trim();
    const dlev = await fetchLevelByFilename(`daily-${ymdBoot}.json`);
    if (dlev && typeof dlev.id === "string") {
      activeCampaignLevel = dlev;
      activeDailyYmd = String(sessionBoot.ymd).trim();
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
    } else {
      console.warn("[main] Daily boot: missing level — loading lobby.");
      const lobbyOrFallback =
        findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
        selectPlaytestCampaignLevel(campaign.validLevels, save);
      let lobbyLevel = withLobbyRuntimeGateOverrides(lobbyOrFallback, save.progress.currentLevel);
      lobbyLevel = withLobbyArenaGateLock(lobbyLevel, campaign.validLevels, save);
      lobbyLevel = withLobbyDailyGateRuntime(lobbyLevel, {
        ymd: ymdLocal,
        hasMap: dailyLobbyMeta.hasMap,
        clearedToday: isDailyClearedOn(save, ymdLocal),
      });
      activeCampaignLevel = lobbyLevel;
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
    }
  } else if (sessionBoot?.mode === "wip_playtest" && typeof sessionBoot.levelId === "string") {
    const w = getWipLevelValidated(sessionBoot.levelId.trim());
    if (w && w.valid) {
      activeCampaignLevel = /** @type {Record<string, unknown>} */ (
        JSON.parse(JSON.stringify(w.level))
      );
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
      arenaFromWipPlaytest = true;
    } else {
      console.warn("[main] WIP play-test: missing or invalid level — loading lobby.");
      const lobbyOrFallback =
        findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
        selectPlaytestCampaignLevel(campaign.validLevels, save);
      let lobbyLevel = withLobbyRuntimeGateOverrides(lobbyOrFallback, save.progress.currentLevel);
      lobbyLevel = withLobbyArenaGateLock(lobbyLevel, campaign.validLevels, save);
      lobbyLevel = withLobbyDailyGateRuntime(lobbyLevel, {
        ymd: ymdLocal,
        hasMap: dailyLobbyMeta.hasMap,
        clearedToday: isDailyClearedOn(save, ymdLocal),
      });
      activeCampaignLevel = lobbyLevel;
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
    }
  } else if (sessionBoot?.mode === "campaign" && typeof sessionBoot.levelId === "string") {
    const found = findCampaignLevelById(campaign.validLevels, sessionBoot.levelId);
    /** @type {Record<string, unknown> | null | undefined} */
    let useCampaign = found;
    if (
      useCampaign &&
      typeof useCampaign.id === "string" &&
      useCampaign.id !== LOBBY_LEVEL_ID
    ) {
      const idx = parseCampaignLevelIndex(useCampaign);
      if (Number.isFinite(idx) && idx >= 1 && !isLevelUnlockedLinear(save, idx)) {
        console.warn("[main] Campaign boot: arena not unlocked for save — loading lobby.");
        useCampaign = null;
      }
    }
    activeCampaignLevel =
      useCampaign ??
      findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
      selectPlaytestCampaignLevel(campaign.validLevels, save);
    if (activeCampaignLevel && activeCampaignLevel.id === LOBBY_LEVEL_ID) {
      let ll = activeCampaignLevel;
      ll = withLobbyDailyGateRuntime(/** @type {Record<string, unknown>} */ (ll), {
        ymd: ymdLocal,
        hasMap: dailyLobbyMeta.hasMap,
        clearedToday: isDailyClearedOn(save, ymdLocal),
      });
      activeCampaignLevel = ll;
    }
    arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
  } else {
    const canBootTutorial =
      save.tutorialCleared === false &&
      !skipArenaForBoot &&
      (!sessionBoot ||
        (sessionBoot.mode !== "garage" && sessionBoot.mode !== "editor" && sessionBoot.mode !== "wip_playtest"));
    if (canBootTutorial) {
      const tut = await fetchLevelByFilename(TUTORIAL_LEVEL_FILENAME);
      if (tut && tut.id === "level-tutorial") {
        activeCampaignLevel = tut;
        arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
      }
    }
    if (!activeCampaignLevel) {
      const lobbyOrFallback =
        findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
        selectPlaytestCampaignLevel(campaign.validLevels, save);
      let lobbyLevel = withLobbyRuntimeGateOverrides(lobbyOrFallback, save.progress.currentLevel);
      lobbyLevel = withLobbyArenaGateLock(lobbyLevel, campaign.validLevels, save);
      lobbyLevel = withLobbyDailyGateRuntime(lobbyLevel, {
        ymd: ymdLocal,
        hasMap: dailyLobbyMeta.hasMap,
        clearedToday: isDailyClearedOn(save, ymdLocal),
      });
      activeCampaignLevel = lobbyLevel;
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
    }
  }

  /** Odd `level-N` → first gameplay stem, even → second (`config.getGameplayMusicUrl`). Lobby / bad id → NaN. */
  const gameplayMusicCampaignN = (() => {
    if (!activeCampaignLevel || typeof activeCampaignLevel.id !== "string") return Number.NaN;
    if (activeCampaignLevel.id === LOBBY_LEVEL_ID) return Number.NaN;
    if (activeCampaignLevel.id === "level-tutorial") return 2;
    return parseCampaignLevelIndex(/** @type {Record<string, unknown>} */ (activeCampaignLevel));
  })();

  const audio = createAudioEngine({
    masterVolume: save.settings.masterVolume,
    musicVolume: save.settings.musicVolume,
    sfxVolume: save.settings.sfxVolume,
    ambientVolume: save.settings.ambientVolume,
    musicCrossfadeSec: runtime.devHud.musicCrossfadeDuration,
    autoplay: AUDIO_AUTOPLAY,
    musicLobbyUrl: getLobbyMusicUrl(runtime.devHud),
    musicGameplayUrl: getGameplayMusicUrl(runtime.devHud, gameplayMusicCampaignN),
  });
  audio.unlock();
  {
    let previewStingArmed = true;
    const tryPreview = () => {
      if (!previewStingArmed) return;
      previewStingArmed = false;
      window.removeEventListener("pointerdown", tryPreview, true);
      window.removeEventListener("keydown", tryPreview, true);
      if (runtime.devHud.audioPreviewStingEnabled === false) return;
      try {
        audio.playUiPreviewSting();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", tryPreview, { capture: true, passive: true });
    window.addEventListener("keydown", tryPreview, { capture: true, passive: true });
  }
  for (const url of MUSIC_ASSET_URLS.lobbyVariants) {
    void audio.prefetch(url);
  }
  for (const url of MUSIC_ASSET_URLS.gameplayVariants) {
    void audio.prefetch(url);
  }

  /**
   * Engine + enemy proximity bed hold last gains until cleared — stop rev / proximity during derez & tunnels.
   * @param {number} [dt]
   */
  function silenceDrivingAndProximityAudio(dt = 1 / 60) {
    if (typeof audio.silenceDrivingLayers === "function") {
      audio.silenceDrivingLayers(dt);
    } else {
      audio.tickEngineSound({ active: false, dt });
    }
  }

  const graphicsProfile = applyLargeArenaGraphicsOverrides(
    getGraphicsProfile(),
    arenaSizeFromCampaign?.arenaWidth,
    arenaSizeFromCampaign?.arenaDepth,
  );
  const game = createGameRenderer(canvas, { devHud: runtime.devHud, graphicsProfile });

  const devHud = runtime.devHud; // session-only: Advanced tuning is not written to localStorage (refresh restores defaults)

  /** Refreshes Garage coin UI when dev HUD grants coins (bound in `mountGarageDestinationScreen`). */
  let devEconomyUiRefresh = () => {};

  /** No-op: dev HUD (and same-store visual sliders) are session-only; do not merge into `save` or `persistSave`. */
  function persistDevHudToSave() {}

  await playTunnel(game.renderer, undefined, {
    durationSeconds: vjPortalArrival ? 0.08 : CONFIG.tunnelBootSeconds,
    onBegin: () => {
      audio.playTunnelTransitionWind();
    },
    devHud,
  });

  /** Keep `#boot-overlay` up until gameplay/showroom renders — avoids a long black canvas gap after tunnel (arena build blocks `startLoop`). */
  function dismissBootOverlayAfterFirstGamePaint() {
    requestAnimationFrame(() => {
      bootOverlay.classList.add("boot-overlay--hidden");
    });
  }

  if (sessionBoot?.mode === "garage") {
    gameMode = GameMode.GARAGE;
    const hud = document.getElementById("cycle-hud");
    const ban = document.getElementById("lobby-placeholder");
    const mm = document.getElementById("hud-minimap-wrap");
    if (hud) hud.hidden = true;
    if (mm) mm.hidden = true;
    if (ban) ban.hidden = true;
    createDevHudController({
      devHud,
      applyDevHud: (patch) => {
        game.applyDevHud(patch);
      },
      persist: persistDevHudToSave,
      syncHud: () => {},
      isInputBlocked: () => false,
      grantDevCoins: (amount) => {
        addCoins(save, amount);
        persistSave(save);
        devEconomyUiRefresh();
      },
    });
    mountGarageDestinationScreen({
      game,
      save,
      canvas,
      devHud,
      bindDevEconomyRefresh: (fn) => {
        devEconomyUiRefresh = fn;
      },
      onReturnToLobby: () => {
        window.location.reload();
      },
    });
    dismissBootOverlayAfterFirstGamePaint();
    return;
  }
  if (sessionBoot?.mode === "editor") {
    gameMode = GameMode.EDITOR;
    const hud = document.getElementById("cycle-hud");
    const ban = document.getElementById("lobby-placeholder");
    const mm = document.getElementById("hud-minimap-wrap");
    if (hud) hud.hidden = true;
    if (mm) mm.hidden = true;
    if (ban) ban.hidden = true;
    const wipOpen =
      typeof sessionBoot.wipLevelId === "string" ? sessionBoot.wipLevelId : undefined;
    mountEditorDestinationScreen({
      game,
      devHud,
      initialWipLevelId: wipOpen,
      onReturnToLobby: () => {
        window.location.reload();
      },
    });
    dismissBootOverlayAfterFirstGamePaint();
    return;
  }

  if (!activeCampaignLevel) {
    console.error("[main] missing campaign level after boot");
    return;
  }

  {
    const hudEl = document.getElementById("cycle-hud");
    const mmEl = document.getElementById("hud-minimap-wrap");
    const nitroLinesEl = document.getElementById("nitro-speed-lines");
    if (hudEl) hudEl.hidden = false;
    if (mmEl) mmEl.hidden = false;
    if (nitroLinesEl) nitroLinesEl.hidden = false;
  }

  const playCfg = getArenaPlaytestConfig(runtime, save.player.attributes, arenaSizeFromCampaign);
  if (
    activeCampaignLevel &&
    typeof activeCampaignLevel.id === "string" &&
    activeCampaignLevel.id === LOBBY_LEVEL_ID
  ) {
    playCfg.colors.gridFloor = LOBBY_GRID_FLOOR_HEX;
  }
  /** Shallow copy so P3.1 can override `nitroBarCount` per level bonuses without mutating `playCfg`. */
  const playerDriveCfg = { ...playCfg };
  /** Trail Length attribute cap + Trail Extend pickups (P3.3) — segments. */
  let levelTrailExtendBonus = 0;

  function effectivePlayerNitroMax() {
    return playCfg.nitroBarCount;
  }

  applyArenaStageEnvironment(game, playCfg);

  const { world, wallMat, floorMat, playerMat } = createPhysicsWorld();
  buildArenaFromCampaignLevel(game.scene, world, wallMat, floorMat, playCfg, activeCampaignLevel, graphicsProfile);

  const arenaFloorMat = game.scene.userData.arenaFloorMaterial;
  if (arenaFloorMat) applyArenaFloorEnvMap(game.renderer, arenaFloorMat, playCfg, game.scene);

  const arenaAmbience = createArenaAmbience({
    scene: game.scene,
    playCfg,
    devHud,
    graphicsProfile,
    level: activeCampaignLevel,
    // Optional after boot-load: floatingSpriteTextures / wallBannerTextures (textures not disposed by ambience).
  });

  const gameplayParticles = createGameplayParticles({ scene: game.scene, devHud });
  const enemyKillRipple = createEnemyKillRipple({ scene: game.scene, playCfg });

  const wallGates =
    activeCampaignLevel && Array.isArray(activeCampaignLevel.wallObjects)
      ? extractGatesFromWallObjects(activeCampaignLevel.wallObjects)
      : [];
  const entranceSpawn = computePlayerSpawnFromEntranceGate(
    wallGates,
    playCfg.arenaWidth,
    playCfg.arenaDepth,
  );
  const spawnX = entranceSpawn ? entranceSpawn.x : 0;
  const spawnZ = entranceSpawn ? entranceSpawn.z : 0;
  const spawnHeading = entranceSpawn ? entranceSpawn.heading : 0;

  const enemyRoster = createCampaignEnemyEntities({
    scene: game.scene,
    world,
    playerMat,
    runtime,
    devHud,
    campaignLevel: activeCampaignLevel,
    arenaSize: arenaSizeFromCampaign,
    enemyFaceTarget: { x: spawnX, z: spawnZ },
  });

  const isLobby =
    activeCampaignLevel && typeof activeCampaignLevel.id === "string"
      ? activeCampaignLevel.id === LOBBY_LEVEL_ID
      : false;

  const isTutorialArena =
    activeCampaignLevel &&
    typeof activeCampaignLevel.id === "string" &&
    activeCampaignLevel.id === "level-tutorial";

  /** P6.9 — editor play-test: normal level rules, backtick returns to Architect. */
  const isEditorPlaytest = arenaFromWipPlaytest;

  const waypointBeacon = !isEditorPlaytest ? createWaypointBeacon({ scene: game.scene, devHud }) : null;
  /** Beacon anchor nearer gate lip than generic inward hints (`getGateInwardPoint` default 10). Lobby + tutorial exit. */
  const waypointBeaconGateInwardUnits = 6;

  function showExitRideHintBanner() {
    if (!exitRideHintBanner || isLobby) return;
    exitRideHintBanner.hidden = false;
    exitRideHintBanner.setAttribute("aria-hidden", "false");
    exitRideHintBanner.classList.remove("state-banner--hidden");
  }

  function hideExitRideHintBanner() {
    if (!exitRideHintBanner) return;
    exitRideHintBanner.hidden = true;
    exitRideHintBanner.setAttribute("aria-hidden", "true");
    exitRideHintBanner.classList.add("state-banner--hidden");
  }

  gameMode = isLobby ? GameMode.LOBBY : GameMode.LEVEL;

  if (isLobby && vjReturnFlow) {
    const tr = game.scene.getObjectByName("tron-gates");
    if (tr) {
      for (const ch of tr.children) {
        if (ch instanceof THREE.Group && ch.userData && ch.userData.gateRole === "vibejam") {
          attachVibeJamReturnPortalVfx(/** @type {THREE.Group} */ (ch));
          break;
        }
      }
    }
  }

  try {
    await audio.playMusicProfile(isLobby || isTutorialArena ? "lobby" : "gameplay");
    audio.startAmbientBed();
  } catch {
    /* ignore */
  }

  const rawEnemyCount =
    activeCampaignLevel && Array.isArray(activeCampaignLevel.enemies)
      ? activeCampaignLevel.enemies.length
      : 0;

  /** P5.7 — exit opens when all enemies are gone; zero-enemy arenas start with exit open (no overlay). */
  let exitGateUnlocked = false;
  if (!isLobby && rawEnemyCount === 0) {
    if (runtimeUnlockCampaignExitGate(game.scene, world, playCfg, wallMat)) {
      exitGateUnlocked = true;
      const gr = game.scene.userData.gates;
      const anim = game.scene.userData.gateAnimatables;
      if (gr?.root && Array.isArray(anim)) {
        applyExitGateRuntimeOpenVisual(gr.root, playCfg, anim);
      }
      showExitRideHintBanner();
    }
  }

  /** Tutorial: switch from lobby bed → gameplay once tips strip clears + throttle engaged (`main.js`). */
  let tutorialGameplayMusicPending = isTutorialArena;

  /** Plan X3: campaign arenas stay frozen until first W; lobby allows immediate riding. */
  let levelStarted = isLobby;
  /** @type {number} */
  let levelStartMonotonicMs = 0;
  /** P7.6 — wall-clock ms spent paused after level timer started (excluded from HUD + time bonus). */
  let levelTimerPausedAccumMs = 0;
  /** P7.6 — monotonic ms when current pause began (for timer adjustment). */
  let levelPauseWallClockStartMs = 0;

  /**
   * P7.6 — elapsed level seconds excluding pause intervals (HUD + exit time bonus).
   * @returns {number}
   */
  function getLevelElapsedSecExcludingPauses() {
    if (!levelStarted || levelStartMonotonicMs <= 0) return 0;
    let pauseExtra = levelTimerPausedAccumMs;
    if (levelPauseWallClockStartMs > 0) {
      pauseExtra += performance.now() - levelPauseWallClockStartMs;
    }
    return Math.max(0, (performance.now() - levelStartMonotonicMs - pauseExtra) / 1000);
  }

  /** NEON the player would earn on exit (base + time bonus if still under threshold). */
  function getPendingLevelCoinAward(elapsedSec) {
    if (!activeCampaignLevel || !activeCampaignLevel.rewards || typeof activeCampaignLevel.rewards !== "object") {
      return 0;
    }
    const rewards = /** @type {Record<string, unknown>} */ (activeCampaignLevel.rewards);
    const base = typeof rewards.coins === "number" ? rewards.coins : 0;
    const th = rewards.timeBonusThreshold;
    const tb = rewards.timeBonusCoins;
    let add = base;
    if (typeof th === "number" && typeof tb === "number" && levelStarted && levelStartMonotonicMs > 0) {
      if (elapsedSec <= th) add += tb;
    }
    return add;
  }

  const playerBody = createPlayerBody(playCfg, playerMat);
  playerBody.position.set(spawnX, playCfg.playerSpawnY, spawnZ);
  playerBody.velocity.set(0, 0, 0);
  playerBody.userData.heading = spawnHeading;
  playerBody.userData.speed = 0;
  playerBody.allowSleep = false;
  playerBody.userData.shieldPhase = "none";
  playerBody.userData.shieldDeployRemain = 0;
  playerBody.userData.shieldActiveRemain = 0;
  playerBody.userData.shieldActive = false;
  playerBody.userData.equipSlotQueued = undefined;
  world.addBody(playerBody);

  const playerCycle = createLightCycle({ devHud, color: save.player.cycleColor ?? "#00FFFF" });
  playerCycle.root.position.set(spawnX, playCfg.playerSpawnY, spawnZ);
  playerCycle.root.rotation.y = spawnHeading;
  game.scene.add(playerCycle.root);

  const trailWall = createTrailWallSystem({
    color: save.player.cycleColor ?? "#00FFFF",
    devHud,
    world: playCfg.world,
    maxSegments: playCfg.trailMaxSegments,
    arenaWidth: playCfg.arenaWidth,
    arenaDepth: playCfg.arenaDepth,
    ownerId: "player",
  });
  game.scene.add(trailWall.root);

  /** P7.2 — lobby functional gates: rising-edge ride-through → tunnel → {@link setSessionBootTarget} + reload. */
  let lobbyGateWasInside = false;
  /** Vibe Jam webring redirect in flight (avoid re-trigger). */
  let vibejamNavLock = false;

  function clearTrailAndEquipForTunnel() {
    trailWall.clear();
    const u = playerBody.userData;
    u.equipSlot = undefined;
    u.equipSlotQueued = undefined;
  }

  /** Hide fixed HUD / lobby banner for any `playTunnel` from the arena loop. */
  function hideLobbyTransitionChrome() {
    const hud = document.getElementById("cycle-hud");
    const mm = document.getElementById("hud-minimap-wrap");
    const nitroEl = document.getElementById("nitro-speed-lines");
    const pickupFb = document.getElementById("pickup-feedback");
    if (hud) hud.hidden = true;
    if (mm) mm.hidden = true;
    if (nitroEl) nitroEl.hidden = true;
    if (pickupFb) pickupFb.hidden = true;
    if (lobbyBanner) {
      lobbyBanner.hidden = true;
      lobbyBanner.classList.add("state-banner--hidden");
    }
    hideExitRideHintBanner();
  }

  /**
   * @param {Record<string, unknown>} nextBoot
   */
  function beginLobbyGateTunnel(nextBoot) {
    silenceDrivingAndProximityAudio();
    audio.playGateEnterHum();
    if (nextBoot.mode === "garage") {
      setFlagSeenGarage(save);
      persistSave(save);
    }
    setEditorPlaytestReturn(null);
    setSessionBootTarget(nextBoot);
    hideLobbyTransitionChrome();
    game.stopLoop();
    playTunnel(
      game.renderer,
      () => {
        window.location.reload();
      },
      {
        durationSeconds: CONFIG.tunnelGateSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          clearTrailAndEquipForTunnel();
        },
        devHud,
      },
    ).catch(() => {
      window.location.reload();
    });
  }

  /** Vibe Jam hub exit: same as a lobby gate except tunnel uses `CONFIG.tunnelVibeJamSeconds` (2.8s), then `location.assign`. */
  function beginVibeJamRedirect(href) {
    silenceDrivingAndProximityAudio();
    audio.playGateEnterHum();
    hideLobbyTransitionChrome();
    bootOverlay.classList.remove("boot-overlay--hidden");
    game.stopLoop();
    playTunnel(
      game.renderer,
      () => {
        window.location.assign(href);
      },
      {
        durationSeconds: CONFIG.tunnelVibeJamSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          clearTrailAndEquipForTunnel();
        },
        devHud,
      },
    ).catch(() => {
      window.location.assign(href);
    });
  }

  let editorShortcutTunnelStarted = false;
  /** Map editor (/): requires ~3 s hold — cleared on release before that. */
  let editorSlashHoldTimerId = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const EDITOR_SHORTCUT_HOLD_MS = 3000;

  function clearEditorSlashHoldTimer() {
    if (editorSlashHoldTimerId != null) {
      clearTimeout(editorSlashHoldTimerId);
      editorSlashHoldTimerId = null;
    }
  }

  function tryEditorShortcutAfterSlashHold() {
    if (editorShortcutTunnelStarted) return;
    if (isTunnelBlockingInput()) return;
    if (isControlsOverlayBlockingInput()) return;
    if (isPauseOverlayBlockingInput()) return;
    if (isLevelExitDestinationOverlayBlockingInput()) return;
    if (playerDerezPhase !== "alive") return;
    if (
      gameMode !== GameMode.LOBBY &&
      gameMode !== GameMode.LEVEL &&
      gameMode !== GameMode.LEVEL_COMPLETE
    ) {
      return;
    }
    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    ) {
      return;
    }
    beginEditorShortcutTunnel();
  }

  function beginEditorShortcutTunnel() {
    if (editorShortcutTunnelStarted) return;
    editorShortcutTunnelStarted = true;
    silenceDrivingAndProximityAudio();
    audio.playGateEnterHum();
    setEditorPlaytestReturn(null);
    setSessionBootTarget({ mode: "editor" });
    hideLobbyTransitionChrome();
    game.stopLoop();
    playTunnel(
      game.renderer,
      () => {
        window.location.reload();
      },
      {
        durationSeconds: CONFIG.tunnelGateSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          clearTrailAndEquipForTunnel();
        },
        devHud,
      },
    ).catch(() => {
      window.location.reload();
    });
  }

  const { state: arenaKeys } = createTronCycleKeyState();
  /** @type {boolean} */
  let prevEquipE = false;

  /**
   * P3.4 — queued shield pickup applies when current deploy/active shield ends.
   */
  function promoteShieldQueue() {
    const u = playerBody.userData;
    if (u.equipSlotQueued === "shield") {
      u.equipSlot = "shield";
      u.equipSlotQueued = undefined;
    }
  }

  function assignPlayerShieldPickup() {
    const u = playerBody.userData;
    if (u.shieldPhase === "deploying" || u.shieldPhase === "active") {
      u.equipSlotQueued = "shield";
      return;
    }
    u.equipSlot = "shield";
  }

  function syncPlayerShieldActiveFromPhase() {
    const u = playerBody.userData;
    u.shieldActive = u.shieldPhase === "active";
  }

  /**
   * E to deploy equippable shield; deploy timer → active timer (devHud `shieldDeployTime` / `shieldDuration`).
   * @param {number} dt
   */
  function tickPlayerShieldFsm(dt) {
    if (dt <= 0) return;
    const u = playerBody.userData;
    const deployT = typeof devHud.shieldDeployTime === "number" ? devHud.shieldDeployTime : 0.15;
    const durT = typeof devHud.shieldDuration === "number" ? devHud.shieldDuration : 5;

    if (u.shieldPhase === "deploying") {
      u.shieldDeployRemain -= dt;
      if (u.shieldDeployRemain <= 0) {
        u.shieldPhase = "active";
        u.shieldActiveRemain = durT;
        audio.playShieldDeployRise();
      }
    } else if (u.shieldPhase === "active") {
      u.shieldActiveRemain -= dt;
      if (u.shieldActiveRemain <= 0) {
        u.shieldPhase = "none";
        audio.playShieldExpireFade();
        promoteShieldQueue();
      }
    }

    const eEdge = !!arenaKeys.e && !prevEquipE;
    prevEquipE = !!arenaKeys.e;
    if (eEdge && (isLobby || levelStarted) && u.shieldPhase === "none" && u.equipSlot === "shield") {
      u.equipSlot = undefined;
      u.shieldPhase = "deploying";
      u.shieldDeployRemain = Math.max(0.02, deployT);
    }
  }

  const chase = createChaseCamera(game.camera, devHud, {
    arenaClamp: {
      halfW: playCfg.arenaWidth * 0.5,
      halfD: playCfg.arenaDepth * 0.5,
      margin: 3,
    },
  });
  chase.spawnAt(playerCycle.root.position, spawnHeading);
  const portalWarpSnapPos = new THREE.Vector3();

  let nitroVis = 0;
  const nitroState = createNitroState(effectivePlayerNitroMax());

  const boostPadField = createBoostPadField({
    scene: game.scene,
    gameObjects: activeCampaignLevel && Array.isArray(activeCampaignLevel.gameObjects) ? activeCampaignLevel.gameObjects : [],
    devHud,
  });

  const portalField = createPortalField({
    scene: game.scene,
    world,
    wallMat,
    gameObjects: activeCampaignLevel && Array.isArray(activeCampaignLevel.gameObjects) ? activeCampaignLevel.gameObjects : [],
    playCfg,
    devHud,
    portalVisualDetail: graphicsProfile.portalVisualDetail,
    onPortalWarp: (from, to) => {
      gameplayParticles.spawnPortalWarp(from, to);
    },
    onPlayerWarp: () => {
      syncCyclePhysicsYaw(playerBody);
      const h = playerBody.userData.heading ?? 0;
      playerCycle.root.position.set(
        playerBody.position.x,
        playerBody.position.y,
        playerBody.position.z,
      );
      playerCycle.root.rotation.y = h;
      portalWarpSnapPos.set(
        playerBody.position.x,
        playerBody.position.y,
        playerBody.position.z,
      );
      chase.spawnAt(portalWarpSnapPos, h);
    },
  });

  const minimapEl = document.getElementById("hud-minimap");
  const minimapRenderer = createArenaMinimapRenderer(
    minimapEl instanceof HTMLCanvasElement ? minimapEl : null,
    { internalScale: graphicsProfile.minimapResolutionScale },
  );
  let lastMinimapDrawMs = 0;

  const speedLineEl = document.getElementById("nitro-speed-lines");
  const hudSpeedEl = document.getElementById("hud-speed");
  const hudTrailEl = document.getElementById("hud-trail");
  const hudNitroEl = document.getElementById("hud-nitro");
  const hudTimerWrap = document.getElementById("hud-timer-wrap");
  const hudTimerEl = document.getElementById("hud-timer");
  const hudEquipIcon = document.getElementById("hud-equip-icon");
  const hudEquipE = document.getElementById("hud-equip-e");
  const hudEquipWrap = document.getElementById("hud-equip-wrap");
  const pickupFeedback = createPickupFeedback(document.getElementById("pickup-feedback"));

  const hudPickupFlightProj = new THREE.Vector3();
  /** @type {{ sx: number; sy: number; tx: number; ty: number; t0: number; durTravel: number; durVanish: number; el: HTMLElement }[]} */
  const hudPickupFlights = [];

  function beginHudPickupFlight(kind, wx, wy, wz) {
    if (!game?.renderer?.domElement || !game?.camera) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    hudPickupFlightProj.set(wx, wy, wz);
    hudPickupFlightProj.project(game.camera);
    if (Math.abs(hudPickupFlightProj.z) > 1.001) return;
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const sx = (hudPickupFlightProj.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-hudPickupFlightProj.y * 0.5 + 0.5) * rect.height + rect.top;

    const fallbackEl =
      kind === "nitro_recharge"
        ? hudNitroEl
        : kind === "shield"
          ? hudEquipWrap || hudEquipIcon
          : null;
    const hudPanel = document.getElementById("cycle-hud");
    const corner = getHudPickupFlightCornerTargetPx(hudPanel, fallbackEl);
    if (!corner) return;
    const { tx, ty } = corner;

    const src =
      kind === "nitro_recharge"
        ? PICKUP_FLIGHT_SRC.nitro_recharge
        : kind === "shield"
          ? PICKUP_FLIGHT_SRC.shield
          : "";
    if (!src) return;

    const el = document.createElement("div");
    el.className = "pickup-hud-flight";
    el.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    el.appendChild(img);
    document.body.appendChild(el);

    /* Travel pulls gaze toward HUD corner; short vanish phase reads as merging into HUD (world burst unchanged). */
    const durTravel = 440;
    const durVanish = 180;
    hudPickupFlights.push({
      sx,
      sy,
      tx,
      ty,
      t0: performance.now(),
      durTravel,
      durVanish,
      el,
    });
  }

  function tickHudPickupFlights() {
    const now = performance.now();
    for (let i = hudPickupFlights.length - 1; i >= 0; i -= 1) {
      const f = hudPickupFlights[i];
      const elapsed = now - f.t0;
      const dur = f.durTravel + f.durVanish;
      if (elapsed >= dur) {
        f.el.remove();
        hudPickupFlights.splice(i, 1);
        continue;
      }
      let x;
      let y;
      let sc;
      let op;
      const travelScaleEnd = 0.88;
      if (elapsed < f.durTravel) {
        const u = elapsed / f.durTravel;
        const e = 1 - (1 - u) ** 3;
        x = f.sx + (f.tx - f.sx) * e;
        y = f.sy + (f.ty - f.sy) * e;
        sc = 1 - u * (1 - travelScaleEnd);
        op = 1;
      } else {
        x = f.tx;
        y = f.ty;
        const u = (elapsed - f.durTravel) / f.durVanish;
        const q = u * u;
        sc = Math.max(0.06, travelScaleEnd * (1 - q));
        op = 1 - q;
      }
      f.el.style.left = `${x}px`;
      f.el.style.top = `${y}px`;
      f.el.style.transform = `translate(-50%, -50%) scale(${sc})`;
      f.el.style.opacity = String(op);
    }
  }

  const powerupField = createCampaignPowerupField({
    scene: game.scene,
    powerups: activeCampaignLevel && Array.isArray(activeCampaignLevel.powerups) ? activeCampaignLevel.powerups : [],
    devHud,
    spawnPickupBurst: gameplayParticles.spawnPickupBurst,
    pickupVisualDetail: graphicsProfile.pickupVisualDetail,
    /* Lobby + arenas: draws attention toward HUD when collecting nitro/shield (world burst unchanged). */
    onPickupHudFlight: !isEditorPlaytest
      ? (payload) => {
          beginHudPickupFlight(payload.type, payload.x, payload.y, payload.z);
        }
      : undefined,
  });

  {
    const envTex = game.scene.userData.arenaEnvMapTexture;
    if (envTex) {
      applyArenaEnvMapToSubtree(playerCycle.root, envTex);
      applyArenaEnvMapToSubtree(trailWall.root, envTex);
      for (const e of enemyRoster.list) {
        if (e.eliminated) continue;
        applyArenaEnvMapToSubtree(e.cycle.root, envTex);
        applyArenaEnvMapToSubtree(e.trail.root, envTex);
      }
      applyArenaEnvMapToSubtree(boostPadField.root, envTex);
      applyArenaEnvMapToSubtree(portalField.root, envTex);
      applyArenaEnvMapToSubtree(powerupField.root, envTex);
      const gatesRoot = game.scene.userData.gates?.root;
      if (gatesRoot) applyArenaEnvMapToSubtree(gatesRoot, envTex);
    }
  }

  const derezOverlay = document.getElementById("derez-overlay");
  /** @type {'alive' | 'imploding' | 'tunnel'} */
  let playerDerezPhase = "alive";
  /** Monotonic ms when player derez implosion began (wall clock). */
  let playerDerezT0Ms = 0;
  /** P2.5 — throttle near-miss SFX (same `nearMissDistance` band). */
  let lastNearMissMs = 0;
  /** P8.5 — throttle wall-hit SFX while sliding along perimeter / barriers. */
  let lastWallHitSfxMs = 0;
  const enemyKillApproachFrom = new THREE.Vector3();
  const enemyKillTo = new THREE.Vector3();
  const enemyKillLFrom = new THREE.Vector3();
  const enemyKillLTo = new THREE.Vector3();
  const enemyKillRetFrom = new THREE.Vector3();
  const enemyKillRetTo = new THREE.Vector3();
  const enemyKillRetLook = new THREE.Vector3();
  const enemyKillCamLerp = new THREE.Vector3();
  const enemyKillLookLerp = new THREE.Vector3();
  /**
   * Opponent kill-cam (separate from player derez): approach → implode+SFX → return; sim frozen.
   * @type {null | {
   *   entity: import('./game/enemies.js').CampaignEnemyEntity;
   *   phase: 'approach' | 'implode' | 'return';
   *   keyframed: boolean;
   *   phaseStartMs: number;
   *   implodeSfxDone: boolean;
   *   returnFov0: number;
   *   returnFov1: number;
   * }}
   */
  let enemyDerezState = null;

  function beginPlayerDerezSequence() {
    if (playerDerezPhase !== "alive") return;
    hideExitRideHintBanner();
    gameplayParticles.spawnDerezBurst(
      playerBody.position.x,
      playCfg.playerSpawnY,
      playerBody.position.z,
      save.player.cycleColor ?? "#00FFFF",
    );
    gameplayParticles.spawnDerezCubeShards(
      playerBody.position.x,
      playCfg.playerSpawnY,
      playerBody.position.z,
      save.player.cycleColor ?? "#00FFFF",
      { count: 44, duration: 1.05 },
    );
    gameMode = GameMode.PLAYER_DEREZ;
    playerDerezPhase = "imploding";
    playerDerezT0Ms = performance.now();
    playerBody.userData.tronEliminated = true;
    playerBody.userData.shieldPhase = "none";
    playerBody.userData.shieldDeployRemain = 0;
    playerBody.userData.shieldActiveRemain = 0;
    playerBody.userData.shieldActive = false;
    playerBody.userData.equipSlot = undefined;
    playerBody.userData.equipSlotQueued = undefined;
    playerBody.velocity.set(0, 0, 0);
    trailWall.clear();
    playerCycle.update(1 / 60, {
      speed: 0,
      steer: 0,
      accelerating: false,
      braking: false,
      nitroBurstStrength: 0,
      shieldBubbleMode: "off",
    });
    silenceDrivingAndProximityAudio(1 / 60);
    audio.playDerezShatter();
    if (derezOverlay) derezOverlay.hidden = false;
  }

  function startDerezTunnelToLobby() {
    if (playerDerezPhase !== "imploding") return;
    playerDerezPhase = "tunnel";
    silenceDrivingAndProximityAudio(1 / 60);
    game.postPipeline.setDerezPostFx({ glitch: 0, flash: 0 });
    game.stopLoop();
    playTunnel(game.renderer, () => {
      window.location.reload();
    }, {
      durationSeconds: CONFIG.tunnelGateSeconds,
      onBegin: () => {
        audio.playTunnelTransitionWind();
      },
      devHud,
    }).catch(() => {
      window.location.reload();
    });
  }

  const levelCompleteOverlay = document.getElementById("level-complete-overlay");
  /** @type {number} */
  let combatVictoryOverlayTimeoutId = 0;
  /** Wall-clock time when auto-dismiss should fire (P7.6 — defer with pause). */
  let combatVictoryOverlayDismissAtMs = 0;
  /** Remaining auto-dismiss ms deferred while pause cleared the timeout. */
  let combatVictoryOverlayDeferRemainingMs = 0;
  /** @type {boolean} */
  let winTunnelStarted = false;

  /** @type {ReturnType<typeof createLevelExitDestinationOverlayController> | null} */
  let levelExitDestinationMenu = null;

  function dismissCombatVictoryOverlay() {
    if (levelCompleteOverlay) levelCompleteOverlay.hidden = true;
    combatVictoryOverlayTimeoutId = 0;
    combatVictoryOverlayDeferRemainingMs = 0;
    if (
      playerDerezPhase === "alive" &&
      !winTunnelStarted &&
      !isLobby &&
      gameMode === GameMode.LEVEL_COMPLETE
    ) {
      gameMode = GameMode.LEVEL;
    }
  }

  function showCombatVictoryOverlay() {
    if (!levelCompleteOverlay) return;
    gameMode = GameMode.LEVEL_COMPLETE;
    const rewards =
      activeCampaignLevel && activeCampaignLevel.rewards && typeof activeCampaignLevel.rewards === "object"
        ? /** @type {Record<string, unknown>} */ (activeCampaignLevel.rewards)
        : null;
    const base = rewards && typeof rewards.coins === "number" ? rewards.coins : 0;
    const th = rewards && typeof rewards.timeBonusThreshold === "number" ? rewards.timeBonusThreshold : 0;
    const tb = rewards && typeof rewards.timeBonusCoins === "number" ? rewards.timeBonusCoins : 0;
    const baseEl = levelCompleteOverlay.querySelector("[data-coin-base]");
    const bonusEl = levelCompleteOverlay.querySelector("[data-coin-bonus-hint]");
    if (baseEl) baseEl.textContent = String(base);
    if (bonusEl) {
      bonusEl.textContent =
        th > 0 && tb > 0 ? `Exit within ${th}s for +${tb} NEON (timer).` : "";
    }
    audio.playLevelCompleteChord();
    levelCompleteOverlay.hidden = false;
    if (combatVictoryOverlayTimeoutId) window.clearTimeout(combatVictoryOverlayTimeoutId);
    const sec = typeof devHud.coinOverlayDuration === "number" ? devHud.coinOverlayDuration : 3;
    const durMs = Math.max(0.5, sec) * 1000;
    combatVictoryOverlayDismissAtMs = performance.now() + durMs;
    combatVictoryOverlayDeferRemainingMs = 0;
    combatVictoryOverlayTimeoutId = window.setTimeout(() => {
      dismissCombatVictoryOverlay();
    }, durMs);
    showExitRideHintBanner();
  }

  function clearCombatVictoryTimersForExit() {
    if (combatVictoryOverlayTimeoutId) {
      window.clearTimeout(combatVictoryOverlayTimeoutId);
      combatVictoryOverlayTimeoutId = 0;
    }
    combatVictoryOverlayDeferRemainingMs = 0;
    dismissCombatVictoryOverlay();
  }

  /** @param {Record<string, unknown> | null | undefined} sessionBootPayload — `null`: default boot (lobby path). */
  function postExitGateTunnelReload(sessionBootPayload) {
    levelExitDestinationMenu?.close();
    hideLobbyTransitionChrome();
    setSessionBootTarget(sessionBootPayload);
    playTunnel(
      game.renderer,
      () => {
        window.location.reload();
      },
      {
        durationSeconds: CONFIG.tunnelGateSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          trailWall.clear();
          const u = playerBody.userData;
          u.equipSlot = undefined;
          u.equipSlotQueued = undefined;
        },
        devHud,
      },
    ).catch(() => {
      window.location.reload();
    });
  }

  /** @param {unknown} lvl */
  function campaignLevelDisplayTitle(lvl) {
    if (!lvl || typeof lvl !== "object") return "";
    const r = /** @type {Record<string, unknown>} */ (lvl);
    const n = r.name;
    const nm = typeof n === "string" && n.trim() ? n.trim() : "";
    if (nm) return nm;
    const ix = parseCampaignLevelIndex(r);
    return Number.isFinite(ix) ? `Arena ${Math.floor(ix)}` : "";
  }

  function beginWinTunnelToLobby() {
    if (winTunnelStarted || playerDerezPhase !== "alive") return;
    silenceDrivingAndProximityAudio(1 / 60);
    audio.playGateEnterHum();
    clearCombatVictoryTimersForExit();
    hideExitRideHintBanner();
    winTunnelStarted = true;
    game.stopLoop();

    if (isEditorPlaytest) {
      postExitGateTunnelReload(null);
      return;
    }

    const idStr =
      activeCampaignLevel && typeof activeCampaignLevel.id === "string" ? activeCampaignLevel.id.trim() : "";

    if (idStr.startsWith("daily-")) {
      const ymd = idStr.length > 6 ? idStr.slice(6) : activeDailyYmd;
      const rewards =
        activeCampaignLevel && activeCampaignLevel.rewards && typeof activeCampaignLevel.rewards === "object"
          ? /** @type {Record<string, unknown>} */ (activeCampaignLevel.rewards)
          : null;
      const baseCoins =
        rewards && typeof rewards.coins === "number" ? Math.max(0, Math.floor(rewards.coins)) : 0;
      let add = baseCoins;
      const th = rewards && typeof rewards.timeBonusThreshold === "number" ? rewards.timeBonusThreshold : null;
      const tb = rewards && typeof rewards.timeBonusCoins === "number" ? rewards.timeBonusCoins : null;
      if (typeof th === "number" && typeof tb === "number" && levelStarted && levelStartMonotonicMs > 0) {
        const elapsed = getLevelElapsedSecExcludingPauses();
        if (elapsed <= th) add += tb;
      }
      if (ymd) recordDailyCleared(save, ymd, add);
      else if (add > 0) addCoins(save, add);
      persistSave(save);
      if (add > 0) audio.playCoinRewardTinkle();
      postExitGateTunnelReload(null);
      return;
    }

    const coinsBeforeWin = save.progress.coins;

    if (idStr === "level-tutorial") {
      setTutorialCleared(save, true);
      persistSave(save);
    } else {
      const levelIdx = activeCampaignLevel ? parseCampaignLevelIndex(activeCampaignLevel) : Number.NaN;
      const rewards =
        activeCampaignLevel && activeCampaignLevel.rewards && typeof activeCampaignLevel.rewards === "object"
          ? /** @type {Record<string, unknown>} */ (activeCampaignLevel.rewards)
          : null;
      if (
        Number.isFinite(levelIdx) &&
        levelIdx >= 1 &&
        rewards &&
        typeof rewards.coins === "number" &&
        !save.progress.completedLevels.includes(levelIdx)
      ) {
        let add = rewards.coins;
        const th = rewards.timeBonusThreshold;
        const tb = rewards.timeBonusCoins;
        if (
          typeof th === "number" &&
          typeof tb === "number" &&
          levelStarted &&
          levelStartMonotonicMs > 0
        ) {
          const elapsed = getLevelElapsedSecExcludingPauses();
          if (elapsed <= th) add += tb;
        }
        addCoins(save, add);
        recordLevelComplete(save, levelIdx);
        persistSave(save);
        audio.playCoinRewardTinkle();
      }
    }

    const curIdx =
      activeCampaignLevel && typeof activeCampaignLevel === "object"
        ? parseCampaignLevelIndex(activeCampaignLevel)
        : Number.NaN;
    /** Tutorial / hub / non-`level-N` maps reload straight to lobby; only numbered campaign arenas get the picker. */
    const chooserEligible = Number.isFinite(curIdx) && curIdx >= 1;

    if (!chooserEligible || !levelExitDestinationMenu) {
      postExitGateTunnelReload(null);
      return;
    }

    /** @type {number | null} */
    let nextIdx = null;
    if (idStr === "level-tutorial") {
      nextIdx = 1;
    } else if (Number.isFinite(curIdx) && curIdx >= 1) {
      nextIdx = Math.floor(curIdx) + 1;
    }

    let nextLevelId = null;
    let nextTitle = "";
    if (typeof nextIdx === "number" && Number.isFinite(nextIdx) && nextIdx >= 1) {
      const nl = findCampaignLevelByCampaignIndex(campaign.validLevels, nextIdx);
      if (nl && typeof nl.id === "string" && isLevelUnlockedLinear(save, nextIdx)) {
        nextLevelId = nl.id;
        nextTitle = campaignLevelDisplayTitle(nl);
      }
    }

    const earnedThisExit = Math.max(0, Math.floor(save.progress.coins - coinsBeforeWin));
    const totalCoinsNow = Math.max(0, Math.floor(save.progress.coins));

    levelExitDestinationMenu.open({
      title: "LEVEL CLEAR",
      nextLevelId,
      nextLevelDisplayName: nextTitle,
      earnedCoins: earnedThisExit,
      totalCoins: totalCoinsNow,
    });
  }

  /** @type {import("./gameState.js").GameModeValue} */
  let modeBeforePause = GameMode.LOBBY;

  /** @type {ReturnType<typeof createPauseMenuController> | null} */
  let pauseMenu = null;

  const pauseOverlayEl = document.getElementById("pause-overlay");

  function syncPauseSettingsUiFromSave() {
    if (!pauseOverlayEl) return;
    const m = pauseOverlayEl.querySelector('[data-pause-set="masterVolume"]');
    const mu = pauseOverlayEl.querySelector('[data-pause-set="musicVolume"]');
    const sx = pauseOverlayEl.querySelector('[data-pause-set="sfxVolume"]');
    const am = pauseOverlayEl.querySelector('[data-pause-set="ambientVolume"]');
    const crt = pauseOverlayEl.querySelector('[data-pause-set="crtScanlines"]');
    const bl = pauseOverlayEl.querySelector('[data-pause-set="bloomIntensity"]');
    const vp = pauseOverlayEl.querySelector('[data-pause-set="visualPreset"]');
    if (m instanceof HTMLInputElement) m.value = String(save.settings.masterVolume);
    if (mu instanceof HTMLInputElement) mu.value = String(save.settings.musicVolume);
    if (sx instanceof HTMLInputElement) sx.value = String(save.settings.sfxVolume);
    if (am instanceof HTMLInputElement) am.value = String(save.settings.ambientVolume);
    if (crt instanceof HTMLInputElement) crt.checked = !!devHud.crtScanlines;
    if (vp instanceof HTMLSelectElement) {
      const p = save.settings.visualPreset === "retro" ? "retro" : "clean";
      vp.value = p;
    }
    if (bl instanceof HTMLInputElement) {
      bl.value = String(
        typeof devHud.bloomIntensity === "number" && Number.isFinite(devHud.bloomIntensity)
          ? devHud.bloomIntensity
          : 1.5,
      );
    }
  }

  /**
   * P7.6 — volume sliders persist; bloom / CRT (dev HUD) are session-only like Advanced tuning.
   * @param {Event} e
   */
  function onPauseSettingsInput(e) {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const key = t.getAttribute("data-pause-set");
    if (!key) return;

    if (key === "crtScanlines") {
      const on = t.checked;
      devHud.crtScanlines = on;
      game.applyDevHud({ crtScanlines: on });
      return;
    }

    if (key === "visualPreset") {
      if (!(t instanceof HTMLSelectElement)) return;
      const p = t.value === "retro" ? "retro" : "clean";
      patchSettings(save, { visualPreset: p });
      persistSave(save);
      const patch = visualPresetDevHudPatch(p);
      Object.assign(devHud, patch);
      game.applyDevHud(patch);
      return;
    }

    if (key === "bloomIntensity") {
      const v = Number.parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      devHud.bloomIntensity = v;
      game.applyDevHud({ bloomIntensity: v });
      return;
    }

    const v = Number.parseFloat(t.value);
    if (!Number.isFinite(v)) return;
    if (key === "masterVolume") save.settings.masterVolume = v;
    else if (key === "musicVolume") save.settings.musicVolume = v;
    else if (key === "sfxVolume") save.settings.sfxVolume = v;
    else if (key === "ambientVolume") save.settings.ambientVolume = v;
    else return;

    audio.setVolumes({
      master: save.settings.masterVolume,
      music: save.settings.musicVolume,
      sfx: save.settings.sfxVolume,
      ambient: save.settings.ambientVolume,
    });
    persistSave(save);
  }

  if (pauseOverlayEl) {
    pauseOverlayEl.addEventListener("input", onPauseSettingsInput);
    pauseOverlayEl.addEventListener("change", onPauseSettingsInput);
  }

  async function resumeFromPause() {
    if (!pauseMenu) return;
    if (levelPauseWallClockStartMs > 0) {
      levelTimerPausedAccumMs += performance.now() - levelPauseWallClockStartMs;
      levelPauseWallClockStartMs = 0;
    }
    if (
      combatVictoryOverlayDeferRemainingMs > 0 &&
      modeBeforePause === GameMode.LEVEL_COMPLETE &&
      levelCompleteOverlay &&
      !levelCompleteOverlay.hidden
    ) {
      combatVictoryOverlayTimeoutId = window.setTimeout(() => {
        dismissCombatVictoryOverlay();
      }, combatVictoryOverlayDeferRemainingMs);
      combatVictoryOverlayDismissAtMs = performance.now() + combatVictoryOverlayDeferRemainingMs;
      combatVictoryOverlayDeferRemainingMs = 0;
    }
    pauseMenu.close();
    gameMode = modeBeforePause;
    if (audio.context && audio.context.state === "suspended") {
      try {
        await audio.context.resume();
      } catch {
        /* ignore */
      }
    }
    game.startLoop();
  }

  async function enterPause() {
    if (!pauseMenu) return;
    if (isLevelExitDestinationOverlayBlockingInput()) return;
    if (!isArenaRideableMode(gameMode)) return;
    modeBeforePause = gameMode;
    gameMode = GameMode.PAUSE;
    game.stopLoop();
    if (levelStarted && levelStartMonotonicMs > 0) {
      levelPauseWallClockStartMs = performance.now();
    }
    if (combatVictoryOverlayTimeoutId) {
      window.clearTimeout(combatVictoryOverlayTimeoutId);
      combatVictoryOverlayTimeoutId = 0;
      combatVictoryOverlayDeferRemainingMs = Math.max(0, combatVictoryOverlayDismissAtMs - performance.now());
    }
    syncPauseSettingsUiFromSave();
    if (audio.context && audio.context.state === "running") {
      try {
        await audio.context.suspend();
      } catch {
        /* ignore */
      }
    }
    pauseMenu.open();
  }

  function beginQuitTunnelToLobby() {
    if (pauseMenu) pauseMenu.close();
    setEditorPlaytestReturn(null);
    setSessionBootTarget(null);
    hideLobbyTransitionChrome();
    silenceDrivingAndProximityAudio();
    game.stopLoop();
    playTunnel(
      game.renderer,
      () => {
        window.location.reload();
      },
      {
        durationSeconds: CONFIG.tunnelGateSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          clearTrailAndEquipForTunnel();
        },
        devHud,
      },
    ).catch(() => {
      window.location.reload();
    });
  }

  /** P6.9 — quit play-test back to Architect (not pause — ESC opens pause). */
  function beginEditorPlaytestBacktickToEditor() {
    if (!isEditorPlaytest || !activeCampaignLevel || typeof activeCampaignLevel.id !== "string") return;
    const wid = activeCampaignLevel.id;
    setEditorPlaytestReturn(null);
    setSessionBootTarget({ mode: "editor", wipLevelId: wid });
    if (pauseMenu) pauseMenu.close();
    hideLobbyTransitionChrome();
    silenceDrivingAndProximityAudio();
    game.stopLoop();
    playTunnel(
      game.renderer,
      () => {
        window.location.reload();
      },
      {
        durationSeconds: CONFIG.tunnelGateSeconds,
        onBegin: () => {
          audio.playTunnelTransitionWind();
          clearTrailAndEquipForTunnel();
        },
        devHud,
      },
    ).catch(() => {
      window.location.reload();
    });
  }

  pauseMenu = createPauseMenuController({
    root: document.getElementById("pause-overlay"),
    onResume: resumeFromPause,
    onQuitToLobby: beginQuitTunnelToLobby,
  });

  levelExitDestinationMenu = createLevelExitDestinationOverlayController({
    root: document.getElementById("level-exit-destination-overlay"),
    onPickNextLevel: (levelId) => {
      postExitGateTunnelReload({ mode: "campaign", levelId });
    },
    onPickLobby: () => {
      postExitGateTunnelReload(null);
    },
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      const pauseEl = document.getElementById("pause-overlay");
      const pauseVisible = pauseEl && !pauseEl.hidden;
      if (pauseVisible) {
        e.preventDefault();
        resumeFromPause();
        return;
      }
      if (isLevelExitDestinationOverlayBlockingInput()) {
        e.preventDefault();
        return;
      }
      if (isTunnelBlockingInput()) return;
      if (isControlsOverlayBlockingInput()) return;
      if (playerDerezPhase !== "alive") return;
      if (
        gameMode !== GameMode.LOBBY &&
        gameMode !== GameMode.LEVEL &&
        gameMode !== GameMode.LEVEL_COMPLETE
      ) {
        return;
      }
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      e.preventDefault();
      enterPause();
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code !== "Backquote") return;
      if (!isEditorPlaytest) return;
      if (isTunnelBlockingInput()) return;
      if (isControlsOverlayBlockingInput()) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      e.preventDefault();
      beginEditorPlaytestBacktickToEditor();
    },
    true,
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "/" && e.code !== "Slash") return;
      if (e.repeat) return;
      const t = e.target;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      clearEditorSlashHoldTimer();
      editorSlashHoldTimerId = window.setTimeout(() => {
        editorSlashHoldTimerId = null;
        tryEditorShortcutAfterSlashHold();
      }, EDITOR_SHORTCUT_HOLD_MS);
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.key !== "/" && e.code !== "Slash") return;
      clearEditorSlashHoldTimer();
    },
    true,
  );

  function renderNitroHud() {
    if (!hudNitroEl) return;
    const max = Math.max(1, effectivePlayerNitroMax());
    hudNitroEl.classList.toggle("nitro-bar-strip--empty-flash", nitroState.emptyFlash > 0);
    hudNitroEl.replaceChildren();
    for (let i = 0; i < max; i++) {
      const seg = document.createElement("div");
      if (i < nitroState.bars) {
        seg.className = "nitro-bar-seg";
      } else if (i === nitroState.bars && nitroState.bars < max) {
        seg.className = "nitro-bar-seg nitro-bar-seg--empty";
        seg.style.position = "relative";
        seg.style.overflow = "hidden";
        const fill = document.createElement("div");
        fill.style.position = "absolute";
        fill.style.inset = "0";
        fill.style.width = `${Math.min(100, nitroState.rechargeAccum * 100)}%`;
        fill.style.background =
          "linear-gradient(180deg, rgba(0,255,255,0.85), rgba(0,140,200,0.45))";
        fill.style.pointerEvents = "none";
        seg.appendChild(fill);
      } else {
        seg.className = "nitro-bar-seg nitro-bar-seg--empty";
      }
      hudNitroEl.appendChild(seg);
    }
  }

  /** H1 — equip slot icon (shield) + subtle E when E can deploy (plan HUD). */
  function updateEquipHud() {
    if (!hudEquipIcon || !hudEquipE || !hudEquipWrap) return;
    const u = playerBody.userData;
    const ready = u.equipSlot === "shield" && u.shieldPhase === "none";
    const queued = u.equipSlotQueued === "shield" && !ready;

    if (ready || queued) {
      hudEquipIcon.textContent = "\u{1F6E1}";
      hudEquipIcon.classList.add("cycle-hud__equip-icon--shield");
      hudEquipIcon.classList.toggle("cycle-hud__equip-icon--queued", queued);
      const canPressE =
        ready &&
        !isLobby &&
        levelStarted &&
        playerDerezPhase === "alive" &&
        gameMode !== GameMode.PAUSE;
      hudEquipE.classList.toggle("cycle-hud__equip-e--active", canPressE);
      hudEquipWrap.setAttribute(
        "aria-label",
        queued ? "Power-up: shield queued" : "Power-up: shield — press E to deploy",
      );
    } else {
      hudEquipIcon.textContent = "\u25A1";
      hudEquipIcon.classList.remove("cycle-hud__equip-icon--shield", "cycle-hud__equip-icon--queued");
      hudEquipE.classList.remove("cycle-hud__equip-e--active");
      hudEquipWrap.setAttribute("aria-label", "No power-up equipped");
    }
  }

  function syncArenaHud() {
    if (hudTimerWrap) {
      hudTimerWrap.hidden = isLobby;
    }
    renderNitroHud();
    updateEquipHud();
  }

  const statDevHudKeys = new Set([
    "defaultTrailLength",
    "maxSpeed",
    "maxAcceleration",
    "maxHandlingRadPerSec",
    "maxNitroBars",
    "playerBaseTrailLength",
    "enemyBaseTrailLength",
    "playerTrailUpgradeMaxPercent",
    "playerBasePercent",
    "enemyEasyPercent",
    "enemyMediumPercent",
    "enemyHardPercent",
    "enemyBossPercent",
  ]);

  function patchTouchesStats(patch) {
    return Object.keys(patch).some((k) => statDevHudKeys.has(k));
  }

  function patchTouchesVizAmbience(patch) {
    if (!patch || typeof patch !== "object") return false;
    return Object.keys(patch).some((k) => k.startsWith("vizAmbience"));
  }

  function syncRuntimeStatConfigs() {
    const nextPlayerCfg = getArenaPlaytestConfig(runtime, save.player.attributes, arenaSizeFromCampaign);
    for (const k of ["maxMoveSpeed", "acceleration", "baseTurnRate", "nitroBarCount", "trailMaxSegments"]) {
      playCfg[k] = nextPlayerCfg[k];
      playerDriveCfg[k] = nextPlayerCfg[k];
    }
    trailWall.setMaxSegments(playCfg.trailMaxSegments + levelTrailExtendBonus);
    clampNitroCapacity(nitroState, effectivePlayerNitroMax());
    for (const e of enemyRoster.list) {
      const nextEnemyCfg = getArenaPlaytestConfig(runtime, {}, arenaSizeFromCampaign, {
        actorType: "enemy",
        enemyCategory: e.category,
      });
      for (const k of ["maxMoveSpeed", "acceleration", "baseTurnRate", "nitroBarCount", "trailMaxSegments"]) {
        e.playCfg[k] = nextEnemyCfg[k];
      }
      e.trail.setMaxSegments(e.playCfg.trailMaxSegments);
      clampNitroCapacity(e.nitroState, e.playCfg.nitroBarCount);
    }
  }

  createDevHudController({
    devHud,
    applyDevHud: (patch) => {
      game.applyDevHud(patch);
      if (patchTouchesVizAmbience(patch)) {
        arenaAmbience.syncFromDevHud(patch);
      }
      if (patchTouchesStats(patch)) {
        syncRuntimeStatConfigs();
      }
      if (Object.prototype.hasOwnProperty.call(patch, "lobbyMusicVariant")) {
        audio.setMusicLobbyUrl(getLobbyMusicUrl(devHud));
        if (isLobby) {
          void audio.playMusicProfile("lobby");
        }
      }
      if (Object.prototype.hasOwnProperty.call(patch, "gameplayMusicVariant")) {
        const gn =
          isLobby || !activeCampaignLevel
            ? Number.NaN
            : parseCampaignLevelIndex(/** @type {Record<string, unknown>} */ (activeCampaignLevel));
        audio.setMusicGameplayUrl(getGameplayMusicUrl(devHud, gn, { forceDevVariant: true }));
        if (!isLobby) {
          void audio.playMusicProfile("gameplay");
        }
      }
    },
    persist: persistDevHudToSave,
    syncHud: syncArenaHud,
    isInputBlocked: () =>
      isTunnelBlockingInput() ||
      isControlsOverlayBlockingInput() ||
      isPauseOverlayBlockingInput() ||
      isLevelExitDestinationOverlayBlockingInput(),
    grantDevCoins: (amount) => {
      addCoins(save, amount);
      persistSave(save);
      devEconomyUiRefresh();
    },
  });

  syncArenaHud();

  /**
   * P9.3 — particle burst at enemy elimination (trail / cycle contact);
   * first elimination in a stretch runs a slow-mo kill-cam; stacked kills in that window are instant.
   * @param {import('cannon-es').World} w
   * @param {import('./game/enemies.js').CampaignEnemyEntity} e
   */
  function eliminateEnemyWithParticles(w, e) {
    if (e.eliminated) return;
    if (enemyDerezState) {
      if (devHud.vizAmbienceSlowPulse !== false) {
        enemyKillRipple.triggerStackedFast(e.body.position.x, e.body.position.z, e.color);
      }
      gameplayParticles.spawnDerezBurst(e.body.position.x, playCfg.playerSpawnY, e.body.position.z, e.color, {
        particleCount: 52,
      });
      gameplayParticles.spawnDerezCubeShards(e.body.position.x, playCfg.playerSpawnY, e.body.position.z, e.color, {
        count: 72,
        duration: 1.0,
      });
      eliminateCampaignEnemy(w, e);
      return;
    }
    beginEnemyCinematicElimination(w, e);
    if (devHud.vizAmbienceSlowPulse !== false && e.derezSnapshot) {
      enemyKillRipple.armCinematic(e.derezSnapshot.x, e.derezSnapshot.z, e.color);
    }
    enemyDerezState = {
      entity: e,
      phase: "approach",
      keyframed: false,
      phaseStartMs: 0,
      implodeSfxDone: false,
      shardSplatterDone: false,
      returnFov0: devHud.cameraBaseFov,
      returnFov1: devHud.cameraBaseFov,
    };
  }

  const step = 1 / playCfg.physicsHz;
  /** Hide bottom welcome strip once the player is moving (hub + arena tips). */
  let hubWelcomeBannerVisible = true;

  let debugCollisionGroup = null;
  let debugTrailMesh = null;
  let debugPlayerMesh = null;
  const debugEnemyMeshes = [];

  const showFpsHud =
    typeof location !== "undefined" && new URLSearchParams(location.search).get("fps") === "1";
  /** @type {HTMLDivElement | null} */
  let fpsHudEl = null;
  if (showFpsHud && typeof document !== "undefined") {
    fpsHudEl = document.createElement("div");
    fpsHudEl.setAttribute("aria-hidden", "true");
    fpsHudEl.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:2147483647;font:12px/1.25 ui-monospace,monospace;color:#0f8;background:rgba(0,0,0,0.55);padding:4px 10px;pointer-events:none;border-radius:4px;";
    document.body.appendChild(fpsHudEl);
  }
  const fpsTimestamps = /** @type {number[]} */ ([]);
  let fpsHudLastWriteMs = 0;

  game.setOnFrame(({ t, dt }) => {
    arenaAmbience.tick({ t, dt });

    const killBurst = computeEnemyKillAmbientBurst(devHud, enemyDerezState);
    game.tunnelMaterial.uniforms.uKillBurst.value = killBurst.tunnelBurst;
    enemyKillRipple.tick(dt);
    if (fpsHudEl) {
      const nowMs = performance.now();
      fpsTimestamps.push(nowMs);
      while (fpsTimestamps.length && nowMs - fpsTimestamps[0] > 1000) {
        fpsTimestamps.shift();
      }
      if (nowMs - fpsHudLastWriteMs >= 200) {
        fpsHudLastWriteMs = nowMs;
        const fpsN = fpsTimestamps.length;
        const frameMs = dt > 0 ? dt * 1000 : 0;
        fpsHudEl.textContent = `~${fpsN} fps  ${frameMs.toFixed(1)} ms`;
      }
    }

    const floorMat = game.scene.userData.arenaFloorMaterial;
    if (floorMat && floorMat.userData) {
      const base =
        typeof floorMat.userData.emissiveIntensityBase === "number"
          ? floorMat.userData.emissiveIntensityBase
          : typeof floorMat.userData.ambienceEmissiveBase === "number"
            ? floorMat.userData.ambienceEmissiveBase
            : floorMat.emissiveIntensity;
      const killMul = devHud.vizAmbienceSlowPulse !== false ? 1 + killBurst.floorBump * 0.72 : 1;
      floorMat.emissiveIntensity = base * killMul;
    }
    tickHudPickupFlights();

    if (waypointBeacon) {
      /** @type {{ x: number; z: number } | null} */
      let pt = null;
      if (isLobby) {
        if (!save.progress.completedLevels.includes(1)) {
          const g = wallGates.find((x) => x.role === "arena");
          pt = g ? getGateInwardPoint(g, playCfg.arenaWidth, playCfg.arenaDepth, waypointBeaconGateInwardUnits) : null;
        } else if (!save.flags.seenGarage) {
          const g = wallGates.find((x) => x.role === "garage");
          pt = g ? getGateInwardPoint(g, playCfg.arenaWidth, playCfg.arenaDepth, waypointBeaconGateInwardUnits) : null;
        }
      } else if (exitGateUnlocked) {
        const g = wallGates.find((x) => x.role === "exit");
        pt = g ? getGateInwardPoint(g, playCfg.arenaWidth, playCfg.arenaDepth, waypointBeaconGateInwardUnits) : null;
      }
      waypointBeacon.setTarget(!!pt, pt ? pt.x : 0, pt ? pt.z : 0);
      waypointBeacon.tick(t);
    }
    if (isLobby) {
      const ds =
        !dailyLobbyMeta.hasMap
          ? { ymd: ymdLocal, state: /** @type {const} */ ("no_map"), displayName: "" }
          : isDailyClearedOn(save, ymdLocal)
            ? { ymd: ymdLocal, state: /** @type {const} */ ("cleared"), displayName: dailyLobbyMeta.displayName }
            : { ymd: ymdLocal, state: /** @type {const} */ ("play"), displayName: dailyLobbyMeta.displayName };
      tickLobbyBannerControllers(game.scene.userData.lobbyBannerControllers, save, campaign.validLevels, ds);
    } else {
      let enemiesRemaining = 0;
      for (const e of enemyRoster.list) {
        if (!e.eliminated) enemiesRemaining++;
      }
      const aid = activeCampaignLevel && typeof activeCampaignLevel.id === "string" ? activeCampaignLevel.id : "";
      const exitUiMode = aid === "level-tutorial" ? "tutorial" : aid.startsWith("daily-") ? "daily" : "normal";
      tickCampaignExitBanners(game.scene.userData.lobbyBannerControllers, {
        remaining: enemiesRemaining,
        total: rawEnemyCount,
        complete: exitGateUnlocked,
        coinGained: getPendingLevelCoinAward(getLevelElapsedSecExcludingPauses()),
        exitUiMode,
      });
    }
    if (playerDerezPhase === "imploding") {
      silenceDrivingAndProximityAudio(dt);
      const durationSec = Math.max(0.4, devHud.derezSequenceSeconds ?? 2);
      const elapsed = (performance.now() - playerDerezT0Ms) / 1000;
      const slow = devHud.derezSlowMo !== false ? 1.75 : 1;
      const u = Math.min(1, elapsed / (durationSec * slow));
      const visU = devHud.derezSlowMo !== false ? Math.pow(u, 0.72) : u;

      playerCycle.updateDerezImplosion(dt, visU);

      const flashOn = devHud.derezGlitchFlash !== false;
      let flash = 0;
      let glitch = 0;
      if (flashOn) {
        const t0 = elapsed;
        flash = t0 < 0.1 ? 0.5 * (1 - t0 / 0.1) : Math.max(0, 0.2 * Math.exp(-(t0 - 0.1) * 8));
        glitch = Math.max(0, 0.9 * Math.exp(-t0 * 4.2));
      }
      game.postPipeline.setDerezPostFx({ glitch, flash });

      chase.update(dt, {
        playerPos: playerCycle.root.position,
        playerVel: playerBody.velocity,
        keys: arenaKeys,
        nitroStrength: 0,
        derez: {
          active: true,
          playerPos: playerCycle.root.position,
          elapsedSec: elapsed,
          playerHeading: playerBody.userData.heading ?? 0,
        },
      });
      game.postPipeline.setNitroFx({ strength: 0 });

      if (u >= 1) {
        startDerezTunnelToLobby();
      }
      gameplayParticles.tick(dt, {});
      return;
    }

    if (enemyDerezState) {
      const d = /** @type {NonNullable<typeof enemyDerezState>} */ (enemyDerezState);
      const e = d.entity;
      const snap = e.derezSnapshot;
      if (e.cinematicDerezActive && snap) {
        const now = performance.now();
        if (!d.keyframed) {
          d.keyframed = true;
          d.phaseStartMs = now;
          enemyKillApproachFrom.copy(game.camera.position);
          const px = playerBody.position.x;
          const pz = playerBody.position.z;
          const pBase = playCfg.playerSpawnY;
          enemyKillLFrom.set(px, pBase + 0.4, pz);
          computeEnemyKillCamEndFrame(enemyKillTo, enemyKillLTo, px, pz, pBase, snap);
        }

        const approachSec = Math.max(0.12, devHud.enemyKillApproachSec ?? 0.85);
        const implodeSec = Math.max(0.08, devHud.enemyKillImplodeSec ?? 0.72);
        const returnSec = Math.max(0.08, devHud.enemyKillReturnSec ?? 0.6);

        silenceDrivingAndProximityAudio(dt);
        game.postPipeline.setNitroFx({ strength: 0 });
        if (speedLineEl) {
          speedLineEl.style.opacity = "0";
        }

        if (d.phase === "approach") {
          const tRaw = (now - d.phaseStartMs) / (approachSec * 1000);
          const p = smoothstep01(tRaw);
          enemyKillCamLerp.lerpVectors(enemyKillApproachFrom, enemyKillTo, p);
          enemyKillLookLerp.lerpVectors(enemyKillLFrom, enemyKillLTo, p);
          game.camera.position.copy(enemyKillCamLerp);
          game.camera.lookAt(enemyKillLookLerp);
          game.camera.fov = devHud.cameraBaseFov;
          game.camera.updateProjectionMatrix();
          if (tRaw >= 1) {
            d.phase = "implode";
            d.phaseStartMs = now;
          }
        } else if (d.phase === "implode") {
          if (!d.implodeSfxDone) {
            d.implodeSfxDone = true;
            if (devHud.vizAmbienceSlowPulse !== false) {
              enemyKillRipple.onCinematicImplode();
            }
            gameplayParticles.spawnDerezCubeShards(snap.x, playCfg.playerSpawnY, snap.z, e.color, {
              count: 420,
              duration: Math.max(1.45, implodeSec * 1.35),
            });
            gameplayParticles.spawnDerezBurst(snap.x, playCfg.playerSpawnY, snap.z, e.color, {
              particleCount: 104,
            });
            audio.playEnemyDerezShatter({ sting: devHud.eliminationStingEnabled !== false });
          }
          const tRaw = (now - d.phaseStartMs) / (implodeSec * 1000);
          if (!d.shardSplatterDone && tRaw >= 0.4) {
            d.shardSplatterDone = true;
            gameplayParticles.spawnDerezCubeShards(snap.x, playCfg.playerSpawnY, snap.z, e.color, {
              count: 180,
              duration: Math.max(0.92, implodeSec * 0.82),
            });
            gameplayParticles.spawnDerezBurst(snap.x, playCfg.playerSpawnY, snap.z, e.color, {
              particleCount: 44,
            });
          }
          const visU = Math.min(1, tRaw);
          e.cycle.updateDerezShardSmash(dt, visU);
          game.camera.position.copy(enemyKillTo);
          game.camera.lookAt(enemyKillLTo);
          game.camera.fov = devHud.cameraBaseFov;
          game.camera.updateProjectionMatrix();
          if (tRaw >= 1) {
            if (devHud.vizAmbienceSlowPulse !== false) {
              enemyKillRipple.onCinematicReturn();
            }
            d.phase = "return";
            d.phaseStartMs = now;
            enemyKillRetFrom.copy(game.camera.position);
            d.returnFov0 = game.camera.fov;
            d.returnFov1 = chase.computeChaseFrame(enemyKillRetTo, enemyKillRetLook, {
              playerPos: playerCycle.root.position,
              playerVel: playerBody.velocity,
              keys: arenaKeys,
              nitroStrength: nitroVis,
              playerHeading: playerBody.userData.heading,
            });
          }
        } else {
          const tRaw = (now - d.phaseStartMs) / (returnSec * 1000);
          const p = smoothstep01(tRaw);
          enemyKillCamLerp.lerpVectors(enemyKillRetFrom, enemyKillRetTo, p);
          enemyKillLookLerp.lerpVectors(enemyKillLTo, enemyKillRetLook, p);
          game.camera.position.copy(enemyKillCamLerp);
          game.camera.lookAt(enemyKillLookLerp);
          game.camera.fov = d.returnFov0 + p * (d.returnFov1 - d.returnFov0);
          game.camera.updateProjectionMatrix();
          if (tRaw >= 1) {
            if (devHud.vizAmbienceSlowPulse !== false) {
              enemyKillRipple.onCinematicFinished();
            }
            endEnemyCinematicDerez(e);
            enemyDerezState = null;
            chase.snapToGameplayChase({
              playerPos: playerCycle.root.position,
              playerVel: playerBody.velocity,
              keys: arenaKeys,
              nitroStrength: nitroVis,
              playerHeading: playerBody.userData.heading,
            });
            game.postPipeline.setNitroFx({ strength: 0 });
          }
        }

        gameplayParticles.tick(dt, {});
        return;
      }
      if (devHud.vizAmbienceSlowPulse !== false) {
        enemyKillRipple.onCinematicAborted();
      }
      enemyDerezState = null;
    }

    if (playerDerezPhase !== "alive") {
      silenceDrivingAndProximityAudio(dt);
      gameplayParticles.tick(dt, {});
      return;
    }

    if (isLobby) {
      const gh = queryOpenGateAtPosition(
        wallGates,
        playCfg.arenaWidth,
        playCfg.arenaDepth,
        playerBody.position,
      );
      const inside = !!gh && gh.gate.role !== "entrance" && !gh.gate.locked;
      if (inside && !lobbyGateWasInside) {
        const role = gh.gate.role;
        if (role === "arena") {
          const nextIdx = save.progress.currentLevel;
          if (isLevelUnlockedLinear(save, nextIdx)) {
            const target = findCampaignLevelByCampaignIndex(campaign.validLevels, nextIdx);
            if (target && typeof target.id === "string") {
              beginLobbyGateTunnel({ mode: "campaign", levelId: target.id });
              return;
            }
          }
        } else if (role === "garage") {
          beginLobbyGateTunnel({ mode: "garage" });
          return;
        } else if (role === "daily") {
          if (dailyLobbyMeta.hasMap && !isDailyClearedOn(save, ymdLocal)) {
            beginLobbyGateTunnel({ mode: "daily", ymd: ymdLocal });
            return;
          }
        } else if (role === "vibejam" && !vibejamNavLock) {
          vibejamNavLock = true;
          const href = vjReturnFlow
            ? buildVibeJamReturnToRefUrl(vjRefRaw, { save, playerBody })
            : buildVibeJamExitToHubUrl({ save, playerBody });
          beginVibeJamRedirect(href);
          return;
        }
      }
      lobbyGateWasInside = inside;
    } else {
      lobbyGateWasInside = false;
    }

    if (!levelStarted && !isLobby && arenaKeys.w) {
      levelStarted = true;
      levelStartMonotonicMs = performance.now();
      const fn = game.scene.userData.onLevelStart;
      if (typeof fn === "function") fn();
      syncArenaHud();
    }

    playerDriveCfg.nitroBarCount = effectivePlayerNitroMax();
    const playerOverBoostPad = boostPadField.tick(dt, {
      isLobby,
      levelStarted,
      playerBody,
      nitroState,
      enemies: enemyRoster.list,
      devHud,
      onBoost: () => {
        audio.playBoostPadWhoosh();
      },
      onNitroBurstStart: () => {
        audio.playNitroBurstWhoosh();
      },
    });
    tickPlayerShieldFsm(dt);
    syncPlayerShieldActiveFromPhase();
    const { nitroBurstActive: nitroOn } = tickPlayerArcadeDrive({
      body: playerBody,
      dt,
      keys: arenaKeys,
      nitroState,
      playCfg: playerDriveCfg,
      devHud,
      levelStarted: isLobby || levelStarted,
      onNitroEmptyPress: () => {
        audio.playNitroEmptyBuzz();
      },
      onNitroBurstStart: () => {
        audio.playNitroBurstWhoosh();
      },
    });
    enemyRoster.tick(dt, {
      levelStarted,
      isLobby,
      playerBody,
      playerTrail: trailWall,
      playerMaxMoveSpeed: playerDriveCfg.maxMoveSpeed,
      devHud,
    });

    syncCyclePhysicsYaw(playerBody);
    for (const e of enemyRoster.list) {
      if (!e.eliminated) syncCyclePhysicsYaw(e.body);
    }

    const preStepPlayerPos = { x: playerBody.position.x, z: playerBody.position.z };
    const preStepEnemyPositions = new Map();
    for (const e of enemyRoster.list) {
      if (!e.eliminated) {
        preStepEnemyPositions.set(e.id, { x: e.body.position.x, z: e.body.position.z });
      }
    }

    world.step(step, dt, 10);

    syncCyclePhysicsYaw(playerBody);
    for (const e of enemyRoster.list) {
      if (!e.eliminated) syncCyclePhysicsYaw(e.body);
    }
    const spWall0 = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
    applyContinuousArenaWallSlide(playerBody, playCfg, game.scene.userData.openGateFootprints);
    applyContinuousBarrierSlide(playerBody, game.scene.userData.barrierBodies, playCfg);
    const spWall1 = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
    const wallSlip = spWall0 - spWall1;
    const wallHitMs = performance.now();
    if (
      playerDerezPhase === "alive" &&
      !isTunnelBlockingInput() &&
      wallSlip > 0.85 &&
      spWall0 > 4 &&
      wallHitMs - lastWallHitSfxMs > 95
    ) {
      lastWallHitSfxMs = wallHitMs;
      audio.playWallHitThud(Math.min(1, wallSlip / Math.max(spWall0, 0.01)));
    }
    applyEnemyWallAndBarrierSlide(enemyRoster.list, game.scene);

    portalField.tick(dt, {
      isLobby,
      levelStarted,
      playerBody,
      enemies: enemyRoster.list,
      devHud,
      detachPlayerTrail: () => {
        trailWall.detachChainAtPortal();
      },
      detachEnemyTrail: (e) => {
        e.trail.detachChainAtPortal();
      },
      onPortalSound: () => {
        audio.playPortalWarp();
      },
    });

    powerupField.tick(dt, {
      isLobby,
      levelStarted,
      playerBody,
      enemies: enemyRoster.list,
      devHud,
      onPickupSound: (cat) => {
        if (cat === "instant") audio.playPowerupPickupInstant();
        else if (cat === "level_permanent") audio.playPowerupPickupLevelPermanent();
        else audio.playPowerupPickupEquippable();
      },
      onPickupNotify: (info) => {
        pickupFeedback.show({ title: info.title });
      },
      apply: {
        onPlayerNitroRecharge: () => {
          refillNitroBars(nitroState, effectivePlayerNitroMax());
        },
        onPlayerTrailExtend: () => {
          levelTrailExtendBonus += typeof devHud.trailExtendAmount === "number" ? devHud.trailExtendAmount : 10;
          trailWall.setMaxSegments(playCfg.trailMaxSegments + levelTrailExtendBonus);
        },
        onPlayerShield: () => {
          assignPlayerShieldPickup();
        },
        onEnemyPickup: (e, kind) => {
          if (kind === "nitro_recharge") {
            refillNitroBars(e.nitroState, e.playCfg.nitroBarCount);
          } else {
            e.body.userData.equipSlot = "shield";
          }
        },
      },
    });

    const gateAnim = game.scene.userData.gateAnimatables;
    if (Array.isArray(gateAnim) && gateAnim.length > 0) {
      updateGateAnimations(gateAnim, performance.now() * 0.001);
    }
    syncHeadingSpeedFromVelocity(playerBody);
    syncEnemyHeadingSpeed(enemyRoster.list);

    if (hubWelcomeBannerVisible) {
      const planar = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
      if (planar > 0.35) {
        hubWelcomeBannerVisible = false;
        lobbyBanner.hidden = true;
        lobbyBanner.classList.add("state-banner--hidden");
      }
    }

    if (
      tutorialGameplayMusicPending &&
      levelStarted &&
      !hubWelcomeBannerVisible &&
      !isLobby
    ) {
      tutorialGameplayMusicPending = false;
      void audio.playMusicProfile("gameplay").catch(() => {});
    }

    trailWall.update(dt, {
      x: playerBody.position.x,
      z: playerBody.position.z,
      heading: playerBody.userData.heading ?? 0,
      speed: playerBody.userData.speed ?? 0,
    });
    updateEnemyTrails(enemyRoster.list, dt);

    const trailSourcesForMix = buildTrailSources(trailWall, enemyRoster.list);
    const pxMix = playerBody.position.x;
    const pzMix = playerBody.position.z;

    if (typeof audio.syncDevAudioPresets === "function") {
      audio.syncDevAudioPresets(devHud);
    }

    const spdEngine = playerBody.userData.speed ?? 0;
    const nitroCapMul =
      typeof devHud.nitroMaxSpeedMultiplier === "number" && Number.isFinite(devHud.nitroMaxSpeedMultiplier)
        ? devHud.nitroMaxSpeedMultiplier
        : 1.2;
    audio.tickEngineSound({
      active: playerDerezPhase === "alive" && !isTunnelBlockingInput(),
      dt,
      speed: spdEngine,
      speedRatioDenominator: playerDriveCfg.maxMoveSpeed * nitroCapMul,
      enginePitch: typeof devHud.enginePitch === "number" ? devHud.enginePitch : 1,
      gearShiftCount: typeof devHud.gearShiftCount === "number" ? devHud.gearShiftCount : 5,
      acceleration: playerDriveCfg.acceleration,
      throttle: arenaKeys.w,
      braking: arenaKeys.s,
      nitroActive: nitroOn,
    });

    const raw = nitroOn ? 1 : 0;
    nitroVis += (raw - nitroVis) * (1 - Math.exp(-16 * dt));

    let nitroExhaust01 = 0;
    if (nitroOn) nitroExhaust01 += 0.34 + nitroVis * 0.66;
    if (playerOverBoostPad) nitroExhaust01 += 0.42;
    nitroExhaust01 = Math.min(1, nitroExhaust01);
    if (typeof audio.tickNitroExhaustHiss === "function") {
      audio.tickNitroExhaustHiss({
        active: playerDerezPhase === "alive" && !isTunnelBlockingInput(),
        intensity01: nitroExhaust01,
        dt,
      });
    }

    const trailSources = trailSourcesForMix;
    const px = pxMix;
    const pz = pzMix;

    const trailFalloff =
      typeof devHud.trailProximityFalloffDistance === "number" && Number.isFinite(devHud.trailProximityFalloffDistance)
        ? Math.max(4, devHud.trailProximityFalloffDistance)
        : 15;
    const phMix = playerBody.userData.heading ?? 0;
    const rearOff = CYCLE_BOUNDS.length * 0.48;
    const trailRearX = pxMix - Math.sin(phMix) * rearOff;
    const trailRearZ = pzMix - Math.cos(phMix) * rearOff;
    const trailNearest = computeNearestTrailHazardDistanceOnly(pxMix, pzMix, trailSourcesForMix, devHud, playCfg, {
      selfSampleX: trailRearX,
      selfSampleZ: trailRearZ,
    });
    const trailProximity01 = Number.isFinite(trailNearest) ? Math.max(0, 1 - trailNearest / trailFalloff) : 0;

    if (typeof audio.applyDynamicMix === "function" && playerDerezPhase === "alive" && !isTunnelBlockingInput()) {
      let minEnemyD = Infinity;
      for (const e of enemyRoster.list) {
        if (e.eliminated) continue;
        const dx = e.body.position.x - px;
        const dz = e.body.position.z - pz;
        minEnemyD = Math.min(minEnemyD, Math.hypot(dx, dz));
      }
      const speedT = Math.min(1, (playerBody.userData.speed ?? 0) / 85);
      const nearT = Number.isFinite(minEnemyD) ? Math.max(0, 1 - minEnemyD / 48) : 0;
      const tension = Math.min(1, speedT * 0.35 + nearT * 0.65);
      const enemy01 =
        devHud.enemyEngineBedEnabled !== false && Number.isFinite(minEnemyD)
          ? Math.max(0, 1 - minEnemyD / 52)
          : 0;
      const trailMix = {
        trailProximity01,
        trailProximityMaxGain: devHud.trailProximityMaxGain,
        trailProximityBedEnabled: devHud.trailProximityBedEnabled,
      };
      if (!isLobby) {
        audio.applyDynamicMix({
          musicDuckTension01: devHud.musicDuckEnabled !== false ? tension : 0,
          musicDuckMaxDb: devHud.musicDuckMaxDb,
          enemyEngine01: enemy01,
          enemyEngineMaxGain: devHud.enemyEngineMaxGain,
          ...trailMix,
        });
      } else {
        audio.applyDynamicMix({ musicDuckTension01: 0, enemyEngine01: 0, ...trailMix });
      }
    }

    const playerTrailHit = tryTrailHitOnBody(
      playerBody,
      preStepPlayerPos.x,
      preStepPlayerPos.z,
      px,
      pz,
      "player",
      trailSources,
      devHud,
      playCfg.world
    );
    if (playerTrailHit === "lethal") {
      beginPlayerDerezSequence();
    } else if (playerTrailHit === "absorbed") {
      gameplayParticles.spawnShieldShatter(
        playerBody.position.x,
        playCfg.playerSpawnY,
        playerBody.position.z,
      );
      playerBody.userData.shieldPhase = "none";
      playerBody.userData.shieldDeployRemain = 0;
      playerBody.userData.shieldActiveRemain = 0;
      playerBody.userData.shieldActive = false;
      audio.playShieldShatterClang();
      promoteShieldQueue();
    } else {
      for (const e of enemyRoster.list) {
        if (e.eliminated) continue;
        const p0 = preStepEnemyPositions.get(e.id) ?? {
          x: e.body.previousPosition.x,
          z: e.body.previousPosition.z,
        };
        const ht = tryTrailHitOnBody(
          e.body,
          p0.x,
          p0.z,
          e.body.position.x,
          e.body.position.z,
          e.id,
          trailSources,
          devHud,
          playCfg.world
        );
        if (ht === "lethal") eliminateEnemyWithParticles(world, e);
      }

      if (!playerBody.userData.tronEliminated) {
        for (const e of enemyRoster.list) {
          if (e.eliminated) continue;
          const out = evaluateCyclePairContact(playerBody, e.body, playCfg, devHud);
          if (!out) continue;
          if (out.derezA) beginPlayerDerezSequence();
          if (out.derezB) eliminateEnemyWithParticles(world, e);
        }
      }

      if (!playerBody.userData.tronEliminated) {
        const list = enemyRoster.list;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (a.eliminated) continue;
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (b.eliminated) continue;
            const out = evaluateCyclePairContact(a.body, b.body, playCfg, devHud);
            if (!out) continue;
            if (out.derezA) eliminateEnemyWithParticles(world, a);
            if (out.derezB) eliminateEnemyWithParticles(world, b);
          }
        }
      }
    }

    /**
     * P2.6 — after eliminations this frame: open exit + overlay once all combat enemies are gone;
     * then allow same-frame exit ride-through if already in the trigger volume.
     */
    if (
      playerDerezPhase === "alive" &&
      !exitGateUnlocked &&
      !isLobby &&
      rawEnemyCount > 0 &&
      enemyRoster.list.length > 0 &&
      enemyRoster.list.every((e) => e.eliminated) &&
      enemyDerezState === null
    ) {
      if (runtimeUnlockCampaignExitGate(game.scene, world, playCfg, wallMat)) {
        exitGateUnlocked = true;
        const gr = game.scene.userData.gates;
        const anim = game.scene.userData.gateAnimatables;
        if (gr?.root && Array.isArray(anim)) {
          applyExitGateRuntimeOpenVisual(gr.root, playCfg, anim);
        }
        showCombatVictoryOverlay();
      }
    }

    if (
      exitGateUnlocked &&
      !isLobby &&
      (levelStarted || rawEnemyCount === 0) &&
      !winTunnelStarted &&
      playerDerezPhase === "alive"
    ) {
      const gatesList = game.scene.userData.gates?.list ?? wallGates;
      const hit = queryOpenGateAtPosition(
        gatesList,
        playCfg.arenaWidth,
        playCfg.arenaDepth,
        playerBody.position,
      );
      if (hit && hit.gate.role === "exit") {
        beginWinTunnelToLobby();
        return;
      }
    }

    if (playerDerezPhase === "alive" && playerTrailHit !== "lethal") {
      const nm =
        typeof devHud.nearMissDistance === "number" && Number.isFinite(devHud.nearMissDistance)
          ? devHud.nearMissDistance
          : 1.5;
      const dist = computePlayerNearMissDistance(
        px,
        pz,
        trailSources,
        devHud,
        playCfg,
        game.scene.userData.openGateFootprints,
        game.scene.userData.barrierBodies,
      );
      const nowMs = performance.now();
      let minEnemyForWhoosh = Infinity;
      for (const e of enemyRoster.list) {
        if (e.eliminated) continue;
        const dx = e.body.position.x - px;
        const dz = e.body.position.z - pz;
        minEnemyForWhoosh = Math.min(minEnemyForWhoosh, Math.hypot(dx, dz));
      }
      const enemyEngT = Number.isFinite(minEnemyForWhoosh) ? Math.max(0, 1 - minEnemyForWhoosh / 50) : 0;
      const suppressNearMissWhoosh =
        devHud.nearMissWhooshWhenEnemyEngine !== false &&
        devHud.enemyEngineBedEnabled !== false &&
        enemyEngT > 0.42;
      if (dist < nm && nowMs - lastNearMissMs >= 380 && !suppressNearMissWhoosh) {
        audio.playNearMissWhoosh();
        lastNearMissMs = nowMs;
      }
    }

    if (hudSpeedEl) {
      const spd = playerBody.userData.speed ?? 0;
      hudSpeedEl.textContent = String(Math.round(spd));
    }
    if (hudTimerEl && !isLobby) {
      const elapsedSec = getLevelElapsedSecExcludingPauses();
      hudTimerEl.textContent = formatHudMmSs(elapsedSec);
      const rewards =
        activeCampaignLevel && activeCampaignLevel.rewards && typeof activeCampaignLevel.rewards === "object"
          ? /** @type {Record<string, unknown>} */ (activeCampaignLevel.rewards)
          : null;
      const timeTh =
        rewards && typeof rewards.timeBonusThreshold === "number" && Number.isFinite(rewards.timeBonusThreshold)
          ? rewards.timeBonusThreshold
          : 0;
      const warn = timeTh > 0 && elapsedSec > timeTh * 0.88;
      hudTimerEl.classList.toggle("cycle-hud__timer--warn", warn);
    }
    if (hudTrailEl) {
      hudTrailEl.textContent = String(trailWall.getActiveSegmentCount());
      const previewHit = tryTrailHitOnBody(
        { userData: {} },
        playerBody.position.x,
        playerBody.position.z,
        playerBody.position.x,
        playerBody.position.z,
        "player",
        trailSources,
        devHud,
        playCfg.world
      );
      hudTrailEl.classList.toggle(
        "cycle-hud__trail--tile-hit",
        previewHit === "lethal",
      );
    }
    renderNitroHud();
    updateEquipHud();

    const playerNeonCss = cosmeticColorToCssHex(save.player.cycleColor ?? "#00FFFF");
    /** P9.4 — minimap: trails, barriers, pickups / pads / portals, player + enemy dots. */
    const minimapTrailSources = [
      {
        color: playerNeonCss,
        getSegments: () => trailWall.getMinimapSegments(),
      },
    ];
    for (const e of enemyRoster.list) {
      if (e.eliminated) continue;
      minimapTrailSources.push({
        color: e.color,
        getSegments: () => e.trail.getMinimapSegments(),
      });
    }
    const minimapEnemies = enemyRoster.list
      .filter((e) => !e.eliminated)
      .map((e) => ({
        x: e.body.position.x,
        z: e.body.position.z,
        color: e.color,
      }));
    const itemPts = [...powerupField.getMinimapPickups(), ...portalField.getMinimapPortals()];
    
    const minimapGates = [];
    if (game.scene.userData.gates && Array.isArray(game.scene.userData.gates.list)) {
      const halfW = playCfg.arenaWidth / 2;
      const halfD = playCfg.arenaDepth / 2;
      for (const g of game.scene.userData.gates.list) {
        const half = g.width / 2;
        const p = g.position;
        let x0 = 0, x1 = 0, z0 = 0, z1 = 0;
        if (g.edge === "south" || g.edge === "north") {
          x0 = -halfW + p - half;
          x1 = -halfW + p + half;
          z0 = g.edge === "south" ? -halfD : halfD;
          z1 = z0;
        } else {
          z0 = -halfD + p - half;
          z1 = -halfD + p + half;
          x0 = g.edge === "west" ? -halfW : halfW;
          x1 = x0;
        }
        minimapGates.push({
          x0, x1, z0, z1,
          role: g.role,
          open: !g.locked || g.role === "entrance" || g.role === "vibejam"
        });
      }
    }

    const mmNow = performance.now();
    const mmInt = graphicsProfile.minimapMinIntervalMs;
    if (mmInt <= 0 || mmNow - lastMinimapDrawMs >= mmInt) {
      lastMinimapDrawMs = mmNow;
      minimapRenderer.draw({
        arenaWidth: playCfg.arenaWidth,
        arenaDepth: playCfg.arenaDepth,
        playerX: playerBody.position.x,
        playerZ: playerBody.position.z,
        playerColor: playerNeonCss,
        enemies: minimapEnemies,
        trailSources: minimapTrailSources,
        barrierBodies: game.scene.userData.barrierBodies,
        boostPadRects: boostPadField.getMinimapBoostPads(),
        gates: minimapGates,
        itemPoints: itemPts,
      });
    }

    const h = playerBody.userData.heading ?? 0;
    playerCycle.root.position.set(
      playerBody.position.x,
      playerBody.position.y,
      playerBody.position.z,
    );
    playerCycle.root.rotation.y = h;

    const steer =
      (arenaKeys.a ? 1 : 0) - (arenaKeys.d ? 1 : 0);
    const spd = playerBody.userData.speed ?? 0;
    const braking = arenaKeys.s && !nitroOn;
    const accelerating = arenaKeys.w && !braking;
    const sp = playerBody.userData.shieldPhase;
    /** @type {'off' | 'deploy' | 'active'} */
    let shieldBubbleMode = "off";
    if (sp === "deploying") shieldBubbleMode = "deploy";
    else if (sp === "active") shieldBubbleMode = "active";

    const tutNitroMul =
      activeCampaignLevel && activeCampaignLevel.id === "level-tutorial" && typeof devHud.tutorialNitroJuice === "number" && Number.isFinite(devHud.tutorialNitroJuice)
        ? Math.max(0.4, devHud.tutorialNitroJuice)
        : 1;
    const nitroFxVis = Math.min(1, nitroVis * tutNitroMul);

    playerCycle.update(dt, {
      speed: spd,
      steer,
      accelerating,
      braking,
      nitroBurstStrength: nitroFxVis,
      shieldBubbleMode,
    });
    updateEnemyCycleMeshes(enemyRoster.list, dt);

    chase.update(dt, {
      playerPos: playerCycle.root.position,
      playerVel: playerBody.velocity,
      keys: arenaKeys,
      nitroStrength: nitroVis,
      playerHeading: playerBody.userData.heading,
    });
    game.postPipeline.setNitroFx({ strength: nitroFxVis });
    if (speedLineEl) {
      speedLineEl.style.opacity = String(
        devHud.nitroSpeedLines ? nitroFxVis * 0.78 : 0,
      );
    }

    /** P9.3 — nitro exhaust, shield shimmer, pickup/portal burst sim (shared system). */
    const nitroEmitters = [
      {
        x: playerBody.position.x,
        y: playCfg.playerSpawnY,
        z: playerBody.position.z,
        heading: playerBody.userData.heading ?? 0,
        strength: nitroFxVis,
        colorHex: hexColorToInt(save.player.cycleColor ?? "#00FFFF"),
      },
    ];
    for (const e of enemyRoster.list) {
      if (e.eliminated) continue;
      nitroEmitters.push({
        x: e.body.position.x,
        y: playCfg.playerSpawnY,
        z: e.body.position.z,
        heading: e.body.userData.heading ?? 0,
        strength: isNitroBurstActive(e.nitroState) ? 1 : 0,
        colorHex: hexColorToInt(e.color),
      });
    }
    const spActive = playerBody.userData.shieldPhase === "active";
    gameplayParticles.tick(dt, {
      nitroEmitters,
      shieldShimmer: spActive,
      shieldShimmerPos: spActive
        ? {
            x: playerBody.position.x,
            y: playCfg.playerSpawnY,
            z: playerBody.position.z,
          }
        : null,
    });

    if (devHud.debugTrailCollisionBoxes) {
      if (!debugCollisionGroup) {
        debugCollisionGroup = new THREE.Group();
        game.scene.add(debugCollisionGroup);

        const tSize = playCfg.world.tileSize;
        const boxGeo = new THREE.BoxGeometry(tSize, tSize, tSize);
        const redMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, depthTest: false });
        debugTrailMesh = new THREE.InstancedMesh(boxGeo, redMat, 20000);
        debugTrailMesh.frustumCulled = false;
        debugCollisionGroup.add(debugTrailMesh);

        const playerGeo = new THREE.BoxGeometry(playCfg.cycleHalfWidth * 2, playCfg.cycleHalfHeight * 2, playCfg.cycleHalfLength * 2);
        const playerEdges = new THREE.EdgesGeometry(playerGeo);
        const blueMat = new THREE.LineBasicMaterial({ color: 0x0088ff, depthTest: false });
        debugPlayerMesh = new THREE.LineSegments(playerEdges, blueMat);
        debugCollisionGroup.add(debugPlayerMesh);
      }

      // Update Player
      debugPlayerMesh.position.copy(playerBody.position);
      debugPlayerMesh.rotation.y = playerBody.userData.heading ?? 0;

      // Update Enemies
      while (debugEnemyMeshes.length < enemyRoster.list.length) {
        const eGeo = new THREE.BoxGeometry(playCfg.cycleHalfWidth * 2, playCfg.cycleHalfHeight * 2, playCfg.cycleHalfLength * 2);
        const eEdges = new THREE.EdgesGeometry(eGeo);
        const oMat = new THREE.LineBasicMaterial({ color: 0xff8800, depthTest: false });
        const mesh = new THREE.LineSegments(eEdges, oMat);
        debugEnemyMeshes.push(mesh);
        debugCollisionGroup.add(mesh);
      }
      for (let i = 0; i < enemyRoster.list.length; i++) {
        const e = enemyRoster.list[i];
        const mesh = debugEnemyMeshes[i];
        if (e.eliminated) {
          mesh.visible = false;
        } else {
          mesh.visible = true;
          mesh.position.copy(e.body.position);
          mesh.rotation.y = e.body.userData.heading ?? 0;
        }
      }

      // Update Trails
      const allTiles = [];
      for (const s of trailSources) {
        if (s.map && typeof s.map.getActiveTiles === "function") {
          allTiles.push(...s.map.getActiveTiles());
        }
      }
      const count = Math.min(allTiles.length, 20000);
      debugTrailMesh.count = count;
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const t = allTiles[i];
        dummy.position.set(t.cx, playCfg.world.trailWallHeight * 0.5, t.cz);
        dummy.updateMatrix();
        debugTrailMesh.setMatrixAt(i, dummy.matrix);
      }
      debugTrailMesh.instanceMatrix.needsUpdate = true;

    } else if (debugCollisionGroup) {
      game.scene.remove(debugCollisionGroup);
      debugCollisionGroup.children.forEach(c => {
         if (c.geometry) c.geometry.dispose();
         if (c.material) c.material.dispose();
      });
      debugCollisionGroup = null;
      debugTrailMesh = null;
      debugPlayerMesh = null;
      debugEnemyMeshes.length = 0;
    }
  });

  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");
  const welcomeEl = lobbyBanner.querySelector(".state-banner__welcome");
  const detailEl = lobbyBanner.querySelector(".state-banner__detail");
  const hintEl = lobbyBanner.querySelector(".state-banner__hint");
  if (detailEl instanceof HTMLElement) {
    const lname =
      activeCampaignLevel && typeof activeCampaignLevel.name === "string"
        ? activeCampaignLevel.name
        : "";
    if (isLobby) {
      if (welcomeEl instanceof HTMLElement) welcomeEl.hidden = true;
      if (hintEl instanceof HTMLElement) hintEl.hidden = true;
      detailEl.textContent =
        "You are at the lobby. Wander around, try the power-ups, and when you're ready follow the beacon to start the next level. Win coins by winning levels to upgrade your cycle in the garage. You can also play the daily challenge for extra coins.";
    } else if (isTutorialArena) {
      if (welcomeEl instanceof HTMLElement) {
        welcomeEl.hidden = false;
        welcomeEl.textContent = "Welcome to Tron: Cyber Cycles";
      }
      detailEl.textContent =
        "Avoid the trails, defeat your rival then reach the exit gate to win.";
      if (hintEl instanceof HTMLElement) {
        hintEl.hidden = false;
        hintEl.textContent = "Press W when ready.";
      }
    } else {
      if (welcomeEl instanceof HTMLElement) welcomeEl.hidden = true;
      if (hintEl instanceof HTMLElement) hintEl.hidden = true;
      const title = lname || "Arena";
      const enemyN = enemyRoster.list.length;
      const enemyLine =
        enemyN === 0
          ? "No rival cycles on this map — focus on the course and the exit."
          : `${enemyN} rival cycle${enemyN === 1 ? "" : "s"} on the grid — avoid their trails.`;
      detailEl.textContent = [
        `${title} — ${enemyLine}`,
        "Reach the exit gate to finish. Press W when ready; the timer starts on your first throttle.",
      ].join(" ");
    }
  }

  game.startLoop();
  dismissBootOverlayAfterFirstGamePaint();

  /** P6.9 — after play-test (derez / win / exit), offer quick return to Architect. */
  const editorReturnWrap = document.getElementById("editor-return-to-editor");
  if (editorReturnWrap && isLobby) {
    const pending = peekEditorPlaytestReturn();
    if (pending) {
      editorReturnWrap.hidden = false;
      const openBtn = editorReturnWrap.querySelector("[data-editor-return-open]");
      const dismissBtn = editorReturnWrap.querySelector("[data-editor-return-dismiss]");
      const goEditor = () => {
        setEditorPlaytestReturn(null);
        setSessionBootTarget({ mode: "editor", wipLevelId: pending.levelId });
        silenceDrivingAndProximityAudio();
        game.stopLoop();
        playTunnel(
          game.renderer,
          () => {
            window.location.reload();
          },
          {
            durationSeconds: CONFIG.tunnelGateSeconds,
            onBegin: () => {
              audio.playTunnelTransitionWind();
              clearTrailAndEquipForTunnel();
            },
            devHud,
          },
        ).catch(() => {
          window.location.reload();
        });
      };
      const onDismiss = () => {
        setEditorPlaytestReturn(null);
        editorReturnWrap.hidden = true;
      };
      if (openBtn) openBtn.addEventListener("click", goEditor);
      if (dismissBtn) dismissBtn.addEventListener("click", onDismiss);
    }
  }

  /** P7.5 — first-time controls: modal on first-run tutorial arena; lobby only if tutorial already cleared / migrated save. */
  if (!vjPortalArrival && !save.controlsShown) {
    if (isTutorialArena && save.tutorialCleared === false) {
      showFirstVisitControlsOverlayIfNeeded({ save, venue: "tutorial" });
    } else if (isLobby && save.tutorialCleared !== false) {
      showFirstVisitControlsOverlayIfNeeded({ save, venue: "lobby" });
    }
  }

  canvas.addEventListener("click", () => canvas.focus());
  canvas.focus();
}

main().catch((err) => {
  console.error(err);
  const el = document.createElement("div");
  el.className = "state-banner";
  el.textContent = "BOOT failed — check console.";
  document.body.appendChild(el);
});
