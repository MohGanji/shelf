import * as THREE from "../vendor/three-module.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { CYCLE_BOUNDS, WORLD } from "../config.js";
import { createTrailTileMap } from "./trailTileMap.js";

/** @typedef {typeof WORLD} WorldConstants */

/**
 * @typedef {object} FrozenTrailChain
 * @property {THREE.Vector3[]} anchors
 * @property {number[]} segmentOpacities
 */

/**
 * Fading trail wall rendering (plan P2.1 + P2.2): piecewise ribbon of thin emissive boxes along anchor chords.
 * Distance-based anchor spawn (`WORLD.segmentSpawnDistance`), FIFO cap from Trail Length attribute (scaled so
 * total path length matches legacy 1-unit spacing), oldest segment
 * fades (opacity → 0) before removal using `trailFadeSpeed`. No new anchors at near-zero speed.
 * Tile occupancy for trails is maintained in `trailTileMap` (plan A3); lethal hits handled in `collisionResolve.js` (P2.3).
 *
 * **Portal detach (P3.6):** `detachChainAtPortal()` moves the current live polyline into an internal frozen chain so the
 * tile map + meshes stay lethal while new anchors begin at the exit — trail does not span the warp visually.
 *
 * @param {object} options
 * @param {import('three').ColorRepresentation} options.color
 * @param {import('../config.js').DEFAULT_DEV_HUD} options.devHud
 * @param {WorldConstants} [options.world] — from `getArenaPlaytestConfig().world` / runtime; defaults to base `WORLD`
 * @param {number} options.maxSegments — max unit-length trail segments (edges); anchors cap at +1
 * @param {number} options.arenaWidth — world units (for tile grid)
 * @param {number} options.arenaDepth — world units
 * @param {string} [options.ownerId='player'] — occupancy owner id for collision map
 * @param {() => void} [options.onNewSegment] — plan P8.5: soft tink (~once per legacy world unit of new wall)
 */
