import * as THREE from "../vendor/three-module.js";
import { mergeGeometries } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { CYCLE_BOUNDS, WORLD } from "../config.js";
import { isExoticNeonToken, writeExoticTrailEmissive } from "./neonCosmetic.js";
import { createTrailTileMap } from "./trailTileMap.js";

/** Mottled 1:1 emissive map so trails read as rubber smudge / tread instead of a flat bar. */
let driftEmissiveMap = /** @type {THREE.Texture | null} */ (null);
function getDriftEmissiveMap() {
  if (driftEmissiveMap) return driftEmissiveMap;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4200; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.22})`;
    g.fillRect(x, y, 1.4, 1.4);
  }
  g.globalAlpha = 0.4;
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1.1;
  for (let s = -40; s < 180; s += 5) {
    g.beginPath();
    g.moveTo(s, 0);
    g.lineTo(s + 48, 128);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 5.5);
  if ("SRGBColorSpace" in THREE) {
    /** @type {import('three').Texture} */ (tex).colorSpace = THREE.SRGBColorSpace;
  }
  driftEmissiveMap = tex;
  return tex;
}

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
  /** @type {string | null} */
  let cosmeticToken =
    typeof options.color === "string" && isExoticNeonToken(options.color.trim())
      ? options.color.trim()
      : null;
  const color = new THREE.Color();
  if (cosmeticToken) {
    writeExoticTrailEmissive(color, cosmeticToken, 0);
  } else {
    color.set(options.color);
  }
  const devHud = options.devHud;

  function glowThickMul() {
    const n = devHud.trailGlowThickMul;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 1.7;
  }
  function glowHeightMul() {
    const n = devHud.trailGlowHeightMul;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.min(2.5, n)) : 1.5;
  }
  function glowAlpha() {
    const n = devHud.trailGlowAlpha;
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1.25, n)) : 0.12;
  }

  /** When thickness/height multipliers change, merged glow geometry must rebuild. */
  let prevGlowDimsKey = "";
  /** When glow shell is toggled off (alpha → 0), drop/add merged glow meshes. */
  let prevGlowShell = /** @type {boolean | null} */ (null);

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
  const glowSegmentsGroup = new THREE.Group();
  glowSegmentsGroup.renderOrder = 0;
  const segmentsGroup = new THREE.Group();
  segmentsGroup.renderOrder = 1;
  root.add(glowSegmentsGroup);
  root.add(segmentsGroup);

  /**
   * Lit metal + key light on thin wall boxes reads as blown-out white under bloom (especially exotics).
   * Match showroom: black albedo, emissive-only read (see `garageShowroom.js` trail preview note).
   */
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: color.clone(),
    emissiveIntensity: 0.95 * devHud.neonIntensity,
    metalness: 0.08,
    roughness: 0.92,
    emissiveMap: getDriftEmissiveMap() ?? undefined,
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
    for (const group of [glowSegmentsGroup, segmentsGroup]) {
      while (group.children.length) {
        const ch = group.children.pop();
        if (ch instanceof THREE.Mesh) {
          ch.geometry?.dispose();
          if (ch.material && ch.material !== baseMaterial) ch.material.dispose();
        }
      }
    }
  }

  /**
   * Build merged geometry for one logical segment (piecewise boxes along straight chord).
   * @param {number} segOpacity 0–1
   * @param {boolean} asGlow — wide additive strip (hue = trail color) under the core wall
   */
  function buildSegmentMeshes(a, b, segOpacity, asGlow = false) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const chord = Math.hypot(dx, dz);
    if (chord < 1e-5) return;

    const divisions = Math.max(6, Math.min(64, Math.ceil(chord * 14)));
    const parts = [];
    const thickUse = asGlow ? thick * glowThickMul() : thick;
    const wallHUse = asGlow ? wallH * glowHeightMul() : wallH;
    const halfH = wallHUse * 0.5;

    for (let i = 0; i < divisions; i++) {
      const t0 = i / divisions;
      const t1 = (i + 1) / divisions;
      tmpA.lerpVectors(a, b, t0);
      tmpB.lerpVectors(a, b, t1);
      const sdx = tmpB.x - tmpA.x;
      const sdz = tmpB.z - tmpA.z;
      const slen = Math.hypot(sdx, sdz);
      if (slen < 1e-5) continue;

      const geom = new THREE.BoxGeometry(thickUse, wallHUse, slen);
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

    const opFade = Math.max(0, Math.min(1, segOpacity));
    if (!asGlow) {
      const segMaterial = baseMaterial.clone();
      const op = devHud.trailOpacity * opFade;
      segMaterial.opacity = op;
      segMaterial.transparent = op < 0.995;
      const mesh = new THREE.Mesh(merged, segMaterial);
      mesh.frustumCulled = false;
      segmentsGroup.add(mesh);
    } else {
      const gop = devHud.trailOpacity * opFade * glowAlpha();
      const gm = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: gop,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      gm.color.copy(color);
      gm.userData.segFade = opFade;
      const mesh = new THREE.Mesh(merged, gm);
      mesh.frustumCulled = false;
      glowSegmentsGroup.add(mesh);
    }
  }

  function rebuildGeometry() {
    disposeSegmentChildren();
    trailTileMap.clear();
    const wantGlowShell = glowAlpha() > 0.001;

    let g = 0;
    for (const fc of frozenChains) {
      for (let i = 0; i < fc.anchors.length - 1; i++) {
        const o = fc.segmentOpacities[i] ?? 1;
        if (o <= 0.001) continue;
        buildSegmentMeshes(fc.anchors[i], fc.anchors[i + 1], o, false);
        if (wantGlowShell) buildSegmentMeshes(fc.anchors[i], fc.anchors[i + 1], o, true);
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
      buildSegmentMeshes(anchors[i], anchors[i + 1], o, false);
      if (wantGlowShell) buildSegmentMeshes(anchors[i], anchors[i + 1], o, true);
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
    const glowKey = `${glowThickMul()}:${glowHeightMul()}`;
    if (glowKey !== prevGlowDimsKey) {
      prevGlowDimsKey = glowKey;
      anchorsDirty = true;
    }
    const wantGlowShell = glowAlpha() > 0.001;
    if (prevGlowShell === null) prevGlowShell = wantGlowShell;
    else if (wantGlowShell !== prevGlowShell) {
      prevGlowShell = wantGlowShell;
      anchorsDirty = true;
    }
    if (cosmeticToken) {
      writeExoticTrailEmissive(color, cosmeticToken, pulseT);
      baseMaterial.emissive.copy(color);
      baseMaterial.color.set(0x000000);
    }
    const pulseI = 0.92 + pulse;
    baseMaterial.emissiveIntensity = pulseI * devHud.neonIntensity;
    baseMaterial.opacity = devHud.trailOpacity;

    const spd = typeof state.speed === "number" ? state.speed : 0;
    const heading = typeof state.heading === "number" ? state.heading : 0;
    sampleRearContact(state.x, state.z, heading, tmpRear);

    if (anchors.length === 0) {
      anchors.push(tmpRear.clone());
      anchors.push(tmpRear.clone());
      segmentOpacities.push(1);
      anchorsDirty = true;
    }

    if (spd > 0.12) {
      distSinceAnchor += spd * dt;
    }

    // 1. Add new segments as we move
    while (distSinceAnchor >= segDist) {
      if (spd <= 0.12) break;
      
      anchors.push(tmpRear.clone());
      segmentOpacities.push(1);
      maybeNotifyNewSegment();
      distSinceAnchor -= segDist;
      anchorsDirty = true;
    }

    // 2. Always keep the newest anchor on the rear axle every frame.
    // This ensures the trail is continuous and collision is accurate up to the cycle.
    if (anchors.length >= 1) {
      anchors[anchors.length - 1].copy(tmpRear);
      anchorsDirty = true;
    }

    // 3. Handle fading and trimming at the tail
    // We want the trail to be maxSeg long. 
    // We fade the oldest segments over time to create a smooth tail.
    const fadeSpeed = Math.max(0.001, devHud.trailFadeSpeed);
    
    // We need to fade out segments that exceed maxSeg.
    // Since we might add multiple segments per frame, we need to fade them fast enough,
    // or just fade a fixed number of segments at the tail.
    // For a smooth visual, we can just reduce the opacity of the oldest segment.
    // If we have excess segments, we force them to fade faster so they don't pile up.
    let excess = totalEdgeCount() - maxSeg;
    
    if (excess > 0) {
      // We have more segments than allowed. We must remove them.
      // To prevent the array from growing infinitely, we instantly trim any segments
      // beyond a small fade buffer, and fade the rest.
      while (totalEdgeCount() > maxSeg + 5) {
        trimOldestEdgeInstant();
        anchorsDirty = true;
      }
      
      // Fade the oldest segment
      let tailOp = frozenChains.length > 0 ? frozenChains[0].segmentOpacities[0] : segmentOpacities[0];
      if (tailOp !== undefined) {
        // Fade faster if we have more excess
        const currentFadeSpeed = fadeSpeed * (1 + excess * 2);
        tailOp -= currentFadeSpeed * dt;
        
        if (tailOp <= 0) {
          shiftOldestFadedSegment();
        } else {
          if (frozenChains.length > 0) frozenChains[0].segmentOpacities[0] = tailOp;
          else segmentOpacities[0] = tailOp;
        }
        anchorsDirty = true;
      }
    }

    if (anchorsDirty) {
      rebuildGeometry();
      anchorsDirty = false;
    }

    for (const m of segmentsGroup.children) {
      if (m instanceof THREE.Mesh && m.material) {
        const mat = /** @type {THREE.MeshStandardMaterial} */ (m.material);
        mat.color.set(0x000000);
        mat.emissive.copy(color);
        mat.emissiveIntensity = pulseI * devHud.neonIntensity;
      }
    }
    for (const m of glowSegmentsGroup.children) {
      if (m instanceof THREE.Mesh && m.material) {
        const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
        mat.color.copy(color);
        const sf = typeof mat.userData.segFade === "number" ? mat.userData.segFade : 1;
        mat.opacity = devHud.trailOpacity * Math.max(0, Math.min(1, sf)) * glowAlpha();
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
    if (typeof hex === "string" && isExoticNeonToken(hex.trim())) {
      cosmeticToken = hex.trim();
      writeExoticTrailEmissive(color, cosmeticToken, pulseT);
    } else {
      cosmeticToken = null;
      color.set(hex);
    }
    baseMaterial.color.set(0x000000);
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
