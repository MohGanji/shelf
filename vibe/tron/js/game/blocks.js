import * as THREE from "../vendor/three-module.js";
import { Vec3 } from "../vendor/cannon-es-module.js";
import { createWallPhysicsBody } from "../engine/physics.js";

/**
 * Interior barriers from validated level JSON — visuals + static cannon-es boxes (plan § Arena Object Categories, P5.4).
 * P5.5: adjacent `wall` tiles and same-shape `building` squares (same height) merge into fewer meshes/bodies via axis-aligned runs.
 */

function neonBarrierMaterial(baseHex, emissiveHex, neonStrength) {
  return new THREE.MeshStandardMaterial({
    color: baseHex,
    emissive: emissiveHex,
    emissiveIntensity: neonStrength,
    metalness: 0.25,
    roughness: 0.42,
  });
}

/**
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 */
function barrierNeon(playCfg) {
  const n = 0.38 + playCfg.devHud.neonIntensity * 0.5;
  return n;
}

/**
 * @param {import('cannon-es').Material} wallMatRef
 * @param {THREE.Vector3Like} halfExtents
 * @param {THREE.Vector3Like} center
 */
function addBarrierBox(world, wallMatRef, halfExtents, center) {
  const body = createWallPhysicsBody({
    halfExtents: new Vec3(halfExtents.x, halfExtents.y, halfExtents.z),
    center: new Vec3(center.x, center.y, center.z),
    wallMatRef,
  });
  body.userData.kind = "barrier";
  world.addBody(body);
  return body;
}

/**
 * @param {unknown} b
 * @returns {{ type: string; x: number; z: number; height?: number; shape?: string; variant?: string } | null}
 */
function coerceBarrier(b) {
  if (!b || typeof b !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (b);
  const type = o.type;
  const x = o.x;
  const z = o.z;
  if (typeof type !== "string") return null;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  const out = { type, x, z };
  if (typeof o.height === "number" && Number.isFinite(o.height)) out.height = o.height;
  if (typeof o.shape === "string") out.shape = o.shape;
  if (typeof o.variant === "string") out.variant = o.variant;
  return out;
}

let windowTexCache = null;
let windowRoughnessCache = null;

function getWindowTextures() {
  if (windowTexCache && windowRoughnessCache) {
    return { map: windowTexCache, roughnessMap: windowRoughnessCache };
  }
  
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  
  // Diffuse map (Base Color)
  // Glass background (dark tinted blue/grey)
  ctx.fillStyle = "#02050a";
  ctx.fillRect(0, 0, 256, 256);
  
  // Subtle glass reflection bake
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  grad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0.02)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  
  // Mullions (frames)
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 12;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  
  windowTexCache = new THREE.CanvasTexture(canvas);
  windowTexCache.wrapS = THREE.RepeatWrapping;
  windowTexCache.wrapT = THREE.RepeatWrapping;
  windowTexCache.anisotropy = 4;
  
  // Roughness Map
  const rCanvas = document.createElement("canvas");
  rCanvas.width = 256;
  rCanvas.height = 256;
  const rCtx = rCanvas.getContext("2d");
  
  // Glass is very smooth (low roughness = dark)
  rCtx.fillStyle = "#050505";
  rCtx.fillRect(0, 0, 256, 256);
  
  // Frames are very rough (high roughness = white)
  rCtx.strokeStyle = "#ffffff";
  rCtx.lineWidth = 12;
  rCtx.strokeRect(0, 0, 256, 256);
  rCtx.beginPath();
  rCtx.moveTo(0, 128);
  rCtx.lineTo(256, 128);
  rCtx.stroke();
  
  windowRoughnessCache = new THREE.CanvasTexture(rCanvas);
  windowRoughnessCache.wrapS = THREE.RepeatWrapping;
  windowRoughnessCache.wrapT = THREE.RepeatWrapping;
  windowRoughnessCache.anisotropy = 4;
  
  return { map: windowTexCache, roughnessMap: windowRoughnessCache };
}

function scaleBoxUVs(geo, windowsPerUnit = 1) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  if (!pos || !uv || !norm) return;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    
    if (nx > 0.5) {
      uv.setXY(i, z * windowsPerUnit, y * windowsPerUnit);
    } else if (ny > 0.5) {
      uv.setXY(i, x * windowsPerUnit, z * windowsPerUnit);
    } else if (nz > 0.5) {
      uv.setXY(i, x * windowsPerUnit, y * windowsPerUnit);
    }
  }
}

