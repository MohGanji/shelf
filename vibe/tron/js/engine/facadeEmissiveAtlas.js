import * as THREE from "../vendor/three-module.js";

/** Shared façade emissive atlas (N×N cells, each a distinct micro-pattern). */
let facadeEmissiveAtlasCache = null;

const FACADE_ATLAS_CELLS = 4;
const FACADE_VARIANT_COUNT = FACADE_ATLAS_CELLS * FACADE_ATLAS_CELLS;

/** Default macro shuffle density on arena buildings (matches prior tuning). */
export const FACADE_TILE_DENSITY_BUILDINGS = 0.52;

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
export function getBuildingFacadeEmissiveMap() {
  if (facadeEmissiveAtlasCache) return facadeEmissiveAtlasCache;
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
  tex.userData.sharedBuildingFacadeAtlas = true;
  facadeEmissiveAtlasCache = tex;
  return tex;
}

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {{ tileDensity?: number; programSuffix?: string }} [opts]
 */
export function attachFacadeAtlasEmissiveShader(mat, opts = {}) {
  const tileDensity =
    typeof opts.tileDensity === "number" && Number.isFinite(opts.tileDensity)
      ? opts.tileDensity
      : FACADE_TILE_DENSITY_BUILDINGS;
  const programSuffix = typeof opts.programSuffix === "string" ? opts.programSuffix : "bldg";

  mat.customProgramCacheKey = function customProgramCacheKey() {
    return `facade_atlas_${programSuffix}_v1`;
  };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFacadeAtlasDim = { value: new THREE.Vector2(FACADE_ATLAS_CELLS, FACADE_ATLAS_CELLS) };
    shader.uniforms.uFacadeVariantCount = { value: FACADE_VARIANT_COUNT };
    shader.uniforms.uFacadeTileDensity = { value: tileDensity };

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
