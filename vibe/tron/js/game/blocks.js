import * as THREE from "../vendor/three-module.js";
import { Vec3 } from "../vendor/cannon-es-module.js";
import { createTriangleBarrierBody, createWallPhysicsBody } from "../engine/physics.js";
import { resolveTriangleBuildingRotationY } from "../levels/footprints.js";

/**
 * Interior barriers from validated level JSON — visuals + static cannon-es boxes (plan § Arena Object Categories, P5.4).
 * P5.5: adjacent `wall` tiles and same-shape `building` squares (same height) merge into fewer meshes/bodies via axis-aligned runs.
 */

function neonBarrierMaterial(baseHex, emissiveHex, neonStrength) {
  return new THREE.MeshStandardMaterial({
    color: baseHex,
    emissive: emissiveHex,
    emissiveIntensity: neonStrength * 1.08,
    metalness: 0.25,
    roughness: 0.38,
  });
}

/**
 * @param {unknown} color
 * @param {THREE.Material} fallback
 * @param {number} neonStrength
 */
function materialWithOptionalColor(color, fallback, neonStrength) {
  if (typeof color !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(color)) return fallback;
  const mat = /** @type {THREE.MeshStandardMaterial} */ (fallback).clone();
  const c = new THREE.Color(color);
  mat.color = c;
  mat.emissive = c.clone().multiplyScalar(0.55);
  mat.emissiveIntensity = Math.max(mat.emissiveIntensity, neonStrength * 0.85);
  return mat;
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
 * @param {number} [rotationY]
 */
function addBarrierBox(world, wallMatRef, halfExtents, center, rotationY = 0) {
  const body = createWallPhysicsBody({
    halfExtents: new Vec3(halfExtents.x, halfExtents.y, halfExtents.z),
    center: new Vec3(center.x, center.y, center.z),
    wallMatRef,
    rotationY,
  });
  body.userData.kind = "barrier";
  world.addBody(body);
  return body;
}

/**
 * @param {unknown} b
 * @returns {{ type: string; x: number; z: number; height?: number; shape?: string; variant?: string; width?: number; depth?: number; rotation?: number; triangleQuarter?: 0 | 1 | 2 | 3; color?: string } | null}
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
  if (typeof o.width === "number" && Number.isFinite(o.width) && o.width > 0) out.width = o.width;
  if (typeof o.depth === "number" && Number.isFinite(o.depth) && o.depth > 0) out.depth = o.depth;
  if (typeof o.rotation === "number" && Number.isFinite(o.rotation)) out.rotation = o.rotation;
  if (typeof o.triangleQuarter === "number" && Number.isInteger(o.triangleQuarter)) {
    out.triangleQuarter = /** @type {0 | 1 | 2 | 3} */(((o.triangleQuarter % 4) + 4) % 4);
  }
  if (typeof o.color === "string") out.color = o.color;
  return out;
}

/** Shared façade emissive atlas (N×N cells, each a distinct micro-pattern). */
let buildingFacadeEmissiveCache = null;

const FACADE_ATLAS_CELLS = 4;
const FACADE_VARIANT_COUNT = FACADE_ATLAS_CELLS * FACADE_ATLAS_CELLS;

/** @param {number} seed */
function facadeMulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One façade “tile” of micro windows (lit/dark panes, spandrels). Uses `rng` so atlas cells differ.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox
 * @param {number} oy
 * @param {number} W
 * @param {number} H
 * @param {() => number} rng
 */
