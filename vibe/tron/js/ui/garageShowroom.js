/**
 * P7.3 — Garage showroom: dark void, Tron grid floor, glowing plate, player cycle with
 * short trail preview, slow turntable rotation (plan Phase 7).
 */

import * as THREE from "../vendor/three-module.js";

import { getFloorGridLineStep, mergeDevHud } from "../config.js";
import { createLightCycle } from "../game/cycle.js";

const VOID_BG = 0x050508;
const GRID_MAIN = 0x1a2a44;
const GRID_SEC = 0x0c1424;

/**
 * @param {{
 *   renderer: THREE.WebGLRenderer;
 *   canvas: HTMLCanvasElement;
 *   save: import("../data/savedata.js").PlayerSave;
 *   devHud?: Partial<import("../config.js").DEFAULT_DEV_HUD>;
 * }} opts
 * @returns {{ dispose(): void }}
 */
export function mountGarageShowroom(opts) {
  const { renderer, canvas, save } = opts;
  const devHud = mergeDevHud({ ...save.devHud, ...(opts.devHud ?? {}) });
  const floorStep = getFloorGridLineStep(devHud);
  const cycleHex = typeof save.player.cycleColor === "string" ? save.player.cycleColor : "#00FFFF";
  const trailHex = typeof save.player.trailColor === "string" ? save.player.trailColor : "#00FFFF";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VOID_BG);
  scene.fog = new THREE.FogExp2(VOID_BG, 0.028);

  const ambient = new THREE.AmbientLight(0x6688aa, 0.38);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xaaccff, 0.55);
  key.position.set(3.5, 6, 4);
  scene.add(key);

  const rim = new THREE.PointLight(0x44ffff, 1.1, 32, 1.8);
  rim.position.set(-2.2, 2.8, 2.4);
  scene.add(rim);

  const extent = 96;
  const gridDivs = Math.max(1, Math.round(extent / floorStep));
  const grid = new THREE.GridHelper(extent, gridDivs, GRID_MAIN, GRID_SEC);
  grid.position.y = 0;
  const gm = grid.material;
  if (Array.isArray(gm)) {
    for (const m of gm) {
      m.transparent = true;
      m.opacity = 0.35;
    }
  } else {
    gm.transparent = true;
    gm.opacity = 0.35;
  }
  scene.add(grid);

  const plateGroup = new THREE.Group();
  scene.add(plateGroup);

  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x0a1218,
    metalness: 0.75,
    roughness: 0.35,
    emissive: 0x001820,
    emissiveIntensity: 0.45,
  });
  const plateGeom = new THREE.CylinderGeometry(2.35, 2.5, 0.14, 56);
  const plate = new THREE.Mesh(plateGeom, plateMat);
  plate.position.y = 0.07;
  plateGroup.add(plate);

  const ringGeom = new THREE.TorusGeometry(2.12, 0.045, 10, 80);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 1.35,
    metalness: 0.4,
    roughness: 0.25,
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.145;
  plateGroup.add(ring);

  const cycle = createLightCycle({ devHud, color: cycleHex });
  cycle.root.position.set(0, 0.2, 0);
  scene.add(cycle.root);

  let trailCol = new THREE.Color(trailHex);
  const trailRoot = new THREE.Group();
  trailRoot.position.set(0, 0, -0.06);
  cycle.root.add(trailRoot);

  const nSeg = 8;
  /** @type {THREE.MeshStandardMaterial[]} */
  const trailMats = [];
  for (let i = 0; i < nSeg; i++) {
    const t = i / (nSeg - 1);
    const z = -0.28 - t * 2.45;
    const x = Math.sin(t * Math.PI * 0.5) * 0.42;
    const th = 0.38 + t * 0.22;
    const tw = 0.07 + t * 0.05;
    const tl = 0.34 + t * 0.08;
    const segGeom = new THREE.BoxGeometry(tw, th, tl);
    const segMat = new THREE.MeshStandardMaterial({
      color: trailCol.clone().multiplyScalar(0.25),
      emissive: trailCol.clone(),
      emissiveIntensity: 1.05 + t * 0.35,
      metalness: 0.25,
      roughness: 0.42,
      transparent: true,
      opacity: 0.88 - t * 0.12,
    });
    trailMats.push(segMat);
    const seg = new THREE.Mesh(segGeom, segMat);
    seg.position.set(x, 0.12 + t * 0.06, z);
    seg.rotation.y = Math.sin(t * 1.4) * 0.12;
    trailRoot.add(seg);
  }

  /**
   * @param {string} hex
   */
  function applyTrailPreviewColor(hex) {
    trailCol.set(hex);
    for (let i = 0; i < trailMats.length; i++) {
      const t = i / Math.max(1, trailMats.length - 1);
      const m = trailMats[i];
      m.color.copy(trailCol).multiplyScalar(0.25);
      m.emissive.copy(trailCol);
      m.emissiveIntensity = 1.05 + t * 0.35;
    }
  }

  /**
   * Live-update showroom when save colors change (P7.4).
   * @param {import("../data/savedata.js").PlayerSave} save
   */
  function syncFromSave(save) {
    const ch = typeof save.player.cycleColor === "string" ? save.player.cycleColor : "#00FFFF";
    const th = typeof save.player.trailColor === "string" ? save.player.trailColor : "#00FFFF";
    cycle.setPrimaryColor(ch);
    applyTrailPreviewColor(th);
  }

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(4.6, 2.5, 4.6);
  camera.lookAt(0, 0.45, 0);

  let rafId = 0;
  let lastMs = 0;
  let platePulse = 0;

  function syncSize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = Math.max(canvas.clientHeight || window.innerHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function onResize() {
    syncSize();
  }

  /** @param {number} timeMs */
  function frame(timeMs) {
    rafId = requestAnimationFrame(frame);
    const dt = lastMs > 0 ? Math.min(0.05, (timeMs - lastMs) * 0.001) : 0;
    lastMs = timeMs;

    platePulse += dt * 1.8;
    const pulse = 0.92 + 0.08 * Math.sin(platePulse);
    ringMat.emissiveIntensity = 1.25 * pulse;

    cycle.root.rotation.y += dt * 0.38;
    cycle.update(dt, {
      speed: 16,
      steer: 0,
      accelerating: true,
      braking: false,
      nitroBurstStrength: 0,
      shieldBubbleMode: "off",
    });

    renderer.render(scene, camera);
  }

  syncSize();
  window.addEventListener("resize", onResize);
  rafId = requestAnimationFrame(frame);

  return {
    syncFromSave,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      cycle.dispose();
      plateGeom.dispose();
      plateMat.dispose();
      ringGeom.dispose();
      ringMat.dispose();
      trailRoot.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry?.dispose();
      });
      for (const m of trailMats) m.dispose();
      grid.geometry.dispose();
      const gmat = grid.material;
      if (Array.isArray(gmat)) gmat.forEach((m) => m.dispose());
      else gmat.dispose();
    },
  };
}