/** 1-unit tile centers from level JSON (integers expected; rounded for stable keys). */
function tileKey(x, z) {
  return `${Math.round(x)},${Math.round(z)}`;
}

/**
 * Merge colinear runs on the grid: horizontal passes first, then vertical, then 1×1 for diagonal-only stubs.
 * Same adjacency rule as the editor (4-neighbor); diagonal touch does not merge.
 *
 * @param {Iterable<string>} tileKeys `"ix,iz"`
 * @returns {{ cx: number; cz: number; halfX: number; halfZ: number }[]}
 */
function mergeAxisAlignedBarrierTiles(tileKeys) {
  const rem = new Set(tileKeys);
  const out = [];

  while (rem.size > 0) {
    // Pick the top-left-most tile to ensure we build optimal rectangles
    let minZ = Infinity;
    let minX = Infinity;
    for (const k of rem) {
      const [x, z] = k.split(",").map(Number);
      if (z < minZ) {
        minZ = z;
        minX = x;
      } else if (z === minZ && x < minX) {
        minX = x;
      }
    }
    
    const sx = minX;
    const sz = minZ;
    
    // Find the max width in +x direction
    let w = 1;
    while (rem.has(tileKey(sx + w, sz))) {
      w++;
    }
    
    // Find the max depth in +z direction that maintains this width
    let d = 1;
    let canExpandDepth = true;
    while (canExpandDepth) {
      for (let dx = 0; dx < w; dx++) {
        if (!rem.has(tileKey(sx + dx, sz + d))) {
          canExpandDepth = false;
          break;
        }
      }
      if (canExpandDepth) {
        d++;
      }
    }
    
    // We found a rectangle of size w x d starting at (sx, sz)
    // Remove all these tiles from rem
    for (let dx = 0; dx < w; dx++) {
      for (let dz = 0; dz < d; dz++) {
        rem.delete(tileKey(sx + dx, sz + dz));
      }
    }
    
    // Calculate center and half-extents
    const cx = sx + (w - 1) / 2;
    const cz = sz + (d - 1) / 2;
    out.push({ cx, cz, halfX: w / 2, halfZ: d / 2 });
  }
  
  return out;
}

/**
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {import('cannon-es').Material} wallMatRef
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {unknown[]} barriers
 * @returns {{ group: THREE.Group; bodies: import('cannon-es').Body[] }}
 */
