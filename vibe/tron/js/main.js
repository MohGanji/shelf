import {
  AUDIO_AUTOPLAY,
  CONFIG,
  createRuntimeFromPlayerSave,
  getArenaPlaytestConfig,
  mergeDevHud,
} from "./config.js";
import { createChaseCamera } from "./engine/camera.js";
import { loadOrCreateSave, persistSave } from "./data/savedata.js";
import { createAudioEngine } from "./engine/audio.js";
import { createGameRenderer } from "./engine/renderer.js";
import { isTunnelBlockingInput, playTunnel } from "./engine/tunnel.js";
import {
  applyContinuousArenaWallSlide,
  applyContinuousBarrierSlide,
  createPhysicsWorld,
  createPlayerBody,
} from "./engine/physics.js";
import { createTronCycleKeyState } from "./engine/input.js";
import { applyArenaStageEnvironment, buildArenaFromCampaignLevel } from "./game/arena.js";
import {
  computePlayerSpawnFromEntranceGate,
  extractGatesFromWallObjects,
  updateGateAnimations,
  withLobbyRuntimeGateOverrides,
} from "./game/gates.js";
import { createLightCycle } from "./game/cycle.js";
import { syncHeadingSpeedFromVelocity } from "./game/playerMovement.js";
import { tickPlayerArcadeDrive } from "./game/playerDrive.js";
import { createNitroState } from "./game/nitroSystem.js";
import { createBoostPadField, createPortalField } from "./game/objects.js";
import { createCampaignPowerupField, refillNitroBars } from "./game/powerups.js";
import { createTrailWallSystem } from "./game/trail.js";
import {
  applyEnemyWallAndBarrierSlide,
  createCampaignEnemyEntities,
  eliminateCampaignEnemy,
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
  findCampaignLevelById,
  loadCampaignLevels,
  selectPlaytestCampaignLevel,
} from "./levels/loader.js";
import { LOBBY_LEVEL_ID } from "./levels/schema.js";

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

/**
 * @param {{ fill: HTMLElement; label: HTMLElement }} els
 * @param {number} pct 0–100
 */
function setBootProgress(els, pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  els.fill.style.width = `${clamped}%`;
  els.label.setAttribute("aria-valuenow", String(Math.round(clamped)));
}