export function createTrailWallSystem(options) {
  const color = new THREE.Color(options.color);
  const devHud = options.devHud;
  const onNewSegment = typeof options.onNewSegment === "function" ? options.onNewSegment : null;
  const w = options.world ?? WORLD;
  const segDist = w.segmentSpawnDistance;
  /** Legacy design: one logical edge ≈ 1 world unit of path; denser `segDist` uses more physical edges for the same length. */
  const anchorBudgetScale = Math.max(1, Math.round(1 / segDist));
  let maxSeg = Math.max(
    4,
    Math.floor((options.maxSegments ?? devHud.defaultTrailLength) * anchorBudgetScale),
  );
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

  /** Older trail polylines frozen by portal entry — FIFO fade globally across frozen + live. */
  /** @type {FrozenTrailChain[]} */
  const frozenChains = [];

  /** World rear contact points along path: oldest → newest (closest to cycle). */
  const anchors = [];
  /** One entry per segment (edge) anchors[i]→anchors[i+1]; 1 = opaque, →0 while fading out (FIFO tail). */
  const segmentOpacities = [];
  let distSinceAnchor = 0;
  let anchorsDirty = true;

  const tmpRear = new THREE.Vector3();
  const thick = w.trailWallThickness;
  const wallH = w.trailWallHeight;

  /** Fire `onNewSegment` once per legacy 1-unit spacing so SFX stays continuous when anchors are denser. */
  let segmentsSinceAudio = 0;
  function maybeNotifyNewSegment() {
    segmentsSinceAudio += 1;
    if (segmentsSinceAudio < anchorBudgetScale) return;
    segmentsSinceAudio = 0;
    onNewSegment?.();
  }

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

  function totalEdgeCount() {
    let n = 0;
    for (const fc of frozenChains) {
      n += Math.max(0, fc.anchors.length - 1);
    }
    n += Math.max(0, anchors.length - 1);
    return n;
  }

  /**
   * Remove the oldest logical segment (one edge) without fade — for `setMaxSegments` trimming.
   */
  function trimOldestEdgeInstant() {
    if (frozenChains.length > 0) {
      const ch = frozenChains[0];
      ch.anchors.shift();
      if (ch.segmentOpacities.length > 0) ch.segmentOpacities.shift();
      if (ch.anchors.length < 2) frozenChains.shift();
      return;
    }
    if (anchors.length >= 1) anchors.shift();
    if (segmentOpacities.length > 0) segmentOpacities.shift();
  }

  /**
   * @returns {boolean} true if the removed segment belonged to the **live** chain (snake recycle adds a new rear contact).
   */
  function shiftOldestFadedSegment() {
    if (frozenChains.length > 0) {
      const ch = frozenChains[0];
      ch.anchors.shift();
      if (ch.segmentOpacities.length > 0) ch.segmentOpacities.shift();
      if (ch.anchors.length < 2) frozenChains.shift();
      return false;
    }
    anchors.shift();
    if (segmentOpacities.length > 0) segmentOpacities.shift();
    return true;
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

    const segMaterial = baseMaterial.clone();
    const op = devHud.trailOpacity * Math.max(0, Math.min(1, segOpacity));
    segMaterial.opacity = op;
    segMaterial.transparent = op < 0.995;
    const mesh = new THREE.Mesh(merged, segMaterial);
    mesh.frustumCulled = false;
    segmentsGroup.add(mesh);
  }

  function rebuildGeometry() {
    disposeSegmentChildren();
    trailTileMap.clear();

    let g = 0;
    for (const fc of frozenChains) {
      for (let i = 0; i < fc.anchors.length - 1; i++) {
        const o = fc.segmentOpacities[i] ?? 1;
        if (o <= 0.001) continue;
        buildSegmentMeshes(fc.anchors[i], fc.anchors[i + 1], o);
        trailTileMap.stampEdge(
          fc.anchors[i].x,
          fc.anchors[i].z,
          fc.anchors[i + 1].x,
          fc.anchors[i + 1].z,
          g,
          ownerId,
        );
        g += 1;
      }
    }
    for (let i = 0; i < anchors.length - 1; i++) {
      const o = segmentOpacities[i] ?? 1;
      if (o <= 0.001) continue;
      buildSegmentMeshes(anchors[i], anchors[i + 1], o);
      trailTileMap.stampEdge(
        anchors[i].x,
        anchors[i].z,
        anchors[i + 1].x,
        anchors[i + 1].z,
        g,
        ownerId,
      );
      g += 1;
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
      if (spd <= 0.12) break;
      if (totalEdgeCount() < maxSeg) {
        anchors.push(tmpRear.clone());
        if (anchors.length >= 2) {
          segmentOpacities.push(1);
          maybeNotifyNewSegment();
        }
        distSinceAnchor -= segDist;
        anchorsDirty = true;
        continue;
      }

      const tail =
        frozenChains.length > 0 ? frozenChains[0].segmentOpacities[0] ?? 1 : segmentOpacities[0] ?? 1;
      const nextOp = Math.max(0, tail - fadeSpeed * dt);
      if (frozenChains.length > 0) frozenChains[0].segmentOpacities[0] = nextOp;
      else segmentOpacities[0] = nextOp;
      anchorsDirty = true;
      if (nextOp > 0) break;

      const liveRecycle = shiftOldestFadedSegment();
      if (liveRecycle) {
        anchors.push(tmpRear.clone());
        segmentOpacities.push(1);
        maybeNotifyNewSegment();
        distSinceAnchor -= segDist;
      }
      anchorsDirty = true;
      break;
    }

    /**
     * Keep the newest anchor on the rear axle every frame while the chain is at the FIFO cap.
     * Otherwise the last point stays fixed until the tail opacity hits zero — the gap to the bike
     * grows and the wall appears to jump on each recycle instead of sliding smoothly.
     */
    if (anchors.length >= 1 && totalEdgeCount() >= maxSeg) {
      anchors[anchors.length - 1].copy(tmpRear);
      anchorsDirty = true;
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
    frozenChains.length = 0;
    anchors.length = 0;
    segmentOpacities.length = 0;
    distSinceAnchor = 0;
    segmentsSinceAudio = 0;
    anchorsDirty = true;
    rebuildGeometry();
    anchorsDirty = false;
  }

  /**
   * P3.6 — snapshot the live polyline as a frozen chain so a portal exit can start a fresh chain.
   * No-op if there is not yet a segment (0 or 1 anchor).
   */
  function detachChainAtPortal() {
    if (anchors.length < 2) {
      anchors.length = 0;
      segmentOpacities.length = 0;
      distSinceAnchor = 0;
    } else {
      frozenChains.push({
        anchors: anchors.map((a) => a.clone()),
        segmentOpacities: segmentOpacities.slice(),
      });
      anchors.length = 0;
      segmentOpacities.length = 0;
      distSinceAnchor = 0;
    }
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
    for (const fc of frozenChains) {
      for (let i = 0; i < fc.segmentOpacities.length; i++) {
        if ((fc.segmentOpacities[i] ?? 0) > 0.02) n++;
      }
    }
    for (let i = 0; i < segmentOpacities.length; i++) {
      if ((segmentOpacities[i] ?? 0) > 0.02) n++;
    }
    return Math.max(0, Math.round(n / anchorBudgetScale));
  }

  /** Physical edge count (tile `segmentIndex` space); matches `trailTileMap` + immunity cutoffs. */
  function getLogicalEdgeCount() {
    return totalEdgeCount();
  }

  /**
   * Top-down minimap polylines (P9.4) — one segment per visible edge; opacity <= 0.02 skipped.
   * @returns {{ ax: number; az: number; bx: number; bz: number }[]}
   */
  function getMinimapSegments() {
    /** @type {{ ax: number; az: number; bx: number; bz: number }[]} */
    const out = [];
    const pushChain = (
      /** @type {THREE.Vector3[]} */ anch,
      /** @type {number[]} */ opac,
    ) => {
      for (let i = 0; i < anch.length - 1; i++) {
        const o = opac[i] ?? 1;
        if (o <= 0.02) continue;
        out.push({
          ax: anch[i].x,
          az: anch[i].z,
          bx: anch[i + 1].x,
          bz: anch[i + 1].z,
        });
      }
    };
    for (const fc of frozenChains) {
      pushChain(fc.anchors, fc.segmentOpacities);
    }
    pushChain(anchors, segmentOpacities);
    return out;
  }

  /**
   * Raise or lower FIFO cap (plan P3.3 Trail Extend). Trims excess anchors from the tail if shrinking.
   * @param {number} nextMaxSegments — max logical segments (edges), same units as constructor `maxSegments`
   */
  function setMaxSegments(nextMaxSegments) {
    const cap = Math.max(4, Math.floor(nextMaxSegments * anchorBudgetScale));
    maxSeg = cap;
    while (totalEdgeCount() > maxSeg) {
      trimOldestEdgeInstant();
    }
    anchorsDirty = true;
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
    detachChainAtPortal,
    setColor,
    setMaxSegments,
    getActiveSegmentCount,
    getLogicalEdgeCount,
    getMinimapSegments,
    getTrailTileMap() {
      return trailTileMap;
    },
    dispose,
  };
}