function drawFacadeMicroPattern(ctx, ox, oy, W, H, rng) {
  ctx.fillStyle = "#010306";
  ctx.fillRect(ox, oy, W, H);

  const cols = 3;
  const rows = 5;
  const cw = W / cols;
  const ch = H / rows;
  const accentCol = Math.floor(rng() * cols);

  /** @param {number} x @param {number} y @param {number} ww @param {number} hh @param {number} level 0–1 */
  function pane(x, y, ww, hh, level) {
    const a = 0.09 + level * 0.72;
    const r = Math.floor(6 + a * 190);
    const g = Math.floor(8 + a * 210);
    const b = Math.floor(12 + a * 235);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x, y, ww, hh);
  }

  for (let row = 0; row < rows; row++) {
    const spandrel = row === Math.floor(rows / 2);
    for (let col = 0; col < cols; col++) {
      const x = ox + col * cw;
      const y = oy + row * ch;
      const inset = 3.15;
      const pw = cw - inset * 2;
      const ph = spandrel ? ch * 0.28 : ch - inset * 2;
      const py = spandrel ? y + ch * 0.62 + inset * 0.5 : y + inset;

      if (spandrel) {
        ctx.fillStyle = "rgba(2, 6, 12, 0.95)";
        ctx.fillRect(x + inset, y + inset, pw, ch * 0.55);
      }

      const accent = col === accentCol && !spandrel;
      if (accent) {
        pane(x + inset, py, pw, ph, 0.44 + rng() * 0.34);
      } else if (rng() < 0.4) {
        pane(x + inset, py, pw, ph, 0.02 + rng() * 0.08);
      } else {
        pane(x + inset, py, pw, ph, 0.14 + rng() * 0.62);
      }
    }
  }

  ctx.strokeStyle = "rgba(0, 0, 0, 0.78)";
  ctx.lineWidth = 2.15;
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + i * cw, oy);
    ctx.lineTo(ox + i * cw, oy + H);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + j * ch);
    ctx.lineTo(ox + W, oy + j * ch);
    ctx.stroke();
  }
}

/**
 * Procedural emissive atlas: each cell is a full micro-pattern; fragment shader picks a cell per macro UV tile.
 * @returns {THREE.CanvasTexture}
 */
function getBuildingFacadeEmissiveMap() {
  if (buildingFacadeEmissiveCache) return buildingFacadeEmissiveCache;
  const atlasPx = 512;
  const cellPx = atlasPx / FACADE_ATLAS_CELLS;
  const canvas = document.createElement("canvas");
  canvas.width = atlasPx;
  canvas.height = atlasPx;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  let variant = 0;
  for (let row = 0; row < FACADE_ATLAS_CELLS; row++) {
    for (let col = 0; col < FACADE_ATLAS_CELLS; col++) {
      const ox = col * cellPx;
      const oy = row * cellPx;
      const rng = facadeMulberry32(0x9e3779b9 + variant * 0x85ebca6b);
      drawFacadeMicroPattern(ctx, ox, oy, cellPx, cellPx, rng);
      variant++;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  buildingFacadeEmissiveCache = tex;
  return tex;
}

/** Uniforms shared by all façade materials (atlas macro shuffle). */
const buildingFacadeShaderUniforms = {
  uFacadeAtlasDim: { value: new THREE.Vector2(FACADE_ATLAS_CELLS, FACADE_ATLAS_CELLS) },
  uFacadeVariantCount: { value: FACADE_VARIANT_COUNT },
  /** Lower = larger macro tiles on the mesh (less repeated “blocks” across the façade). */
  uFacadeTileDensity: { value: 0.52 },
};

/**
 * @param {THREE.MeshStandardMaterial} mat
 */
function attachBuildingFacadeAtlasShader(mat) {
  mat.customProgramCacheKey = function customProgramCacheKey() {
    return "building_facade_atlas_v1";
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFacadeAtlasDim = buildingFacadeShaderUniforms.uFacadeAtlasDim;
    shader.uniforms.uFacadeVariantCount = buildingFacadeShaderUniforms.uFacadeVariantCount;
    shader.uniforms.uFacadeTileDensity = buildingFacadeShaderUniforms.uFacadeTileDensity;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_pars_fragment>",
      `#include <emissivemap_pars_fragment>
#ifdef USE_EMISSIVEMAP
uniform vec2 uFacadeAtlasDim;
uniform float uFacadeVariantCount;
uniform float uFacadeTileDensity;
#endif`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#ifdef USE_EMISSIVEMAP
	vec2 _facT = vEmissiveMapUv * uFacadeTileDensity;
	vec2 _facCell = floor(_facT);
	vec2 _facFr = fract(_facT);
	float _facH = fract(sin(dot(_facCell, vec2(12.9898, 78.233))) * 43758.5453);
	float _facIx = min(uFacadeVariantCount - 1.0, floor(_facH * uFacadeVariantCount));
	float _facAx = mod(_facIx, uFacadeAtlasDim.x);
	float _facAy = floor(_facIx / uFacadeAtlasDim.x);
	vec2 _facAtlasUv = (vec2(_facAx, _facAy) + _facFr) / uFacadeAtlasDim;
	vec4 emissiveColor = texture2D( emissiveMap, _facAtlasUv );
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,
    );
  };
}

/**
 * PBR material for `building` meshes — façade-like (not a mirror slab). Env map is assigned later via `applyArenaFloorEnvMap` (arena.js).
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 */
function createBuildingFacadeMaterial(playCfg) {
  const neon = barrierNeon(playCfg);
  const lineCol = new THREE.Color(playCfg.colors?.gridLine ?? 0x00e8ff);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0a1522,
    emissive: lineCol,
    emissiveMap: getBuildingFacadeEmissiveMap(),
    emissiveIntensity: 0.24 + neon * 0.38,
    metalness: 0.46,
    roughness: 0.48,
    envMapIntensity: 0.58,
  });
  attachBuildingFacadeAtlasShader(mat);
  return mat;
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

