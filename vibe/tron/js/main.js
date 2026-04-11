import { World } from "cannon-es";
import * as THREE from "three";

import { mergeRuntimeConfig } from "./config.js";
import { loadOrCreateSave } from "./data/savedata.js";
import { createGameRenderer } from "./engine/renderer.js";

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
  game.startLoop();

  const bootEls = { fill: bootFill, label: bootLabel };
  setBootProgress(bootEls, 0);

  await runBootSequence(game, bootEls);

  bootOverlay.classList.add("boot-overlay--hidden");
  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");
}

main().catch((err) => {
  console.error(err);
  const el = document.createElement("div");
  el.className = "state-banner";
  el.textContent = "BOOT failed — check console.";
  document.body.appendChild(el);
});
