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
} from "./game/gates.js";
import { createLightCycle } from "./game/cycle.js";
import { syncHeadingSpeedFromVelocity } from "./game/playerMovement.js";
import { tickPlayerArcadeDrive } from "./game/playerDrive.js";
import { createNitroState } from "./game/nitroSystem.js";
import { createTrailWallSystem } from "./game/trail.js";
import {
  applyEnemyWallAndBarrierSlide,
  createCampaignEnemyEntities,
  syncEnemyHeadingSpeed,
  updateEnemyCycleMeshes,
  updateEnemyTrails,
} from "./game/enemies.js";
import {
  extractArenaDimensionsFromLevel,
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
  const activeCampaignLevel = selectPlaytestCampaignLevel(campaign.validLevels, save);
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

  const chase = createChaseCamera(game.camera, devHud);
  chase.spawnAt(playerCycle.root.position, spawnHeading);

  let nitroVis = 0;
  const nitroState = createNitroState(playCfg.nitroBarCount);

  const speedLineEl = document.getElementById("nitro-speed-lines");
  const hudSpeedEl = document.getElementById("hud-speed");
  const hudTrailEl = document.getElementById("hud-trail");
  const hudNitroEl = document.getElementById("hud-nitro");
  const hudHintEl = document.getElementById("hud-hint");
  const hudTimerWrap = document.getElementById("hud-timer-wrap");
  const hudTimerEl = document.getElementById("hud-timer");

  const arenaHudAbort = new AbortController();
  const asig = { signal: arenaHudAbort.signal };

  function renderNitroHud() {
    if (!hudNitroEl) return;
    const max = Math.max(1, playCfg.nitroBarCount);
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
    if (!levelStarted && !isLobby && arenaKeys.w) {
      levelStarted = true;
      levelStartMonotonicMs = performance.now();
      const fn = game.scene.userData.onLevelStart;
      if (typeof fn === "function") fn();
      syncArenaHud();
    }

    const { nitroBurstActive: nitroOn } = tickPlayerArcadeDrive({
      body: playerBody,
      dt,
      keys: arenaKeys,
      nitroState,
      playCfg,
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
      const tileHit = trailWall.getTrailTileMap().evaluateCollision(
        playerBody.position.x,
        playerBody.position.z,
        "player",
        trailWall.getLogicalEdgeCount(),
        devHud.trailImmunitySegments,
      );
      hudTrailEl.classList.toggle(
        "cycle-hud__trail--tile-hit",
        tileHit === "own-lethal" || tileHit === "other-trail",
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
    playerCycle.update(dt, {
      speed: spd,
      steer,
      accelerating,
      braking,
      nitroBurstStrength: nitroVis,
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
      "X3 — Spawn at entrance gate (2 u inward), facing inward; lobby: free ride. Arenas: press W to start + timer.",
      "P5.6 — Gates: open cuts wall; locked slides. P2.2 — trail fade.",
      `P4.1–P4.3 — Enemies: ${enemyRoster.list.length} cycle(s); frozen until first W, then trail/wall avoidance + hunt (intercept, flank, aggression).`,
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
