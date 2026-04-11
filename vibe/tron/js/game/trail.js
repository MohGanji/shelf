import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CYCLE_BOUNDS, WORLD } from "../config.js";
import { createTrailTileMap } from "./trailTileMap.js";

/** @typedef {typeof WORLD} WorldConstants */

/**
 * Fading trail wall rendering (plan P2.1 + P2.2): piecewise ribbon of thin emissive boxes along anchor chords.
 * Distance-based anchor spawn (1 unit), FIFO cap from Trail Length attribute, oldest segment
 * fades (opacity → 0) before removal using `trailFadeSpeed`. No new anchors at near-zero speed.
 * Tile occupancy for trails is maintained in `trailTileMap` (plan A3); lethal hits handled in `collisionResolve.js` (P2.3).
 *
 * @param {object} options
 * @param {import('three').ColorRepresentation} options.color
 * @param {import('../config.js').DEFAULT_DEV_HUD} options.devHud
 * @param {WorldConstants} [options.world] — from `getArenaPlaytestConfig().world` / runtime; defaults to base `WORLD`
 * @param {number} options.maxSegments — max unit-length trail segments (edges); anchors cap at +1
 * @param {number} options.arenaWidth — world units (for tile grid)
 * @param {number} options.arenaDepth — world units
 * @param {string} [options.ownerId='player'] — occupancy owner id for collision map
 */
export function createTrailWallSystem(options) {
  const color = new THREE.Color(options.color);
  const devHud = options.devHud;
  const w = options.world ?? WORLD;
  const maxSeg = Math.max(4, Math.floor(options.maxSegments ?? devHud.defaultTrailLength));
  const maxAnchors = maxSeg + 1;
  const ownerId = typeof options.ownerId === "string" && options.ownerId.length ? options.ownerId : "player";
  const arenaWidth = typeof options.arenaWidth === "number" ? options.arenaWidth : w.defaultArenaWidth;
  const arenaDepth = typeof options.arenaDepth === "number" ? options.arenaDepth : w.defaultArenaDepth;
  const trailTileMap = createTrailTileMap({ arenaWidth, arenaDepth });

  const root = new THREE.Group();
  const segmentsGroup = new THREE.Group();
  root.add(segmentsGroup);

  const baseMaterial = new THREE.MeshStandardMaterial({
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

  /** World rear contact points along path: oldest → newest (closest to cycle). */
  const anchors = [];
  /** One entry per segment (edge) anchors[i]→anchors[i+1]; 1 = opaque, →0 while fading out (FIFO tail). */
  const segmentOpacities = [];
  let distSinceAnchor = 0;
  let anchorsDirty = true;

  const tmpRear = new THREE.Vector3();
  const thick = w.trailWallThickness;
  const wallH = w.trailWallHeight;
  const segDist = w.segmentSpawnDistance;

  let pulseT = 0;

  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

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

  function disposeSegmentChildren() {
    while (segmentsGroup.children.length) {
      const ch = segmentsGroup.children.pop();
      if (ch instanceof THREE.Mesh) {
        ch.geometry?.dispose();
        if (ch.material && ch.material !== baseMaterial) ch.material.dispose();
      }
    }
  }

  /**
   * Build merged geometry for one logical segment (piecewise boxes along straight chord).
   * @param {number} segOpacity 0–1
   */
  function buildSegmentMeshes(a, b, segOpacity) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const chord = Math.hypot(dx, dz);
    if (chord < 1e-5) return;

    const divisions = Math.max(4, Math.min(64, Math.ceil(chord * 12)));
    const parts = [];
    const halfH = wallH * 0.5;

    for (let i = 0; i < divisions; i++) {
      const t0 = i / divisions;
      const t1 = (i + 1) / divisions;
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

    if (parts.length === 0) return;

    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();

    const mat = baseMaterial.clone();
    const op = devHud.trailOpacity * Math.max(0, Math.min(1, segOpacity));
    mat.opacity = op;
    mat.transparent = op < 0.995;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    segmentsGroup.add(mesh);
  }

  function rebuildGeometry() {
    disposeSegmentChildren();
    trailTileMap.clear();

    if (anchors.length < 2) {
      return;
    }

    for (let i = 0; i < anchors.length - 1; i++) {
      const o = segmentOpacities[i] ?? 1;
      if (o <= 0.001) continue;
      buildSegmentMeshes(anchors[i], anchors[i + 1], o);
      if (o > 0.001) {
        trailTileMap.stampEdge(
          anchors[i].x,
          anchors[i].z,
          anchors[i + 1].x,
          anchors[i + 1].z,
          i,
          ownerId,
        );
      }
    }
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
    baseMaterial.emissiveIntensity = (0.92 + pulse) * devHud.neonIntensity;
    baseMaterial.opacity = devHud.trailOpacity;

    const spd = typeof state.speed === "number" ? state.speed : 0;
    const heading = typeof state.heading === "number" ? state.heading : 0;
    sampleRearContact(state.x, state.z, heading, tmpRear);

    const fadeSpeed = Math.max(0.001, devHud.trailFadeSpeed);

    if (spd > 0.12) {
      distSinceAnchor += spd * dt;
    }

    while (distSinceAnchor >= segDist) {
      if (anchors.length < maxAnchors) {
        if (spd <= 0.12) break;
        anchors.push(tmpRear.clone());
        if (anchors.length >= 2) segmentOpacities.push(1);
        distSinceAnchor -= segDist;
        anchorsDirty = true;
        continue;
      }

      const tail = segmentOpacities[0] ?? 1;
      segmentOpacities[0] = Math.max(0, tail - fadeSpeed * dt);
      anchorsDirty = true;
      if (segmentOpacities[0] > 0) break;

      anchors.shift();
      segmentOpacities.shift();
      anchors.push(tmpRear.clone());
      segmentOpacities.push(1);
      distSinceAnchor -= segDist;
      anchorsDirty = true;
      break;
    }

    if (anchorsDirty) {
      rebuildGeometry();
      anchorsDirty = false;
    }

    for (const m of segmentsGroup.children) {
      if (m instanceof THREE.Mesh && m.material) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
        mat.emissiveIntensity = (0.92 + pulse) * devHud.neonIntensity;
      }
    }
  }

  /** Clear all trail geometry (derez / tunnel); call on transitions. */
  function clear() {
    anchors.length = 0;
    segmentOpacities.length = 0;
    distSinceAnchor = 0;
    anchorsDirty = true;
    rebuildGeometry();
    anchorsDirty = false;
  }

  /** @param {import('three').ColorRepresentation} hex */
  function setColor(hex) {
    color.set(hex);
    baseMaterial.color.copy(color).multiplyScalar(0.18);
    baseMaterial.emissive.copy(color);
  }

  function getActiveSegmentCount() {
    let n = 0;
    for (let i = 0; i < segmentOpacities.length; i++) {
      if ((segmentOpacities[i] ?? 0) > 0.02) n++;
    }
    return n;
  }

  function getLogicalEdgeCount() {
    if (anchors.length < 2) return 0;
    return anchors.length - 1;
  }

  function dispose() {
    clear();
    disposeSegmentChildren();
    baseMaterial.dispose();
  }

  return {
    root,
    update,
    clear,
    setColor,
    getActiveSegmentCount,
    getLogicalEdgeCount,
    getTrailTileMap() {
      return trailTileMap;
    },
    dispose,
  };
}
