import * as THREE from "three";
import { Vec3 } from "cannon-es";

import { CONFIG, getArenaPlaytestConfig, mergeRuntimeConfig } from "./config.js";
import { loadOrCreateSave } from "./data/savedata.js";
import { createGameRenderer } from "./engine/renderer.js";
import { playTunnel } from "./engine/tunnel.js";
import {
  applyContinuousArenaWallSlide,
  createPhysicsWorld,
  createPlayerBody,
} from "./engine/physics.js";
import { applyArenaStageEnvironment, buildArenaPhysics, buildArenaVisuals } from "./game/arena.js";

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

function bindMovementKeys(keys) {
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.w = true;
    if (k === "s" || k === "arrowdown") keys.s = true;
    if (k === "a" || k === "arrowleft") keys.a = true;
    if (k === "d" || k === "arrowright") keys.d = true;
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") keys.w = false;
    if (k === "s" || k === "arrowdown") keys.s = false;
    if (k === "a" || k === "arrowleft") keys.a = false;
    if (k === "d" || k === "arrowright") keys.d = false;
  });
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
  const playCfg = getArenaPlaytestConfig(runtime);

  const game = createGameRenderer(canvas, { devHud: runtime.devHud });

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

  const keys = { w: false, a: false, s: false, d: false };
  bindMovementKeys(keys);

  const step = 1 / playCfg.physicsHz;
  game.setOnFrame(({ dt }) => {
    applyMovement(playerBody, playCfg, keys);
    world.step(step, dt, 10);
    applyContinuousArenaWallSlide(playerBody, playCfg);
    clampHorizontalSpeed(playerBody, playCfg);
    playerMesh.position.set(playerBody.position.x, playerBody.position.y, playerBody.position.z);
  });

  game.startLoop();

  lobbyBanner.hidden = false;
  lobbyBanner.classList.remove("state-banner--hidden");
  const p = lobbyBanner.querySelector("p");
  if (p) {
    p.textContent =
      "P1.2 arena — WASD moves the proxy sphere; wall slide uses sin(impactAngle) damping per plan.";
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
