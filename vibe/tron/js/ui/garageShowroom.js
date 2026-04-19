/**
 * P7.3 — Garage showroom: dark void, Tron grid floor, glowing plate, player cycle with
 * short trail preview, slow turntable rotation (plan Phase 7).
 */

import * as THREE from "../vendor/three-module.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

import { CYCLE_BOUNDS, WORLD, getFloorGridLineStep, mergeDevHud } from "../config.js";
import { createLightCycle } from "../game/cycle.js";

/**
 * Same construction as `trail.js` `buildSegmentMeshes`: thin vertical wall boxes along a polyline on XZ.
 * @param {THREE.Vector3[]} path — monotonic samples; y flattened to 0
 * @param {number} thick
 * @param {number} wallH
 */
function mergeTrailWallAlongPath(path, thick, wallH) {
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const halfH = wallH * 0.5;

  /** @type {THREE.BufferGeometry[]} */
  const parts = [];

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const chord = Math.hypot(dx, dz);
    if (chord < 1e-5) continue;

    const divisions = Math.max(4, Math.min(64, Math.ceil(chord * 12)));
    for (let j = 0; j < divisions; j++) {
      const t0 = j / divisions;
      const t1 = (j + 1) / divisions;
      tmpA.lerpVectors(a, b, t0);
      tmpB.lerpVectors(a, b, t1);
      const sdx = tmpB.x - tmpA.x;
      const sdz = tmpB.z - tmpA.z;
      const slen = Math.hypot(sdx, sdz);
      if (slen < 1e-5) continue;

      const geom = new THREE.BoxGeometry(thick, wallH, slen);
      const mx = (tmpA.x + tmpB.x) * 0.5;
      const mz = (tmpA.z + tmpB.z) * 0.5;
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(sdx, sdz));
      pos.set(mx, halfH, mz);
      mat.compose(pos, quat, scaleOne);
      geom.applyMatrix4(mat);
      parts.push(geom);
    }
  }

  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged;
}

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
  /** Rear attachment: past rear wheel (+Z is forward on the cycle). */
  const L = CYCLE_BOUNDS.length;
  trailRoot.position.set(0, 0.12, -L * 0.58);
  cycle.root.add(trailRoot);

  /** Smooth path behind the bike; flattened to floor plane like in-game trail anchors. */
  const trailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.03, 0, -0.42),
    new THREE.Vector3(0.09, 0, -1.02),
    new THREE.Vector3(0.16, 0, -1.62),
    new THREE.Vector3(0.24, 0, -2.28),
  ]);
  const pathPts = trailCurve.getPoints(72);
  for (const p of pathPts) p.y = 0;

  const thick = WORLD.trailWallThickness;
  const wallH = WORLD.trailWallHeight;
  const trailGeom = mergeTrailWallAlongPath(pathPts, thick, wallH);

  const neon = typeof devHud.neonIntensity === "number" ? devHud.neonIntensity : 1;
  const trailOp = typeof devHud.trailOpacity === "number" ? devHud.trailOpacity : 0.8;

  /** @type {THREE.MeshStandardMaterial | null} */
  let trailWallMat = null;
  /** @type {THREE.MeshBasicMaterial | null} */
  let trailGlowMat = null;
  /** @type {THREE.BufferGeometry | null} */
  let trailGlowGeom = null;
  let trailPulseT = 0;

  if (!trailGeom) {
    console.warn("[garageShowroom] trail preview geometry empty");
  } else {
    trailWallMat = new THREE.MeshStandardMaterial({
      color: trailCol.clone().multiplyScalar(0.18),
      emissive: trailCol.clone(),
      emissiveIntensity: 0.95 * neon,
      metalness: 0.38,
      roughness: 0.28,
      transparent: true,
      opacity: trailOp,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const trailMesh = new THREE.Mesh(trailGeom, trailWallMat);
    trailMesh.frustumCulled = false;
    trailMesh.renderOrder = 1;
    trailRoot.add(trailMesh);

    /** Wider/taller merged wall + additive pass — showroom has no bloom pass. */
    trailGlowMat = new THREE.MeshBasicMaterial({
      color: trailCol.clone(),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    trailGlowGeom = mergeTrailWallAlongPath(pathPts, thick * 1.75, wallH * 1.12);
    if (trailGlowGeom) {
      const trailGlow = new THREE.Mesh(trailGlowGeom, trailGlowMat);
      trailGlow.frustumCulled = false;
      trailGlow.renderOrder = 2;
      trailRoot.add(trailGlow);
    } else {
      trailGlowMat.dispose();
      trailGlowMat = null;
    }
  }

  function applyTrailPreviewColor(hex) {
    trailCol.set(hex);
    if (trailWallMat) {
      trailWallMat.color.copy(trailCol).multiplyScalar(0.18);
      trailWallMat.emissive.copy(trailCol);
    }
    if (trailGlowMat) trailGlowMat.color.copy(trailCol);
  }

  /**
   * Live-update showroom when save colors change (P7.4).
   * @param {import("../data/savedata.js").PlayerSave} save
   */
  function syncFromSave(save) {
    const ch = typeof save.player.cycleColor === "string" ? save.player.cycleColor : "#00FFFF";
    cycle.setPrimaryColor(ch);
    applyTrailPreviewColor(ch);
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

    if (trailWallMat && trailGlowMat) {
      trailPulseT += dt;
      const tPulse = 0.1 * Math.sin(trailPulseT * 3.4);
      trailWallMat.emissiveIntensity = (0.92 + tPulse) * neon;
      trailWallMat.opacity = trailOp;
      const gPulse = 0.38 + 0.06 * Math.sin(trailPulseT * 2.8);
      trailGlowMat.opacity = Math.min(0.55, gPulse + 0.12);
    }

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
      trailGeom?.dispose();
      trailGlowGeom?.dispose();
      trailWallMat?.dispose();
      trailGlowMat?.dispose();
      grid.geometry.dispose();
      const gmat = grid.material;
      if (Array.isArray(gmat)) gmat.forEach((m) => m.dispose());
      else gmat.dispose();
    },
  };
}
