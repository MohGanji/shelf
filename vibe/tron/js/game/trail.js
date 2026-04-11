import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CYCLE_BOUNDS, WORLD } from "../config.js";

/**
 * Fading trail wall rendering (plan P2.1): CatmullRom-smoothed ribbon of thin emissive boxes.
 * Distance-based anchor spawn (1 unit), FIFO cap, no new anchors at near-zero speed.
 * Collision / tile map is P2.3; fade limits are P2.2.
 *
 * @param {object} options
 * @param {import('three').ColorRepresentation} options.color
 * @param {import('../config.js').DEFAULT_DEV_HUD} options.devHud
 * @param {number} options.maxSegments — max unit-length trail segments (edges); anchors cap at +1
 */
export function createTrailWallSystem(options) {
  const color = new THREE.Color(options.color);
  const devHud = options.devHud;
  const maxSeg = Math.max(4, Math.floor(options.maxSegments ?? devHud.defaultTrailLength));
  const maxAnchors = maxSeg + 1;

  const root = new THREE.Group();
  const mesh = new THREE.Mesh();
  mesh.frustumCulled = false;
  root.add(mesh);

  const material = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.18),
    emissive: color,
    emissiveIntensity: 0.95 * devHud.neonIntensity,
    metalness: 0.38,
    roughness: 0.28,
    transparent: true,
    opacity: devHud.trailOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mesh.material = material;

  /** World rear contact points along path: oldest → newest (closest to cycle). */
  const anchors = [];
  let distSinceAnchor = 0;
  let anchorsDirty = true;

  const tmpRear = new THREE.Vector3();
  const thick = WORLD.trailWallThickness;
  const wallH = WORLD.trailWallHeight;
  const segDist = WORLD.segmentSpawnDistance;

  let pulseT = 0;

  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const scaleOne = new THREE.Vector3(1, 1, 1);

  /**
   * Rear axle contact on the floor (local −Z from cycle center).
   * @param {number} cx
   * @param {number} cz
   * @param {number} heading
   * @param {THREE.Vector3} out
   */
  function sampleRearContact(cx, cz, heading, out) {
    const hl = CYCLE_BOUNDS.length * 0.48;
    out.set(cx - Math.sin(heading) * hl, 0, cz - Math.cos(heading) * hl);
    return out;
  }

  function rebuildGeometry() {
    if (mesh.geometry) mesh.geometry.dispose();

    if (anchors.length < 2) {
      mesh.geometry = new THREE.BufferGeometry();
      mesh.visible = false;
      return;
    }

    const curve = new THREE.CatmullRomCurve3(anchors.map((p) => p.clone()));
    const divisions = Math.max(
      8,
      Math.min(640, Math.ceil(curve.getLength() * 12)),
    );
    const pts = curve.getPoints(divisions);

    /** @type {THREE.BufferGeometry[]} */
    const parts = [];
    const halfH = wallH * 0.5;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;

      const geom = new THREE.BoxGeometry(thick, wallH, len);
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dx, dz));
      pos.set(mx, halfH, mz);
      mat.compose(pos, quat, scaleOne);
      geom.applyMatrix4(mat);
      parts.push(geom);
    }

    if (parts.length === 0) {
      mesh.geometry = new THREE.BufferGeometry();
      mesh.visible = false;
      return;
    }

    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    mesh.geometry = merged;
    mesh.visible = true;
  }

  /**
   * @param {number} dt
   * @param {object} state
   * @param {number} state.x
   * @param {number} state.z
   * @param {number} state.heading
   * @param {number} state.speed — planar speed (units/s)
   */
  function update(dt, state) {
    pulseT += dt;
    const pulse = 0.1 * Math.sin(pulseT * 3.4);
    material.emissiveIntensity = (0.92 + pulse) * devHud.neonIntensity;
    material.opacity = devHud.trailOpacity;

    const spd = typeof state.speed === "number" ? state.speed : 0;
    const heading = typeof state.heading === "number" ? state.heading : 0;
    sampleRearContact(state.x, state.z, heading, tmpRear);

    if (spd > 0.12) {
      distSinceAnchor += spd * dt;
      while (distSinceAnchor >= segDist) {
        anchors.push(tmpRear.clone());
        while (anchors.length > maxAnchors) anchors.shift();
        distSinceAnchor -= segDist;
        anchorsDirty = true;
      }
    }

    if (anchorsDirty) {
      rebuildGeometry();
      anchorsDirty = false;
    }
  }

  /** Clear all trail geometry (derez / tunnel); call on transitions. */
  function clear() {
    anchors.length = 0;
    distSinceAnchor = 0;
    anchorsDirty = true;
    rebuildGeometry();
    anchorsDirty = false;
  }

  /** @param {import('three').ColorRepresentation} hex */
  function setColor(hex) {
    color.set(hex);
    material.color.copy(color).multiplyScalar(0.18);
    material.emissive.copy(color);
  }

  function getActiveSegmentCount() {
    return Math.max(0, anchors.length - 1);
  }

  function dispose() {
    anchors.length = 0;
    distSinceAnchor = 0;
    if (mesh.geometry) mesh.geometry.dispose();
    material.dispose();
  }

  return {
    root,
    update,
    clear,
    setColor,
    getActiveSegmentCount,
    dispose,
  };
}
