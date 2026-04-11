import { World } from "cannon-es";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { mergeRuntimeConfig, TRON_COLORS } from "./config.js";
import { loadOrCreateSave } from "./data/savedata.js";
import { createGameRenderer } from "./engine/renderer.js";
import { createLightCycle } from "./game/cycle.js";

const BOOT_CAMERA_Z_START = -12;
const BOOT_CAMERA_Z_END = 10;

function $(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Simulated BOOT tasks — exercises save, physics, renderer, and shader warm-up.
 * @param {ReturnType<typeof createGameRenderer>} game
 * @param {{ fill: HTMLElement; label: HTMLElement }} els
 */
async function runBootSequence(game, els) {
  const steps = [
    { name: "save", weight: 12 },
    { name: "physics", weight: 18 },
    { name: "pipeline", weight: 25 },
    { name: "shaders", weight: 25 },
    { name: "grid", weight: 20 },
  ];

  let progress = 0;
  for (const step of steps) {
    await delay(95 + Math.random() * 70);
    progress += step.weight;
    setBootProgress(els, progress);
    const t = progress / 100;
    game.camera.position.z = THREE.MathUtils.lerp(BOOT_CAMERA_Z_START, BOOT_CAMERA_Z_END, t);
    game.camera.lookAt(0, 0, 40 + t * 24);
  }

  await delay(160);
  setBootProgress(els, 100);
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
  game.startLoop();

  const bootEls = { fill: bootFill, label: bootLabel };
  setBootProgress(bootEls, 0);

  await runBootSequence(game, bootEls);

  bootOverlay.classList.add("boot-overlay--hidden");
  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");

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
