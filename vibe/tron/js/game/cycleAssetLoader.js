/**
 * Loads optional light-cycle mesh: GLTF/GLB (preferred) or SVG side profile (extruded).
 * Normalized to {@link CYCLE_BOUNDS}; game convention Y-up, local +Z forward.
 */

import * as THREE from "../vendor/three-module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { CYCLE_BOUNDS, WORLD } from "../config.js";

/** @type {THREE.Object3D | null} */
let loadedTemplate = null;

export function hasLoadedCycleAsset() {
  return loadedTemplate != null;
}

/**
 * @returns {THREE.Object3D | null} normalized root (not added to scene); clone per cycle instance
 */
export function getCycleAssetTemplate() {
  return loadedTemplate;
}

/**
 * @param {string} [urlOverride] — defaults to `WORLD.lightCycleModelUrl`
 */
export async function preloadLightCycleAsset(urlOverride) {
  loadedTemplate = null;
  const raw = urlOverride ?? WORLD.lightCycleModelUrl ?? "";
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) return;

  try {
    if (/\.svg(\?|#|$)/i.test(url)) {
      loadedTemplate = await loadSvgExtruded(url);
    } else {
      loadedTemplate = await loadGltfRoot(url);
    }
    normalizeCycleModel(loadedTemplate);
  } catch (err) {
    console.warn("[cycle] Could not load light cycle asset — using procedural mesh:", url, err);
    loadedTemplate = null;
  }
}

/**
 * @param {string} url
 * @returns {Promise<THREE.Group>}
 */
function loadGltfRoot(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    );
  });
}

/**
 * @param {string} url
 * @returns {Promise<THREE.Group>}
 */
async function loadSvgExtruded(url) {
  const loader = new SVGLoader();
  const data = await new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  const group = new THREE.Group();
  const { width: targetW, length: targetL, height: targetH } = CYCLE_BOUNDS;
  const extrudeDepth = Math.max(targetW * 0.92, 0.08);

  for (const path of data.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: extrudeDepth,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 2,
        curveSegments: 12,
      });
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a1f28,
        metalness: 0.82,
        roughness: 0.22,
        emissive: 0x001018,
        emissiveIntensity: 0.35,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Profile lies in XY; extrusion is +Z (bike width). Long axis of silhouette ~X → map +X to +Z forward.
  group.rotation.y = Math.PI / 2;
  group.updateMatrixWorld(true);

  // Rough centering before uniform normalize
  const box0 = new THREE.Box3().setFromObject(group);
  const c0 = new THREE.Vector3();
  box0.getCenter(c0);
  group.position.sub(c0);

  return group;
}

/**
 * Scale and ground the model to fit inside CYCLE_BOUNDS (uniform scale).
 * @param {THREE.Object3D} root
 */
function normalizeCycleModel(root) {
  const { length: L, width: W, height: H } = CYCLE_BOUNDS;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const sx = W / Math.max(size.x, 1e-5);
  const sy = H / Math.max(size.y, 1e-5);
  const sz = L / Math.max(size.z, 1e-5);
  const u = Math.min(sx, sy, sz);
  root.scale.multiplyScalar(u);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  box2.getCenter(center);
  root.position.sub(center);

  root.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(root);
  root.position.y -= box3.min.y;
}