export function buildBarriersFromLevel(scene, world, wallMatRef, playCfg, barriers) {
  const group = new THREE.Group();
  group.name = "barriers";
  /** @type {import('cannon-es').Body[]} */
  const bodies = [];

  const wallH = playCfg.devHud.wallHeight ?? playCfg.arenaWallHeight;
  const neon = barrierNeon(playCfg);
  const matWall = neonBarrierMaterial(0x113344, 0x0088aa, neon);
  
  const style = playCfg.devHud.buildingGlitchStyle ?? 0;
  
  let matBuilding;
  if (style === 0 && scene.userData.arenaFloorMaterial) {
    // Style 0: Realistic glass skyscraper
    matBuilding = new THREE.MeshStandardMaterial({
      color: 0xffffff, // Let the map show through
      metalness: 0.95,
      roughness: 0.15, // Base roughness, overridden by roughnessMap
      envMap: scene.userData.arenaFloorMaterial.envMap || scene.userData.arenaFloorMaterial.userData?.envMap,
      envMapIntensity: 2.0
    });
    
    // We need to store a reference to this material so we can update its envMap later
    // when the PMREM generator finishes in main.js
    if (!scene.userData.buildingMaterials) scene.userData.buildingMaterials = [];
    scene.userData.buildingMaterials.push(matBuilding);
    
    const texs = getWindowTextures();
    matBuilding.map = texs.map;
    matBuilding.roughnessMap = texs.roughnessMap;
    
  } else if (style === 1) {
    // Style 1: Pure wireframe glitch
    matBuilding = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0x00ffcc,
      emissiveIntensity: neon * 0.5,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
  } else if (style === 2) {
    // Style 2: Holographic scanlines/additive
    matBuilding = new THREE.MeshStandardMaterial({
      color: playCfg.colors.gridFloor,
      emissive: 0x00ffcc,
      emissiveIntensity: neon * 0.3,
      metalness: 0.5,
      roughness: 0.5,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
  } else {
    // Style 3: Solid block with grid lines (like the floor itself)
    matBuilding = new THREE.MeshStandardMaterial({
      color: playCfg.colors.gridFloor,
      emissive: new THREE.Color(playCfg.colors.gridLine).multiplyScalar(0.055),
      metalness: 0.12,
      roughness: 0.82,
    });
  }
  
  const matStructure = neonBarrierMaterial(0x223355, 0x00aaff, neon * 1.1);

  /** @type {string[]} */
  const wallTileKeys = [];
  /** @type {Map<number, Set<string>>} */
  const squareBuildingsByHeight = new Map();
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const nonSquareBuildings = [];
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const structureList = [];

  for (const raw of barriers) {
    const b = coerceBarrier(raw);
    if (!b) continue;

    if (b.type === "wall") {
      wallTileKeys.push(tileKey(b.x, b.z));
      continue;
    }

    if (b.type === "building") {
      const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
      const shape = b.shape === "triangle" || b.shape === "hexagon" ? b.shape : "square";
      if (shape === "square") {
        if (!squareBuildingsByHeight.has(h)) squareBuildingsByHeight.set(h, new Set());
        squareBuildingsByHeight.get(h).add(tileKey(b.x, b.z));
      } else {
        nonSquareBuildings.push(b);
      }
      continue;
    }

    if (b.type === "structure") {
      structureList.push(b);
    }
  }

  const uniqueWallKeys = [...new Set(wallTileKeys)];
  for (const seg of mergeAxisAlignedBarrierTiles(uniqueWallKeys)) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(seg.halfX * 2, wallH, seg.halfZ * 2),
      matWall,
    );
    mesh.position.set(seg.cx, wallH / 2, seg.cz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    bodies.push(
      addBarrierBox(
        world,
        wallMatRef,
        { x: seg.halfX, y: wallH / 2, z: seg.halfZ },
        { x: seg.cx, y: wallH / 2, z: seg.cz },
      ),
    );
  }

  const H_MULT = 6;

  for (const [h, keySet] of squareBuildingsByHeight) {
    const tallH = h * H_MULT;
    for (const seg of mergeAxisAlignedBarrierTiles(keySet)) {
      const geo = new THREE.BoxGeometry(seg.halfX * 2, tallH, seg.halfZ * 2);
      if (style === 0) {
        scaleBoxUVs(geo, 2.0); // 2 windows per unit for denser grid
      }
      
      const mesh = new THREE.Mesh(geo, matBuilding);
      mesh.position.set(seg.cx, tallH / 2, seg.cz);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      
      // Add a glitchy wireframe overlay
      if (style === 2) {
        const wireGeo = new THREE.EdgesGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({ 
          color: 0x00ffcc, 
          transparent: true, 
          opacity: 0.05 + Math.random() * 0.1 
        });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        // Slightly scale up the wireframe to avoid z-fighting
        wire.scale.setScalar(1.001);
        mesh.add(wire);
      } else if (style === 3) {
        // Grid lines to match floor
        const wireGeo = new THREE.EdgesGeometry(mesh.geometry);
        const wireMat = new THREE.LineBasicMaterial({ 
          color: playCfg.colors.gridLine, 
          transparent: true, 
          opacity: 0.25 
        });
        const wire = new THREE.LineSegments(wireGeo, wireMat);
        wire.scale.setScalar(1.001);
        mesh.add(wire);
      }

      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: seg.halfX, y: tallH / 2, z: seg.halfZ },
          { x: seg.cx, y: tallH / 2, z: seg.cz },
        ),
      );
    }
  }

  for (const b of nonSquareBuildings) {
    const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
    const tallH = h * H_MULT;
    const shape = b.shape === "triangle" || b.shape === "hexagon" ? b.shape : "square";
    const segs = shape === "triangle" ? 3 : 6;
    const radius = shape === "triangle" ? 0.55 : 0.52;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, tallH, segs),
      matBuilding,
    );
    mesh.position.set(b.x, tallH / 2, b.z);
    group.add(mesh);
    bodies.push(
      addBarrierBox(world, wallMatRef, { x: radius, y: tallH / 2, z: radius }, { x: b.x, y: tallH / 2, z: b.z }),
    );
  }

  for (const b of structureList) {
    const variant = b.variant === "column" || b.variant === "obelisk" ? b.variant : "pylon";
    const structH = Math.min(wallH * 0.85, 2.2);

    if (variant === "pylon") {
      const w = 0.22;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, structH, w),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: w / 2, y: structH / 2, z: w / 2 },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    } else if (variant === "column") {
      const r = 0.38;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, structH, 20),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: r, y: structH / 2, z: r },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    } else {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.42, structH, 4),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: 0.42, y: structH / 2, z: 0.42 },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    }
  }

  scene.add(group);
  return { group, bodies };
}
