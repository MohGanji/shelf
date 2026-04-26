import * as THREE from "../vendor/three-module.js";
import { CONFIG } from "../config.js";
import { attachFacadeAtlasEmissiveShader, getBuildingFacadeEmissiveMap } from "./facadeEmissiveAtlas.js";

let tunnelBlocksInput = false;

/** Macro façade tiles around the tunnel cylinder (higher = more “building” blocks in view). */
const TUNNEL_FACADE_TILE_DENSITY = 5.5;

/** Fired on `window` when a tunnel session starts or ends — `detail.active` true while flying. */
export const TUNNEL_SESSION_EVENT = 'tron-tunnel-session';

/** True while a tunnel animation is running — keyboard handlers must ignore input (no buffering). */
export function isTunnelBlockingInput() {
  return tunnelBlocksInput;
}

function dispatchTunnelSession(active) {
  window.dispatchEvent(
    new CustomEvent(TUNNEL_SESSION_EVENT, {
      detail: { active },
    }),
  );
}

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.emissiveMap && m.emissiveMap.userData && m.emissiveMap.userData.sharedBuildingFacadeAtlas) {
          m.emissiveMap = null;
        }
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (val && typeof val.dispose === "function" && val !== m) val.dispose();
        }
        m.dispose();
      }
    }
  });
}

/**
 * Universal transition (plan § Level Transitions + X2): Tron-grid cylinder tunnel, camera along axis.
 * Use for BOOT, lobby ↔ level, garage, editor, quit — same geometry; vary `durationSeconds` only.
 *
 * Contract:
 * - While running, {@link isTunnelBlockingInput} is true — discard input, do not buffer.
 * - `onBegin` runs immediately after input block (clear trails, reset equip, etc.); `onComplete` runs after the fly-through (teleport / spawn-at-entrance rules live here once the state machine exists).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {() => void} [onComplete]
 * @param {{ durationSeconds?: number; onBegin?: () => void; devHud?: Partial<import("../config.js").DEFAULT_DEV_HUD> }} [options]
 * @returns {Promise<void>}
 */
export function playTunnel(renderer, onComplete, options = {}) {
  const durationSeconds =
    typeof options.durationSeconds === 'number' ? options.durationSeconds : CONFIG.tunnelGateSeconds;
  const onBegin = typeof options.onBegin === 'function' ? options.onBegin : null;

  return new Promise((resolve, reject) => {
    tunnelBlocksInput = true;
    dispatchTunnelSession(true);
    try {
      onBegin?.();
    } catch (err) {
      tunnelBlocksInput = false;
      dispatchTunnelSession(false);
      reject(err);
      return;
    }

    try {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050510, 0.012);

    const camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / Math.max(window.innerHeight, 1),
      0.1,
      500
    );

    const radius = CONFIG.tunnelRadius;
    const length = CONFIG.tunnelLength;
    const facadeMap = getBuildingFacadeEmissiveMap();

    const mat = new THREE.MeshStandardMaterial({
      emissiveMap: facadeMap,
      color: 0x060a14,
      emissive: 0x55c8e8,
      emissiveIntensity: 0.92,
      metalness: 0.44,
      roughness: 0.48,
      side: THREE.BackSide,
    });
    attachFacadeAtlasEmissiveShader(mat, {
      programSuffix: "tunnel",
      tileDensity: TUNNEL_FACADE_TILE_DENSITY,
    });

    const cylinder = new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      CONFIG.tunnelRadialSegments,
      1,
      true
    );
    const mesh = new THREE.Mesh(cylinder, mat);
    mesh.rotation.x = Math.PI / 2;
    scene.add(mesh);

    const amb = new THREE.AmbientLight(0x223344, 0.4);
    scene.add(amb);
    const inner = new THREE.PointLight(0x00ffff, 2.5, length * 1.5);
    inner.position.set(0, 0, 0);
    scene.add(inner);

    const zStart = -length / 2 + 4;
    const zEnd = length / 2 - 4;
    camera.position.set(0, 0, zStart);
    camera.lookAt(0, 0, zEnd);

    const t0 = performance.now();
    let last = t0;
    let raf = 0;

    const finish = () => {
      cancelAnimationFrame(raf);
      disposeObject3D(scene);
      scene.fog = null;
      dispatchTunnelSession(false);
      tunnelBlocksInput = false;
      if (typeof onComplete === 'function') onComplete();
      resolve();
    };

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - t0) / 1000;
      const dur = Math.max(0.0001, durationSeconds);
      const alpha = Math.min(1, elapsed / dur);
      const eased = 1 - Math.pow(1 - alpha, 2);
      const z = zStart + (zEnd - zStart) * eased;
      camera.position.z = z;
      camera.lookAt(0, 0, z + 12);

      facadeMap.offset.y -= 0.22 * dt;
      facadeMap.offset.x -= 0.05 * dt;

      inner.position.z = z;

      camera.aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);

      if (alpha >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    } catch (err) {
      dispatchTunnelSession(false);
      tunnelBlocksInput = false;
      reject(err);
    }
  });
}
