import { World } from "cannon-es";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { AUDIO_AUTOPLAY, CONFIG, mergeRuntimeConfig, TRON_COLORS } from "./config.js";
import { loadOrCreateSave } from "./data/savedata.js";
import { createAudioEngine } from "./engine/audio.js";
import { createGameRenderer } from "./engine/renderer.js";
import { playTunnel, isTunnelBlockingInput } from "./engine/tunnel.js";
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

function initPhysicsWorld() {
  const world = new World();
  world.gravity.set(0, -9.82, 0);
  return world;
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

  initPhysicsWorld();

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
  let lobbyReady = false;
  let playerSpeed = 0;

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

  window.addEventListener("keydown", (e) => {
    if (isTunnelBlockingInput()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = true;
    if (!lobbyReady) return;
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
  });

  window.addEventListener("keyup", (e) => {
    if (isTunnelBlockingInput()) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = false;
  });

  game.setOnFrame(({ dt }) => {
    if (!lobbyReady || dt <= 0) return;
    controls.update();

    const steer = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    const accelerating = !!keys.w;
    const braking = !!keys.s;

    const maxSpeed = 72;
    if (accelerating) {
      playerSpeed = THREE.MathUtils.lerp(
        playerSpeed,
        maxSpeed,
        1 - Math.exp(-2.8 * dt),
      );
    } else if (braking) {
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 0, 1 - Math.exp(-5 * dt));
    } else {
      playerSpeed *= Math.exp(-1.35 * dt);
    }

    const input = {
      speed: playerSpeed,
      steer,
      accelerating,
      braking,
    };
    cycle.update(dt, input);
    enemy.update(dt, {
      ...input,
      speed: maxSpeed * 0.35,
      steer: -steer * 0.6,
    });
  });

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
  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");

  game.startLoop();

  game.camera.position.set(2.2, 1.35, 2.2);
  controls.target.set(0, 0.05, 0);
  controls.update();
  lobbyReady = true;

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
