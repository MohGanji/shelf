import * as THREE from 'three';
import { CONFIG } from '../config.js';

let tunnelBlocksInput = false;

/** True while a tunnel animation is running — keyboard handlers must ignore input (no buffering). */
export function isTunnelBlockingInput() {
  return tunnelBlocksInput;
}

function createGridTextures() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#00ffff';
  ctx.lineWidth = 2;
  const step = 32;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(CONFIG.tunnelGridRepeatU, CONFIG.tunnelGridRepeatV);
  return tex;
}

function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (val && typeof val.dispose === 'function' && val !== m) val.dispose();
        }
        m.dispose();
      }
    }
  });
}

/**
 * Full-screen tunnel transition: open-ended cylinder, emissive grid, camera flies along axis.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {() => void} [onComplete]
 * @param {{ durationSeconds?: number }} [options]
 * @returns {Promise<void>}
 */
export function playTunnel(renderer, onComplete, options = {}) {
  const durationSeconds =
    typeof options.durationSeconds === 'number' ? options.durationSeconds : CONFIG.tunnelGateSeconds;

  return new Promise((resolve, reject) => {
    tunnelBlocksInput = true;

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
    const gridMap = createGridTextures();

    const mat = new THREE.MeshStandardMaterial({
      emissiveMap: gridMap,
      color: 0x050818,
      emissive: 0xaaddff,
      emissiveIntensity: 1.15,
      metalness: 0.4,
      roughness: 0.42,
      side: THREE.BackSide,
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

      gridMap.offset.y -= 0.45 * dt;
      gridMap.offset.x -= 0.1 * dt;

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
      tunnelBlocksInput = false;
      reject(err);
    }
  });
}