/**
 * Right-triangle prism in local XZ space, with the right angle in the southwest
 * corner before `rotation.y` is applied.
 *
 * @param {number} w
 * @param {number} d
 * @param {number} h
 */
function createRightTrianglePrismGeometry(w, d, h) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const A = [x0, y0, z0];
  const B = [x1, y0, z0];
  const C = [x0, y0, z1];
  const D = [x0, y1, z0];
  const E = [x1, y1, z0];
  const F = [x0, y1, z1];
  /** @type {number[]} */
  const verts = [];
  /** @type {number[]} */
  const uvs = [];

  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {number[]} c
   * @param {number[]} uvA
   * @param {number[]} uvB
   * @param {number[]} uvC
   */
  function tri(a, b, c, uvA, uvB, uvC) {
    verts.push(...a, ...b, ...c);
    uvs.push(...uvA, ...uvB, ...uvC);
  }

  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {number[]} c
   * @param {number[]} d0
   * @param {number} uMax
   * @param {number} vMax
   */
  function quad(a, b, c, d0, uMax, vMax) {
    tri(a, b, c, [0, 0], [0, vMax], [uMax, vMax]);
    tri(a, c, d0, [0, 0], [uMax, vMax], [uMax, 0]);
  }

  // Bottom and top triangles.
  tri(A, C, B, [0, 0], [0, d], [w, 0]);
  tri(D, F, E, [0, 0], [0, d], [w, 0]);
  // Vertical rectangular sides: south edge, west edge, and hypotenuse.
  quad(A, D, E, B, w, h);
  quad(A, C, F, D, d, h);
  quad(B, E, F, C, Math.hypot(w, d), h);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Add a custom right-triangle slide profile so the diagonal edge behaves like a smooth wall.
 * @param {import('cannon-es').World} world
 * @param {import('cannon-es').Material} wallMatRef
 * @param {number} x
 * @param {number} z
 * @param {number} y
 * @param {number} w
 * @param {number} d
 * @param {number} h
 * @param {number} rot
 * @param {import('cannon-es').Body[]} bodies
 */
