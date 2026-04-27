import {
  AUDIO_AUTOPLAY,
  CONFIG,
  MUSIC_ASSET_URLS,
  getLobbyMusicUrl,
  getGameplayMusicUrl,
  createRuntimeFromPlayerSave,
  getArenaPlaytestConfig,
} from "./config.js";
import { GameMode, isArenaRideableMode } from "./gameState.js";
import { createChaseCamera } from "./engine/camera.js";
import {
  addCoins,
  isLevelUnlockedLinear,
  loadOrCreateSave,
  persistSave,
  recordLevelComplete,
} from "./data/savedata.js";
import { createAudioEngine } from "./engine/audio.js";
import { getGraphicsProfile } from "./engine/graphicsProfile.js";
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
  applyArenaFloorEnvMap,
  applyArenaStageEnvironment,
  buildArenaFromCampaignLevel,
  runtimeUnlockCampaignExitGate,
} from "./game/arena.js";
import {
  applyExitGateRuntimeOpenVisual,
  computePlayerSpawnFromEntranceGate,
  extractGatesFromWallObjects,
  queryOpenGateAtPosition,
  updateGateAnimations,
  withLobbyArenaGateLock,
  withLobbyRuntimeGateOverrides,
} from "./game/gates.js";
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
import { computePlayerNearMissDistance } from "./game/nearMiss.js";
import {
  extractArenaDimensionsFromLevel,
  findCampaignLevelByCampaignIndex,
  findCampaignLevelById,
  getWipLevelValidated,
  loadCampaignLevels,
  parseCampaignLevelIndex,
  selectPlaytestCampaignLevel,
} from "./levels/loader.js";
import { consumeSessionBootTarget, peekSessionBootTarget, setSessionBootTarget } from "./sessionBoot.js";
import { peekEditorPlaytestReturn, setEditorPlaytestReturn } from "./sessionEditorPlaytest.js";
import { mountEditorDestinationScreen, mountGarageDestinationScreen } from "./ui/garage.js";
import {
  createPauseMenuController,
  isControlsOverlayBlockingInput,
  isPauseOverlayBlockingInput,
  showFirstVisitControlsOverlayIfNeeded,
} from "./ui/menus.js";
import { createDevHudController } from "./ui/devhud.js";
import { createArenaMinimapRenderer } from "./ui/hud.js";
import { LOBBY_LEVEL_ID } from "./levels/schema.js";
import { tickCampaignExitBanners, tickLobbyBannerControllers } from "./game/billboardBanners.js";
import * as THREE from "./vendor/three-module.js";

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

  const save = loadOrCreateSave();
  const runtime = createRuntimeFromPlayerSave(save);

  try {
    await preloadLightCycleAsset();
  } catch {
    /* procedural cycle mesh */
  }

  const campaign = await loadCampaignLevels();

  const bootPeek = peekSessionBootTarget();
  const skipArenaForBoot =
    bootPeek && (bootPeek.mode === "garage" || bootPeek.mode === "editor");

  /** P7.1 / P7.2 — lobby + gate locks, or campaign level after arena gate, or skip arena for garage/editor boot. */
  /** @type {Record<string, unknown> | null} */
  let activeCampaignLevel = null;
  /** @type {{ arenaWidth: number; arenaDepth: number } | undefined} */
  let arenaSizeFromCampaign;
  /** P6.9 — current arena JSON came from WIP play-test boot (validated). */
  let arenaFromWipPlaytest = false;

  if (skipArenaForBoot) {
    arenaSizeFromCampaign = undefined;
  } else if (bootPeek?.mode === "wip_playtest" && typeof bootPeek.levelId === "string") {
    const w = getWipLevelValidated(bootPeek.levelId.trim());
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
      activeCampaignLevel = lobbyLevel;
      arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
    }
  } else if (bootPeek?.mode === "campaign" && typeof bootPeek.levelId === "string") {
    const found = findCampaignLevelById(campaign.validLevels, bootPeek.levelId);
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
    arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
  } else {
    const lobbyOrFallback =
      findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
      selectPlaytestCampaignLevel(campaign.validLevels, save);
    let lobbyLevel = withLobbyRuntimeGateOverrides(lobbyOrFallback, save.progress.currentLevel);
    lobbyLevel = withLobbyArenaGateLock(lobbyLevel, campaign.validLevels, save);
    activeCampaignLevel = lobbyLevel;
    arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);
  }

  const audio = createAudioEngine({
    masterVolume: save.settings.masterVolume,
    musicVolume: save.settings.musicVolume,
    sfxVolume: save.settings.sfxVolume,
    ambientVolume: save.settings.ambientVolume,
    musicCrossfadeSec: runtime.devHud.musicCrossfadeDuration,
    autoplay: AUDIO_AUTOPLAY,
    musicLobbyUrl: getLobbyMusicUrl(runtime.devHud),
    musicGameplayUrl: getGameplayMusicUrl(runtime.devHud),
  });
  audio.unlock();
  for (const url of MUSIC_ASSET_URLS.lobbyVariants) {
    void audio.prefetch(url);
  }
  for (const url of MUSIC_ASSET_URLS.gameplayVariants) {
    void audio.prefetch(url);
  }

  const graphicsProfile = getGraphicsProfile();
  const game = createGameRenderer(canvas, { devHud: runtime.devHud, graphicsProfile });

  const devHud = runtime.devHud; // session-only: Advanced tuning is not written to localStorage (refresh restores defaults)

  /** Refreshes Garage coin UI when dev HUD grants coins (bound in `mountGarageDestinationScreen`). */
  let devEconomyUiRefresh = () => {};

  /** No-op: dev HUD (and same-store visual sliders) are session-only; do not merge into `save` or `persistSave`. */
  function persistDevHudToSave() {}

  await playTunnel(game.renderer, undefined, {
    durationSeconds: CONFIG.tunnelBootSeconds,
    onBegin: () => {
      audio.playTunnelTransitionWind();
    },
    devHud,
  });

  bootOverlay.classList.add("boot-overlay--hidden");

  const bootConsumed = consumeSessionBootTarget();

  if (bootConsumed?.mode === "garage") {
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
    return;
  }
  if (bootConsumed?.mode === "editor") {
    gameMode = GameMode.EDITOR;
    const hud = document.getElementById("cycle-hud");
    const ban = document.getElementById("lobby-placeholder");
    const mm = document.getElementById("hud-minimap-wrap");
    if (hud) hud.hidden = true;
    if (mm) mm.hidden = true;
    if (ban) ban.hidden = true;
    const wipOpen =
      typeof bootConsumed.wipLevelId === "string" ? bootConsumed.wipLevelId : undefined;
    mountEditorDestinationScreen({
      game,
      devHud,
      initialWipLevelId: wipOpen,
      onReturnToLobby: () => {
        window.location.reload();
      },
    });
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

  const gameplayParticles = createGameplayParticles({ scene: game.scene, devHud });

  const enemyRoster = createCampaignEnemyEntities({
    scene: game.scene,
    world,
    playerMat,
    runtime,
    devHud,
    campaignLevel: activeCampaignLevel,
    arenaSize: arenaSizeFromCampaign,
  });

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

  const isLobby =
    activeCampaignLevel && typeof activeCampaignLevel.id === "string"
      ? activeCampaignLevel.id === LOBBY_LEVEL_ID
      : false;

  /** P6.9 — editor play-test: normal level rules, backtick returns to Architect. */
  const isEditorPlaytest = arenaFromWipPlaytest;

  gameMode = isLobby ? GameMode.LOBBY : GameMode.LEVEL;

  try {
    await audio.playMusicProfile(isLobby ? "lobby" : "gameplay");
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
    }
  }

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

  function clearTrailAndEquipForTunnel() {
    trailWall.clear();
    const u = playerBody.userData;
    u.equipSlot = undefined;
    u.equipSlotQueued = undefined;
  }

  /**
   * @param {Record<string, unknown>} nextBoot
   */
  function beginLobbyGateTunnel(nextBoot) {
    audio.playGateEnterHum();
    setEditorPlaytestReturn(null);
    setSessionBootTarget(nextBoot);
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

  let editorShortcutTunnelStarted = false;

  function beginEditorShortcutTunnel() {
    if (editorShortcutTunnelStarted) return;
    editorShortcutTunnelStarted = true;
    audio.playGateEnterHum();
    setEditorPlaytestReturn(null);
    setSessionBootTarget({ mode: "editor" });
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

  const chase = createChaseCamera(game.camera, devHud);
  chase.spawnAt(playerCycle.root.position, spawnHeading);
  const portalWarpSnapPos = new THREE.Vector3();

  let nitroVis = 0;
  const nitroState = createNitroState(effectivePlayerNitroMax());

  const powerupField = createCampaignPowerupField({
    scene: game.scene,
    powerups: activeCampaignLevel && Array.isArray(activeCampaignLevel.powerups) ? activeCampaignLevel.powerups : [],
    devHud,
    spawnPickupBurst: gameplayParticles.spawnPickupBurst,
    pickupVisualDetail: graphicsProfile.pickupVisualDetail,
  });

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
    gameplayParticles.spawnDerezBurst(
      playerBody.position.x,
      playCfg.playerSpawnY,
      playerBody.position.z,
      save.player.cycleColor ?? "#00FFFF",
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
    audio.playDerezShatter();
    audio.tickEngineSound({ active: false, dt: 1 / 60 });
    if (derezOverlay) derezOverlay.hidden = false;
  }

  function startDerezTunnelToLobby() {
    if (playerDerezPhase !== "imploding") return;
    playerDerezPhase = "tunnel";
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
  }

  function beginWinTunnelToLobby() {
    if (winTunnelStarted || playerDerezPhase !== "alive") return;
    audio.playGateEnterHum();
    winTunnelStarted = true;
    game.stopLoop();
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
    if (m instanceof HTMLInputElement) m.value = String(save.settings.masterVolume);
    if (mu instanceof HTMLInputElement) mu.value = String(save.settings.musicVolume);
    if (sx instanceof HTMLInputElement) sx.value = String(save.settings.sfxVolume);
    if (am instanceof HTMLInputElement) am.value = String(save.settings.ambientVolume);
    if (crt instanceof HTMLInputElement) crt.checked = !!devHud.crtScanlines;
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
      if (isTunnelBlockingInput()) return;
      if (isControlsOverlayBlockingInput()) return;
      if (isPauseOverlayBlockingInput()) return;
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
      e.stopPropagation();
      beginEditorShortcutTunnel();
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
        audio.setMusicGameplayUrl(getGameplayMusicUrl(devHud));
        if (!isLobby) {
          void audio.playMusicProfile("gameplay");
        }
      }
    },
    persist: persistDevHudToSave,
    syncHud: syncArenaHud,
    isInputBlocked: () =>
      isTunnelBlockingInput() || isControlsOverlayBlockingInput() || isPauseOverlayBlockingInput(),
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
      gameplayParticles.spawnDerezBurst(
        e.body.position.x,
        playCfg.playerSpawnY,
        e.body.position.z,
        e.color,
      );
      eliminateCampaignEnemy(w, e);
      return;
    }
    beginEnemyCinematicElimination(w, e);
    enemyDerezState = {
      entity: e,
      phase: "approach",
      keyframed: false,
      phaseStartMs: 0,
      implodeSfxDone: false,
      returnFov0: devHud.cameraBaseFov,
      returnFov1: devHud.cameraBaseFov,
    };
  }

  const step = 1 / playCfg.physicsHz;
  /** Hide bottom welcome strip once the player is moving (hub + arena tips). */
  let hubWelcomeBannerVisible = true;
  game.setOnFrame(({ t, dt }) => {
    const floorMat = game.scene.userData.arenaFloorMaterial;
    if (
      floorMat &&
      floorMat.userData &&
      typeof floorMat.userData.emissiveIntensityBase === "number"
    ) {
      const b = floorMat.userData.emissiveIntensityBase;
      floorMat.emissiveIntensity = b * (0.92 + 0.08 * Math.sin(t * 2.15));
    }
    if (isLobby) {
      tickLobbyBannerControllers(game.scene.userData.lobbyBannerControllers, save, campaign.validLevels);
    } else {
      let enemiesRemaining = 0;
      for (const e of enemyRoster.list) {
        if (!e.eliminated) enemiesRemaining++;
      }
      tickCampaignExitBanners(game.scene.userData.lobbyBannerControllers, {
        remaining: enemiesRemaining,
        total: rawEnemyCount,
        complete: exitGateUnlocked,
        coinGained: getPendingLevelCoinAward(getLevelElapsedSecExcludingPauses()),
      });
    }
    if (playerDerezPhase === "imploding") {
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

        audio.tickEngineSound({ active: false, dt });
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
            gameplayParticles.spawnDerezBurst(
              snap.x,
              playCfg.playerSpawnY,
              snap.z,
              e.color,
            );
            audio.playEnemyDerezShatter();
          }
          const tRaw = (now - d.phaseStartMs) / (implodeSec * 1000);
          const visU = Math.min(1, tRaw);
          e.cycle.updateDerezImplosion(dt, visU);
          game.camera.position.copy(enemyKillTo);
          game.camera.lookAt(enemyKillLTo);
          game.camera.fov = devHud.cameraBaseFov;
          game.camera.updateProjectionMatrix();
          if (tRaw >= 1) {
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
      enemyDerezState = null;
    }

    if (playerDerezPhase !== "alive") {
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
    boostPadField.tick(dt, {
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

    trailWall.update(dt, {
      x: playerBody.position.x,
      z: playerBody.position.z,
      heading: playerBody.userData.heading ?? 0,
      speed: playerBody.userData.speed ?? 0,
    });
    updateEnemyTrails(enemyRoster.list, dt);

    const trailSources = buildTrailSources(trailWall, enemyRoster.list);
    const px = playerBody.position.x;
    const pz = playerBody.position.z;

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
      enemyRoster.list.every((e) => e.eliminated)
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
      if (dist < nm && nowMs - lastNearMissMs >= 380) {
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
          open: !g.locked || g.role === "entrance"
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

    playerCycle.update(dt, {
      speed: spd,
      steer,
      accelerating,
      braking,
      nitroBurstStrength: nitroVis,
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

    game.postPipeline.setNitroFx({ strength: nitroVis });
    if (speedLineEl) {
      speedLineEl.style.opacity = String(
        devHud.nitroSpeedLines ? nitroVis * 0.78 : 0,
      );
    }

    /** P9.3 — nitro exhaust, shield shimmer, pickup/portal burst sim (shared system). */
    const nitroEmitters = [
      {
        x: playerBody.position.x,
        y: playCfg.playerSpawnY,
        z: playerBody.position.z,
        heading: playerBody.userData.heading ?? 0,
        strength: nitroVis,
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
  });

  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");
  const p = lobbyBanner.querySelector("p");
  if (p) {
    const lname =
      activeCampaignLevel && typeof activeCampaignLevel.name === "string"
        ? activeCampaignLevel.name
        : "";
    const stage = Math.max(1, Math.floor(save.progress.currentLevel));
    if (isLobby) {
      p.textContent = "Welcome to the lobby. Ride north toward the gates. Clear the arenas to win the game. You can upgrade your motorcycle in the garage.";
    } else {
      const title = lname || "Arena";
      const enemyN = enemyRoster.list.length;
      const enemyLine =
        enemyN === 0
          ? "No rival cycles on this map — focus on the course and the exit."
          : `${enemyN} rival cycle${enemyN === 1 ? "" : "s"} on the grid — avoid their trails.`;
      p.textContent = [
        `${title} — ${enemyLine}`,
        "Reach the exit gate to finish. Press W when ready; the timer starts on your first throttle.",
      ].join(" ");
    }
  }

  game.startLoop();

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

  /** P7.5 — first lobby visit: modal controls reference; blocks cycle keys until dismissed. */
  if (isLobby && !save.controlsShown) {
    showFirstVisitControlsOverlayIfNeeded({ save });
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
