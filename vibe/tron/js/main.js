import * as THREE from "three";
import { Vec3 } from "cannon-es";
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
import { applyArenaStageEnvironment, buildArenaPhysics, buildArenaVisuals } from "./game/arena.js";
import { createLightCycle } from "./game/cycle.js";

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

/**
 * @param {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean }} keys
 * @param {AbortSignal} [signal]
 */
function bindArenaMovementKeys(keys, signal) {
  const opts = signal ? { signal } : undefined;
  window.addEventListener(
    "keydown",
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") keys.w = true;
      if (k === "s" || k === "arrowdown") keys.s = true;
      if (k === "a" || k === "arrowleft") keys.a = true;
      if (k === "d" || k === "arrowright") keys.d = true;
      if (e.code === "Space") {
        keys.space = true;
        e.preventDefault();
      }
    },
    opts,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") keys.w = false;
      if (k === "s" || k === "arrowdown") keys.s = false;
      if (k === "a" || k === "arrowleft") keys.a = false;
      if (k === "d" || k === "arrowright") keys.d = false;
      if (e.code === "Space") keys.space = false;
    },
    opts,
  );
}

function applyMovement(playerBody, cfg, keys) {
  const accel = cfg.moveAcceleration;
  const f = new Vec3(0, 0, 0);
  if (keys.w) f.z -= 1;
  if (keys.s) f.z += 1;
  if (keys.a) f.x -= 1;
  if (keys.d) f.x += 1;
  if (f.lengthSquared() < 1e-6) return;
  f.normalize();
  f.scale(accel, f);
  playerBody.applyForce(f, playerBody.position);
}

function clampHorizontalSpeed(playerBody, cfg) {
  const max = cfg.maxMoveSpeed;
  const v = playerBody.velocity;
  const h = Math.hypot(v.x, v.z);
  if (h > max) {
    const s = max / h;
    v.x *= s;
    v.z *= s;
  }
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

  const hudEl = document.getElementById("cycle-hud");
  function syncHud() {
    if (!hudEl) return;
    hudEl.innerHTML = [
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

  const playCfg = getArenaPlaytestConfig(runtime);

  applyArenaStageEnvironment(game, playCfg);
  buildArenaVisuals(game.scene, playCfg);

  const { world, wallMat, floorMat, playerMat } = createPhysicsWorld();
  buildArenaPhysics(world, wallMat, floorMat, playCfg);

  const playerBody = createPlayerBody(playCfg, playerMat);
  playerBody.position.set(0, playCfg.playerRadius + 0.06, 0);
  playerBody.allowSleep = false;
  world.addBody(playerBody);

  const playerMesh = new THREE.Mesh(
    new THREE.SphereGeometry(playCfg.playerRadius, 24, 16),
    new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x004444,
      metalness: 0.3,
      roughness: 0.35,
    }),
  );
  game.scene.add(playerMesh);

  const arenaKeys = { w: false, a: false, s: false, d: false, space: false };
  bindArenaMovementKeys(arenaKeys);

  const chase = createChaseCamera(game.camera, devHud);
  chase.spawnAt(playerMesh.position);

  let nitroBurstTimer = 0;
  let nitroVis = 0;
  let prevSpace = false;

  const speedLineEl = document.getElementById("nitro-speed-lines");

  const arenaHudAbort = new AbortController();
  const asig = { signal: arenaHudAbort.signal };

  function syncArenaHud() {
    if (!hudEl) return;
    hudEl.innerHTML = [
      "W/A/S/D — move · Space — nitro burst (camera + FX demo)",
      "5 / 6 / 7 / 8 — toggle nitro FOV · pullback · speed lines · motion blur",
      `FX: fov ${devHud.nitroFovWiden ? "on" : "off"} · pull ${devHud.nitroCameraPullBack ? "on" : "off"} · lines ${devHud.nitroSpeedLines ? "on" : "off"} · blur ${devHud.nitroMotionBlur ? "on" : "off"}`,
    ].join("<br/>");
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
    applyMovement(playerBody, playCfg, arenaKeys);
    world.step(step, dt, 10);
    applyContinuousArenaWallSlide(playerBody, playCfg);
    clampHorizontalSpeed(playerBody, playCfg);
    playerMesh.position.set(playerBody.position.x, playerBody.position.y, playerBody.position.z);

    const spaceNow = arenaKeys.space;
    if (spaceNow && !prevSpace && nitroBurstTimer <= 0) {
      nitroBurstTimer = devHud.nitroBurstDuration;
    }
    prevSpace = spaceNow;
    nitroBurstTimer = Math.max(0, nitroBurstTimer - dt);
    const raw = nitroBurstTimer > 0 ? 1 : 0;
    nitroVis += (raw - nitroVis) * (1 - Math.exp(-16 * dt));

    chase.update(dt, {
      playerPos: playerMesh.position,
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
      "P1.4 chase camera — third-person follow + nitro FOV / pullback / speed lines / motion blur (see HUD).";
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
