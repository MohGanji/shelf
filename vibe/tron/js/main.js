import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  AUDIO_AUTOPLAY,
  CONFIG,
  getArenaPlaytestConfig,
  mergeRuntimeConfig,
  TRON_COLORS,
} from "./config.js";
import { createChaseCamera } from "./engine/camera.js";
import { loadOrCreateSave } from "./data/savedata.js";
import { createAudioEngine } from "./engine/audio.js";
import { createGameRenderer } from "./engine/renderer.js";
import { isTunnelBlockingInput, playTunnel } from "./engine/tunnel.js";
import {
  applyContinuousArenaWallSlide,
  createPhysicsWorld,
  createPlayerBody,
} from "./engine/physics.js";
import { createTronCycleKeyState } from "./engine/input.js";
import { applyArenaStageEnvironment, buildArenaPhysics, buildArenaVisuals } from "./game/arena.js";
import { createLightCycle } from "./game/cycle.js";
import {
  integratePlayerCycleMovement,
  syncHeadingSpeedFromVelocity,
} from "./game/playerMovement.js";
import {
  createNitroState,
  getSpeedReturnForMovement,
  isNitroBurstActive,
  updateNitroBattery,
} from "./game/nitroSystem.js";

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
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

/** Advance BOOT bar while `playTunnel` runs. */
function runBootLoadingBar(durationMs, els) {
  const t0 = performance.now();
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const p = Math.min(100, (t / durationMs) * 100);
    setBootProgress(els, p);
    if (p >= 100) clearInterval(iv);
  }, 40);
  return () => clearInterval(iv);
}

