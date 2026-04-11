import * as THREE from "three";

import { DEFAULT_DEV_HUD } from "../config.js";
import { createPostPipeline } from "./post.js";

const CYAN = 0x00ffff;
const GRID = 0x1a1a3e;

/**
 * Tron-grid tunnel (BOOT + universal transition). Inner surface shader approximates emissive grid lines.
 */
function createTunnelMaterial(gridBrightness = DEFAULT_DEV_HUD.gridBrightness) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uGridBrightness: { value: gridBrightness },
      uAccent: { value: new THREE.Color(CYAN) },
      uGridColor: { value: new THREE.Color(GRID) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uGridBrightness;
      uniform vec3 uAccent;
      uniform vec3 uGridColor;

      float gridLine(vec2 uv, float cells) {
        vec2 g = fract(uv * cells);
        float lx = smoothstep(0.0, 0.04, g.x) * smoothstep(1.0, 0.96, g.x);
        float ly = smoothstep(0.0, 0.04, g.y) * smoothstep(1.0, 0.96, g.y);
        return 1.0 - min(lx * ly, 1.0);
      }

      void main() {
        float scroll = vUv.y * 6.28318 + uTime * 1.2;
        float g1 = gridLine(vec2(vUv.x + scroll * 0.02, vUv.y), vec2(24.0, 48.0));
        float pulse = 0.55 + 0.45 * sin(uTime * 2.0 + vUv.x * 10.0);
        vec3 base = mix(uGridColor * 0.15, uAccent, g1 * uGridBrightness * pulse);
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ devHud?: Partial<typeof DEFAULT_DEV_HUD> }} [opts]
 */
export function createGameRenderer(canvas, opts = {}) {
  const devHud = { ...DEFAULT_DEV_HUD, ...opts.devHud };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.FogExp2(0x050510, devHud.fogDensity);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 500);
  camera.position.set(0, 0, -12);
  camera.lookAt(0, 0, 40);

  const tunnelMat = createTunnelMaterial(devHud.gridBrightness);
  const tunnelGeom = new THREE.CylinderGeometry(9, 9, 220, 48, 12, true);
  const tunnel = new THREE.Mesh(tunnelGeom, tunnelMat);
  tunnel.rotation.x = Math.PI / 2;
  tunnel.position.z = 40;
  scene.add(tunnel);

  const ambient = new THREE.AmbientLight(0x223344, 0.4);
  scene.add(ambient);

  const composer = createPostPipeline(renderer, scene, camera);

  let running = false;
  let rafId = 0;
  let lastFrameTimeMs = 0;

  /** @type {((args: { t: number; dt: number }) => void) | null} */
  let onFrame = null;

  function setOnFrame(fn) {
    onFrame = fn;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
  }

  function renderFrame(timeMs) {
    const t = timeMs * 0.001;
    let dt = 0;
    if (lastFrameTimeMs > 0) {
      dt = Math.min((timeMs - lastFrameTimeMs) * 0.001, 0.05);
    }
    lastFrameTimeMs = timeMs;

    tunnelMat.uniforms.uTime.value = t;
    if (onFrame) onFrame({ t, dt });
    composer.render();
  }

  function startLoop() {
    if (running) return;
    running = true;
    const loop = (tf) => {
      if (!running) return;
      rafId = requestAnimationFrame(loop);
      renderFrame(tf);
    };
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  window.addEventListener("resize", resize);
  resize();

  return {
    renderer,
    scene,
    camera,
    tunnel,
    tunnelMaterial: tunnelMat,
    composer,
    startLoop,
    stopLoop,
    resize,
    setOnFrame,
    dispose() {
      stopLoop();
      onFrame = null;
      lastFrameTimeMs = 0;
      window.removeEventListener("resize", resize);
      tunnelGeom.dispose();
      tunnelMat.dispose();
      renderer.dispose();
    },
  };
}