function addTriangleBarrierBody(world, wallMatRef, x, z, y, w, d, h, rot, bodies) {
  const body = createTriangleBarrierBody({
    center: new Vec3(x, y, z),
    width: w,
    depth: d,
    height: h,
    wallMatRef,
    rotationY: rot,
  });
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const local = [
    { x: -w / 2, z: -d / 2 },
    { x: w / 2, z: -d / 2 },
    { x: -w / 2, z: d / 2 },
  ];
  body.userData = {
    ...(body.userData ?? {}),
    minimapCornersXZ: local.map((p) => ({
      x: x + p.x * cos + p.z * sin,
      z: z - p.x * sin + p.z * cos,
    })),
  };
  world.addBody(body);
  bodies.push(body);
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
  if (style === 0) {
    matBuilding = createBuildingFacadeMaterial(playCfg);
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
  const explicitWallBoxes = [];
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const explicitSquareBuildings = [];
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const nonSquareBuildings = [];
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const structureList = [];

  for (const raw of barriers) {
    const b = coerceBarrier(raw);
    if (!b) continue;

    if (b.type === "wall") {
      if (b.width || b.depth) {
        explicitWallBoxes.push(b);
        continue;
      }
      wallTileKeys.push(tileKey(b.x, b.z));
      continue;
    }

    if (b.type === "building") {
      const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
      const shape = b.shape === "triangle" ? b.shape : "square";
      if (shape === "square") {
        if (b.width || b.depth) {
          explicitSquareBuildings.push(b);
          continue;
        }
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

  for (const b of explicitWallBoxes) {
    const w = typeof b.width === "number" ? b.width : 1;
    const d = typeof b.depth === "number" ? b.depth : 1;
    const mat = materialWithOptionalColor(b.color, matWall, neon);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
    mesh.position.set(b.x, wallH / 2, b.z);
    mesh.rotation.y = b.rotation ?? 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    bodies.push(
      addBarrierBox(
        world,
        wallMatRef,
        { x: w / 2, y: wallH / 2, z: d / 2 },
        { x: b.x, y: wallH / 2, z: b.z },
        b.rotation ?? 0,
      ),
    );
  }

  const H_MULT = 6;
  const buildingGridStep = playCfg.devHud.buildingGridStep ?? 4;

  for (const b of explicitSquareBuildings) {
    const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
    const tallH = h * H_MULT;
    const w = typeof b.width === "number" ? b.width : 1;
    const d = typeof b.depth === "number" ? b.depth : 1;
    const geo = new THREE.BoxGeometry(w, tallH, d);
    if (style === 0) {
      scaleBoxUVs(geo, 1.0 / buildingGridStep);
    }
    const mat = materialWithOptionalColor(b.color, matBuilding, neon);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, tallH / 2, b.z);
    mesh.rotation.y = b.rotation ?? 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    bodies.push(
      addBarrierBox(
        world,
        wallMatRef,
        { x: w / 2, y: tallH / 2, z: d / 2 },
        { x: b.x, y: tallH / 2, z: b.z },
        b.rotation ?? 0,
      ),
    );
  }

  for (const [h, keySet] of squareBuildingsByHeight) {
    const tallH = h * H_MULT;
    for (const seg of mergeAxisAlignedBarrierTiles(keySet)) {
      const geo = new THREE.BoxGeometry(seg.halfX * 2, tallH, seg.halfZ * 2);
      if (style === 0) {
        scaleBoxUVs(geo, 1.0 / buildingGridStep);
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
    const shape = b.shape === "triangle" ? b.shape : "square";
    const w = typeof b.width === "number" ? b.width : 1;
    const d = typeof b.depth === "number" ? b.depth : 1;
    const geo = createRightTrianglePrismGeometry(w, d, tallH);
    if (style === 0) {
      scaleBoxUVs(geo, 1.0 / buildingGridStep);
    }
    const mat = materialWithOptionalColor(b.color, matBuilding, neon);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, tallH / 2, b.z);
    const triRotY = resolveTriangleBuildingRotationY(/** @type {Record<string, unknown>} */ (b));
    mesh.rotation.y = triRotY;
    group.add(mesh);
    addTriangleBarrierBody(world, wallMatRef, b.x, b.z, tallH / 2, w, d, tallH, triRotY, bodies);
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