async function main() {
  const canvas = /** @type {HTMLCanvasElement} */ ($("game-canvas"));
  const bootOverlay = $("boot-overlay");
  const lobbyBanner = $("lobby-placeholder");
  const bootFill = $("boot-progress-fill");
  const bootLabel = $("boot-progress-label");

  const save = loadOrCreateSave();
  const runtime = mergeRuntimeConfig(save.devHud ?? {});

  const audio = createAudioEngine({
    masterVolume: save.settings.masterVolume,
    musicVolume: save.settings.musicVolume,
    sfxVolume: save.settings.sfxVolume,
    ambientVolume: save.settings.ambientVolume,
    musicCrossfadeSec: runtime.devHud.musicCrossfadeDuration,
    autoplay: AUDIO_AUTOPLAY,
  });
  await audio.unlock();

  const game = createGameRenderer(canvas, { devHud: runtime.devHud });

  const grid = new THREE.GridHelper(12, 24, 0x1a3a55, 0x0c1828);
  grid.position.y = -0.52;
  game.scene.add(grid);

  const devHud = runtime.devHud;
  const cycle = createLightCycle({ devHud });
  const enemy = createLightCycle({ variant: "enemy", devHud });
  cycle.root.position.set(-0.65, 0, 0);
  enemy.root.position.set(0.75, 0, 0);
  game.scene.add(cycle.root, enemy.root);

  const controls = new OrbitControls(game.camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.05, 0);
  controls.maxPolarAngle = Math.PI * 0.49;

  const keys = /** @type {Record<string, boolean>} */ ({});

  const cycleInputAbort = new AbortController();
  const sig = { signal: cycleInputAbort.signal };

  const hudHintBoot = document.getElementById("hud-hint");
  function syncHud() {
    if (!hudHintBoot) return;
    hudHintBoot.innerHTML = [
      "W/S accelerate · brake · A/D steer",
      "T / P / L — toggle tilt · pitch-on-accel · lean-on-brake",
      "1 / 2 — player cyan · enemy orange (player cycle)",
      `tilt ${devHud.cycleTiltOnSteer ? "on" : "off"} · pitch ${devHud.cyclePitchOnAccel ? "on" : "off"} · lean ${devHud.cycleLeanOnBrake ? "on" : "off"}`,
    ].join("<br/>");
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (isTunnelBlockingInput()) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys[k] = true;
      if (k === "t") {
        devHud.cycleTiltOnSteer = !devHud.cycleTiltOnSteer;
        syncHud();
      }
      if (k === "p") {
        devHud.cyclePitchOnAccel = !devHud.cyclePitchOnAccel;
        syncHud();
      }
      if (k === "l") {
        devHud.cycleLeanOnBrake = !devHud.cycleLeanOnBrake;
        syncHud();
      }
      if (k === "1") cycle.setPrimaryColor(TRON_COLORS.playerCycle);
      if (k === "2") cycle.setPrimaryColor(TRON_COLORS.enemyCycle);
    },
    sig,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (isTunnelBlockingInput()) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys[k] = false;
    },
    sig,
  );

  syncHud();

  const bootEls = { fill: bootFill, label: bootLabel };
  setBootProgress(bootEls, 0);
  const durationMs = CONFIG.tunnelBootSeconds * 1000;
  const stopBar = runBootLoadingBar(durationMs, bootEls);

  await playTunnel(
    game.renderer,
    () => {
      stopBar();
      setBootProgress(bootEls, 100);
    },
    { durationSeconds: CONFIG.tunnelBootSeconds },
  );

  bootOverlay.classList.add("boot-overlay--hidden");

  cycleInputAbort.abort();
  game.scene.remove(grid);
  game.scene.remove(cycle.root, enemy.root);
  controls.dispose();

  const playCfg = getArenaPlaytestConfig(runtime, save.player.attributes);

  applyArenaStageEnvironment(game, playCfg);
  buildArenaVisuals(game.scene, playCfg);

  const { world, wallMat, floorMat, playerMat } = createPhysicsWorld();
  buildArenaPhysics(world, wallMat, floorMat, playCfg);

  const playerBody = createPlayerBody(playCfg, playerMat);
  playerBody.position.set(0, playCfg.playerRadius + 0.06, 0);
  playerBody.allowSleep = false;
  world.addBody(playerBody);

  const playerCycle = createLightCycle({ devHud });
  game.scene.add(playerCycle.root);

  const { state: arenaKeys } = createTronCycleKeyState();

  const chase = createChaseCamera(game.camera, devHud);
  chase.spawnAt(playerCycle.root.position);

  let nitroVis = 0;
  const nitroState = createNitroState(playCfg.nitroBarCount);

  const speedLineEl = document.getElementById("nitro-speed-lines");
  const hudSpeedEl = document.getElementById("hud-speed");
  const hudNitroEl = document.getElementById("hud-nitro");
  const hudHintEl = document.getElementById("hud-hint");

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
      hudHintEl.textContent =
        "P1.6 nitro — discrete bars, hold Space to chain, recharge over time · 5–8 toggles nitro camera FX";
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
      }
      if (k === "6") {
        devHud.nitroCameraPullBack = !devHud.nitroCameraPullBack;
        syncArenaHud();
        game.applyDevHud({ nitroCameraPullBack: devHud.nitroCameraPullBack });
      }
      if (k === "7") {
        devHud.nitroSpeedLines = !devHud.nitroSpeedLines;
        syncArenaHud();
        game.applyDevHud({ nitroSpeedLines: devHud.nitroSpeedLines });
      }
      if (k === "8") {
        devHud.nitroMotionBlur = !devHud.nitroMotionBlur;
        syncArenaHud();
        game.applyDevHud({ nitroMotionBlur: devHud.nitroMotionBlur });
      }
    },
    asig,
  );

  syncArenaHud();

  const step = 1 / playCfg.physicsHz;
  game.setOnFrame(({ dt }) => {
    const spd0 = typeof playerBody.userData.speed === "number" ? playerBody.userData.speed : 0;

    updateNitroBattery({
      state: nitroState,
      dt,
      space: arenaKeys.space,
      maxBars: playCfg.nitroBarCount,
      burstDuration: devHud.nitroBurstDuration,
      rechargeTime: devHud.nitroBarRechargeTime,
      nitroSpeedReturnTime: devHud.nitroSpeedReturnTime,
      topSpeed: playCfg.maxMoveSpeed,
      holdingGas: arenaKeys.w,
      currentSpeed: spd0,
      onEmptyPress: () => {
        audio.playNitroEmptyBuzz();
      },
    });

    const nitroOn = isNitroBurstActive(nitroState);
    const handleFactor = nitroOn ? devHud.nitroHandlingMultiplier : 1;
    const speedReturn = getSpeedReturnForMovement(nitroState);

    integratePlayerCycleMovement(playerBody, dt, arenaKeys, nitroOn, playCfg, devHud, {
      nitroHandlingFactor: handleFactor,
      speedReturn,
    });
    world.step(step, dt, 10);
    applyContinuousArenaWallSlide(playerBody, playCfg);
    syncHeadingSpeedFromVelocity(playerBody);

    const raw = nitroOn ? 1 : 0;
    nitroVis += (raw - nitroVis) * (1 - Math.exp(-16 * dt));

    if (hudSpeedEl) {
      const spd = playerBody.userData.speed ?? 0;
      hudSpeedEl.textContent = String(Math.round(spd));
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
    p.textContent =
      "P1.6 — full nitro battery (bars, chain, recharge) + attribute-based speed/handling (see HUD).";
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
