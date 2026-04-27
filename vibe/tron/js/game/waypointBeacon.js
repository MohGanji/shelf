/**
 * World beacon toward lobby gates or exit — animated column + rings + downward chevrons (“drop toward here”).
 * Materials use `fog: false` so the cue stays visible across large arenas (FogExp2 otherwise fades it out).
 * See Dev HUD `beaconMode` / `beaconStrength`.
 */

import * as THREE from "../vendor/three-module.js";

/** Count ∈ [3..5]; spacing preserved between consecutive chevrons. */
const CHEVRON_COUNT = 5;
/** Vertical gap between neighbors (same ~10 as earlier sparse pair). */
const CHEVRON_VERTICAL_GAP = 10;
/** Lowest chevron sits above ground rings — top derived so stack spans column nicely. */
const CHEVRON_BOTTOM_Y = 4.65;
/** Highest chevron Y anchor (five arrows × gap 10 → span 40 above bottom). */
const CHEVRON_TOP_Y_BASE = CHEVRON_BOTTOM_Y + (CHEVRON_COUNT - 1) * CHEVRON_VERTICAL_GAP;

/**
 * Slim flat arrow (↓) in XY — narrow triangle, tip toward −Y / ground.
 * @param {number} scale
 */
function createChevronGeometry(scale = 1) {
  const shape = new THREE.Shape();
  const w = 0.34 * scale;
  const h = 0.62 * scale;
  shape.moveTo(0, -h * 0.52);
  shape.lineTo(-w, h * 0.46);
  shape.lineTo(w, h * 0.46);
  shape.lineTo(0, -h * 0.52);
  return new THREE.ShapeGeometry(shape);
}

/**
 * @param {object} opts
 * @param {import('../vendor/three-module.js').Scene} opts.scene
 * @param {Partial<import('../config.js').DEFAULT_DEV_HUD>} opts.devHud
 */
export function createWaypointBeacon(opts) {
  const scene = opts.scene;
  const devHud = opts.devHud || {};

  const root = new THREE.Group();
  root.name = "waypoint-beacon";
  scene.add(root);

  const colGeo = new THREE.CylinderGeometry(0.32, 0.52, 48, 12, 1, true);
  const colMat = new THREE.MeshBasicMaterial({
    color: 0x44ffe8,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const column = new THREE.Mesh(colGeo, colMat);
  column.position.y = 24;
  root.add(column);

  const ringGeo = new THREE.RingGeometry(2.4, 4.1, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x66ffee,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  root.add(ring);

  const ring2 = ring.clone();
  ring2.scale.setScalar(1.38);
  ring2.position.y = 0.1;
  root.add(ring2);

  /** Expanding dashed-read ring — softer outer cue */
  const ringOuterGeo = new THREE.RingGeometry(4.5, 5.35, 48);
  const ringOuterMat = new THREE.MeshBasicMaterial({
    color: 0x88ffff,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
  ringOuter.rotation.x = -Math.PI / 2;
  ringOuter.position.y = 0.08;
  root.add(ringOuter);

  /** Five downward chevrons — same inter-row spacing (~10u), slim arrows */
  /** @type {THREE.BufferGeometry[]} */
  const chevronGeos = [];
  for (let i = 0; i < CHEVRON_COUNT; i += 1) {
    chevronGeos.push(createChevronGeometry(1 - i * 0.048));
  }
  /** @type {THREE.MeshBasicMaterial[]} */
  const chevronMats = [];
  /** @type {THREE.Mesh[]} */
  const chevrons = [];
  const baseChevronColors = [0xf2ffff, 0xd8fff8, 0x88eedd, 0x62ddcc, 0x48ccb8];
  for (let i = 0; i < CHEVRON_COUNT; i += 1) {
    const m = new THREE.MeshBasicMaterial({
      color: baseChevronColors[i],
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    chevronMats.push(m);
    const mesh = new THREE.Mesh(chevronGeos[i], m);
    mesh.name = `waypoint-chevron-${i}`;
    mesh.rotation.z = i * 0.08;
    root.add(mesh);
    chevrons.push(mesh);
  }

  let active = false;

  return {
    root,
    /**
     * @param {boolean} on
     * @param {number} x
     * @param {number} z
     */
    setTarget(on, x, z) {
      active = !!on;
      root.visible = active;
      if (!active) return;
      root.position.set(x, 0, z);
    },
    /** @param {number} t */
    tick(t) {
      if (!active) return;
      const mode = typeof devHud.beaconMode === "number" ? Math.floor(devHud.beaconMode) : 0;
      const s =
        typeof devHud.beaconStrength === "number" && Number.isFinite(devHud.beaconStrength)
          ? devHud.beaconStrength
          : 1;

      column.visible = mode === 0 || mode === 2;
      ring.visible = mode === 1 || mode === 2;
      ring2.visible = mode === 2;
      ringOuter.visible = mode === 1 || mode === 2;

      const chevronsVisible = mode === 0 || mode === 1 || mode === 2;
      for (let i = 0; i < chevrons.length; i += 1) {
        chevrons[i].visible = chevronsVisible;
      }

      const pulse = 0.82 + 0.18 * Math.sin(t * 2.8);
      const breathe = 0.94 + 0.06 * Math.sin(t * 1.9);

      colMat.opacity = 0.16 * s * pulse * breathe;
      ringMat.opacity = 0.38 * s * pulse;
      ringOuterMat.opacity = 0.14 * s * pulse + 0.06 * Math.sin(t * 3.6);

      ring.rotation.z = t * 0.52;
      ring2.rotation.z = -t * 0.4;
      ringOuter.rotation.z = t * 0.28;

      const ringPulse = 1 + 0.11 * Math.sin(t * 3.4);
      ring.scale.setScalar(ringPulse);
      ring2.scale.setScalar(1.38 * (1 + 0.09 * Math.sin(t * 2.7 + 0.8)));

      const outerPulse = 1 + 0.14 * Math.sin(t * 2.2 + 1.1);
      ringOuter.scale.setScalar(outerPulse);

      column.rotation.y = t * 0.28;
      column.scale.set(1, breathe, 1);

      for (let i = 0; i < chevrons.length; i += 1) {
        const phase = i * 2.35;
        const bob = Math.sin(t * 3.2 + phase) * 0.48;
        const wave = Math.sin(t * 2.05 + phase * 0.65) * 0.95;
        /** i=0 highest … i=CHEVRON_COUNT-1 lowest — fixed gap between rows */
        const baseY = CHEVRON_TOP_Y_BASE - i * CHEVRON_VERTICAL_GAP;
        chevrons[i].position.y = baseY + bob + wave * 0.35;
        chevrons[i].rotation.y = t * (1.05 + i * 0.07);
        chevrons[i].rotation.z = i * 0.06 + Math.sin(t * 2.35 + phase) * 0.11;
        const flick = 0.42 + 0.38 * Math.sin(t * 4.15 + phase);
        chevronMats[i].opacity = Math.min(0.82, (0.36 + flick * 0.36) * s);
        const sc = 0.9 + 0.16 * Math.sin(t * 3.65 + phase * 1.25);
        chevrons[i].scale.setScalar(sc);
      }
    },
    dispose() {
      scene.remove(root);
      colGeo.dispose();
      colMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      ringOuterGeo.dispose();
      ringOuterMat.dispose();
      for (const g of chevronGeos) g.dispose();
      for (const m of chevronMats) m.dispose();
    },
  };
}