async function main() {
  const canvas = /** @type {HTMLCanvasElement} */ ($("game-canvas"));
  const bootOverlay = $("boot-overlay");
  const lobbyBanner = $("lobby-placeholder");
  const bootEls = { fill: $("boot-progress-fill"), label: $("boot-progress-label") };

  setBootProgress(bootEls, 4);

  const save = loadOrCreateSave();
  setBootProgress(bootEls, 18);
  const runtime = createRuntimeFromPlayerSave(save);

  const campaign = await loadCampaignLevels();
  setBootProgress(bootEls, 44);
  /** P7.1 — BOOT → lobby (`level-0`) when present; else fall back to legacy playtest picker. */
  const lobbyOrFallback =
    findCampaignLevelById(campaign.validLevels, LOBBY_LEVEL_ID) ??
    selectPlaytestCampaignLevel(campaign.validLevels, save);
  const activeCampaignLevel = withLobbyRuntimeGateOverrides(lobbyOrFallback, save.progress.currentLevel);
  const arenaSizeFromCampaign = extractArenaDimensionsFromLevel(activeCampaignLevel);

  const audio = createAudioEngine({
    masterVolume: save.settings.masterVolume,
    musicVolume: save.settings.musicVolume,
    sfxVolume: save.settings.sfxVolume,
    ambientVolume: save.settings.ambientVolume,
    musicCrossfadeSec: runtime.devHud.musicCrossfadeDuration,
    autoplay: AUDIO_AUTOPLAY,
  });
  setBootProgress(bootEls, 58);
  await audio.unlock();
  setBootProgress(bootEls, 74);

  const game = createGameRenderer(canvas, { devHud: runtime.devHud });
  setBootProgress(bootEls, 86);

  const devHud = runtime.devHud; // single mutable runtime HUD — keep in sync with save via persistDevHudToSave

  /** Persist full merged devHud so keyboard tweaks survive reload (plan § Config Override Chain). */
  function persistDevHudToSave() {
    save.devHud = mergeDevHud({ ...devHud });
    persistSave(save);
  }

  const durationMs = CONFIG.tunnelBootSeconds * 1000;
  const rampT0 = performance.now();
  /** @type {ReturnType<typeof setInterval> | 0} */
  let rampIv = setInterval(() => {
    const u = Math.min(1, (performance.now() - rampT0) / durationMs);
    setBootProgress(bootEls, 86 + 13 * u);
    if (u >= 1) {
      clearInterval(rampIv);
      rampIv = 0;
    }
  }, 40);

  try {
    await playTunnel(
      game.renderer,
      () => {
        setBootProgress(bootEls, 100);
      },
      { durationSeconds: CONFIG.tunnelBootSeconds },
    );
  } finally {
    if (rampIv) clearInterval(rampIv);
  }

  bootOverlay.classList.add("boot-overlay--hidden");

  const playCfg = getArenaPlaytestConfig(runtime, save.player.attributes, arenaSizeFromCampaign);
  /** Shallow copy so P3.1 can override `nitroBarCount` per level bonuses without mutating `playCfg`. */
  const playerDriveCfg = { ...playCfg };
  /** Trail Length attribute cap + Trail Extend pickups (P3.3) — segments. */
  let levelTrailExtendBonus = 0;
  /** Nitro Bars attribute cap + Nitro Capacity+ pickups (P3.3) — discrete bars. */
  let levelExtraNitroBars = 0;

  function effectivePlayerNitroMax() {
    return playCfg.nitroBarCount + levelExtraNitroBars;
  }

  applyArenaStageEnvironment(game, playCfg);

  const { world, wallMat, floorMat, playerMat } = createPhysicsWorld();
  buildArenaFromCampaignLevel(game.scene, world, wallMat, floorMat, playCfg, activeCampaignLevel);

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

  /** Plan X3: campaign arenas stay frozen until first W; lobby allows immediate riding. */
  let levelStarted = isLobby;
  /** @type {number} */
  let levelStartMonotonicMs = 0;

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

  const playerCycle = createLightCycle({ devHud });
  playerCycle.root.position.set(spawnX, playCfg.playerSpawnY, spawnZ);
  playerCycle.root.rotation.y = spawnHeading;
  game.scene.add(playerCycle.root);

  const trailWall = createTrailWallSystem({
    color: save.player.trailColor ?? "#00FFFF",
    devHud,
    world: playCfg.world,
    maxSegments: playCfg.trailMaxSegments,
    arenaWidth: playCfg.arenaWidth,
    arenaDepth: playCfg.arenaDepth,
    ownerId: "player",
  });
  game.scene.add(trailWall.root);

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

  let nitroVis = 0;
  const nitroState = createNitroState(effectivePlayerNitroMax());

  const powerupField = createCampaignPowerupField({
    scene: game.scene,
    powerups: activeCampaignLevel && Array.isArray(activeCampaignLevel.powerups) ? activeCampaignLevel.powerups : [],
    devHud,
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
  });

  const speedLineEl = document.getElementById("nitro-speed-lines");
  const hudSpeedEl = document.getElementById("hud-speed");
  const hudTrailEl = document.getElementById("hud-trail");
  const hudNitroEl = document.getElementById("hud-nitro");
  const hudHintEl = document.getElementById("hud-hint");
  const hudTimerWrap = document.getElementById("hud-timer-wrap");
  const hudTimerEl = document.getElementById("hud-timer");

  const arenaHudAbort = new AbortController();
  const asig = { signal: arenaHudAbort.signal };

  const derezOverlay = document.getElementById("derez-overlay");
  /** @type {'alive' | 'imploding' | 'tunnel'} */
  let playerDerezPhase = "alive";
  /** Monotonic ms when player derez implosion began (wall clock). */
  let playerDerezT0Ms = 0;
  /** P2.5 — throttle near-miss SFX (same `nearMissDistance` band). */
  let lastNearMissMs = 0;

  function beginPlayerDerezSequence() {
    if (playerDerezPhase !== "alive") return;
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
    if (derezOverlay) derezOverlay.hidden = false;
  }

  function startDerezTunnelToLobby() {
    if (playerDerezPhase !== "imploding") return;
    playerDerezPhase = "tunnel";
    game.postPipeline.setDerezPostFx({ glitch: 0, flash: 0 });
    game.stopLoop();
    playTunnel(game.renderer, () => {
      window.location.reload();
    }, { durationSeconds: CONFIG.tunnelGateSeconds }).catch(() => {
      window.location.reload();
    });
  }

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

  function syncArenaHud() {
    if (hudHintEl) {
      hudHintEl.textContent = isLobby
        ? "Lobby — ride freely. X3 spawn: south entrance gate, facing inward."
        : levelStarted
          ? "Arena — timer runs after first W (X3). A3 tile map; red trail # = lethal tile preview."
          : "Press W to start — timer and movement begin together (X3).";
    }
    if (hudTimerWrap) {
      hudTimerWrap.hidden = isLobby;
    }
    renderNitroHud();
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (isTunnelBlockingInput()) return;
      const k = e.key;
      if (k === "5") {
        devHud.nitroFovWiden = !devHud.nitroFovWiden;
        syncArenaHud();
        game.applyDevHud({ nitroFovWiden: devHud.nitroFovWiden });
        persistDevHudToSave();
      }
      if (k === "6") {
        devHud.nitroCameraPullBack = !devHud.nitroCameraPullBack;
        syncArenaHud();
        game.applyDevHud({ nitroCameraPullBack: devHud.nitroCameraPullBack });
        persistDevHudToSave();
      }
      if (k === "7") {
        devHud.nitroSpeedLines = !devHud.nitroSpeedLines;
        syncArenaHud();
        game.applyDevHud({ nitroSpeedLines: devHud.nitroSpeedLines });
        persistDevHudToSave();
      }
      if (k === "8") {
        devHud.nitroMotionBlur = !devHud.nitroMotionBlur;
        syncArenaHud();
        game.applyDevHud({ nitroMotionBlur: devHud.nitroMotionBlur });
        persistDevHudToSave();
      }
    },
    asig,
  );

  syncArenaHud();

  const step = 1 / playCfg.physicsHz;
  game.setOnFrame(({ dt }) => {
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
      return;
    }

    if (playerDerezPhase !== "alive") {
      return;
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
    });
    enemyRoster.tick(dt, {
      levelStarted,
      isLobby,
      playerBody,
      playerTrail: trailWall,
      devHud,
    });
    world.step(step, dt, 10);
    applyContinuousArenaWallSlide(playerBody, playCfg, game.scene.userData.openGateFootprints);
    applyContinuousBarrierSlide(playerBody, game.scene.userData.barrierBodies, playCfg);
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
      apply: {
        onPlayerNitroRecharge: () => {
          refillNitroBars(nitroState, effectivePlayerNitroMax());
        },
        onPlayerTrailExtend: () => {
          levelTrailExtendBonus += typeof devHud.trailExtendAmount === "number" ? devHud.trailExtendAmount : 10;
          trailWall.setMaxSegments(playCfg.trailMaxSegments + levelTrailExtendBonus);
        },
        onPlayerNitroCapacity: () => {
          const add =
            typeof devHud.nitroCapacityPlusAmount === "number" ? devHud.nitroCapacityPlusAmount : 1;
          levelExtraNitroBars += add;
          refillNitroBars(nitroState, effectivePlayerNitroMax());
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

    const playerTrailHit = tryTrailHitOnBody(playerBody, px, pz, "player", trailSources, devHud);
    if (playerTrailHit === "lethal") {
      beginPlayerDerezSequence();
    } else if (playerTrailHit === "absorbed") {
      playerBody.userData.shieldPhase = "none";
      playerBody.userData.shieldDeployRemain = 0;
      playerBody.userData.shieldActiveRemain = 0;
      playerBody.userData.shieldActive = false;
      audio.playShieldShatterClang();
      promoteShieldQueue();
    } else {
      for (const e of enemyRoster.list) {
        if (e.eliminated) continue;
        const ht = tryTrailHitOnBody(e.body, e.body.position.x, e.body.position.z, e.id, trailSources, devHud);
        if (ht === "lethal") eliminateCampaignEnemy(world, e);
      }

      if (!playerBody.userData.tronEliminated) {
        for (const e of enemyRoster.list) {
          if (e.eliminated) continue;
          const out = evaluateCyclePairContact(playerBody, e.body, playCfg, devHud);
          if (!out) continue;
          if (out.derezA) beginPlayerDerezSequence();
          if (out.derezB) eliminateCampaignEnemy(world, e);
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
            if (out.derezA) eliminateCampaignEnemy(world, a);
            if (out.derezB) eliminateCampaignEnemy(world, b);
          }
        }
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
      const elapsedSec =
        levelStarted && levelStartMonotonicMs > 0
          ? (performance.now() - levelStartMonotonicMs) / 1000
          : 0;
      hudTimerEl.textContent = formatHudMmSs(elapsedSec);
    }
    if (hudTrailEl) {
      hudTrailEl.textContent = String(trailWall.getActiveSegmentCount());
      const previewHit = tryTrailHitOnBody(
        { userData: {} },
        playerBody.position.x,
        playerBody.position.z,
        "player",
        trailSources,
        devHud,
      );
      hudTrailEl.classList.toggle(
        "cycle-hud__trail--tile-hit",
        previewHit === "lethal",
      );
    }
    renderNitroHud();

    const h = playerBody.userData.heading ?? 0;
    playerCycle.root.position.set(
      playerBody.position.x,
      playerBody.position.y,
      playerBody.position.z,
    );
    playerCycle.root.rotation.y = h;

    const steer =
      (arenaKeys.d ? 1 : 0) - (arenaKeys.a ? 1 : 0);
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
    });

    game.postPipeline.setNitroFx({ strength: nitroVis });
    if (speedLineEl) {
      speedLineEl.style.opacity = String(
        devHud.nitroSpeedLines ? nitroVis * 0.78 : 0,
      );
    }
  });

  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");
  const p = lobbyBanner.querySelector("p");
  if (p) {
    const lid =
      activeCampaignLevel && typeof activeCampaignLevel.id === "string"
        ? activeCampaignLevel.id
        : "—";
    const lname =
      activeCampaignLevel && typeof activeCampaignLevel.name === "string"
        ? activeCampaignLevel.name
        : "";
    const sz = arenaSizeFromCampaign
      ? `${Math.round(arenaSizeFromCampaign.arenaWidth)}×${Math.round(arenaSizeFromCampaign.arenaDepth)} u`
      : "default size";
    p.textContent = [
      `P5.3 — Arena from campaign JSON (${lid}${lname ? ` — ${lname}` : ""}, ${sz}).`,
      isLobby
        ? `P7.1 — Lobby: 400×200, four gates, no enemies; timer hidden. Arena gate sign → ENTER ARENA ${save.progress.currentLevel}.`
        : "X3 — Spawn at entrance gate (2 u inward), facing inward. Press W to start + timer.",
      "P5.6 — Gates: open cuts wall; locked slides. P2.2 — trail fade.",
      `P4.1–P4.4 — Enemies: ${enemyRoster.list.length} cycle(s); frozen until first W; hunt + trail/wall/peer separation (avoidance range, reaction time).`,
    ].join(" ");
  }

  game.startLoop();

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
