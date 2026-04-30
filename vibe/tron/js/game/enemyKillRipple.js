/**
 * Single expanding floor ripple (vertex-displaced mesh + grid read in fragment).
 * Cinematic: slow expansion during implode (explosion / slow-mo); fast expansion + fade after camera return.
 */

import * as THREE from "../vendor/three-module.js";
import { getFloorGridLineStep } from "../config.js";

/**
 * @typedef {"off" | "armed" | "slow" | "fast" | "runoff" | "stacked"} RippleMode
 */

/**
 * @typedef {object} EnemyKillRipple
 * @property {(wx: number, wz: number, colorCss: string) => void} armCinematic
 * @property {() => void} onCinematicImplode
 * @property {() => void} onCinematicReturn
 * @property {() => void} onCinematicFinished
 * @property {() => void} onCinematicAborted
 * @property {(wx: number, wz: number, colorCss: string) => void} triggerStackedFast
 * @property {(dt: number) => void} tick
 * @property {() => void} dispose
 */

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {{ arenaWidth: number; arenaDepth: number; devHud?: import("../config.js").DEFAULT_DEV_HUD }} o.playCfg
 * @returns {EnemyKillRipple}
 */
export function createEnemyKillRipple(o) {
  const { scene, playCfg } = o;
  const aw = playCfg.arenaWidth;
  const ad = playCfg.arenaDepth;
  const gridStep = Math.max(2, getFloorGridLineStep(playCfg.devHud ?? {}));

  const seg = 96;
  const geo = new THREE.PlaneGeometry(aw, ad, seg, seg);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uDeath: { value: new THREE.Vector2(0, 0) },
      uRingRadius: { value: 0 },
      uRippleAmp: { value: 0 },
      uGridStep: { value: gridStep },
      uColor: { value: new THREE.Color(0x66ffaa) },
    },
    vertexShader: `
      uniform vec2 uDeath;
      uniform float uRingRadius;
      uniform float uRippleAmp;
      varying float vCrest;
      varying vec2 vWorldXZ;

      void main() {
        vec4 wm0 = modelMatrix * vec4(position, 1.0);
        vWorldXZ = wm0.xz;
        float r = length(wm0.xz - uDeath.xy);
        float sig = max(6.0, uRingRadius * 0.13 + 2.0);
        float ring = exp(-pow((r - uRingRadius) / sig, 2.0));
        ring *= smoothstep(0.0, 5.0, r);
        float h = uRippleAmp * ring * 2.15;
        vCrest = ring * uRippleAmp;
        vec3 displaced = vec3(position.x, position.y, h);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uGridStep;
      varying float vCrest;
      varying vec2 vWorldXZ;

      float gridLine(vec2 xz) {
        vec2 g = fract(xz / uGridStep + 0.5);
        float lx = min(g.x, 1.0 - g.x);
        float lz = min(g.y, 1.0 - g.y);
        float m = min(lx, lz) * uGridStep;
        return 1.0 - smoothstep(0.04, 0.18, m);
      }

      void main() {
        float g = gridLine(vWorldXZ);
        float k = vCrest * (0.38 + 0.62 * g);
        float a = clamp(k * 1.25, 0.0, 0.92);
        vec3 col = uColor * (0.12 + k * 2.1) * (0.45 + 0.55 * g);
        gl_FragColor = vec4(col, a);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "enemy-kill-ripple-floor";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.055;
  mesh.frustumCulled = false;
  mesh.renderOrder = 14;
  mesh.visible = false;

  const root = new THREE.Group();
  root.name = "enemy-kill-ripple";
  root.add(mesh);
  scene.add(root);

  /** @type {RippleMode} */
  let mode = "off";
  let ringRadius = 0;
  let rippleAmp = 0;

  const slowFront = 11;
  const fastFront = 155;
  const ampDecaySlow = 0.11;
  const ampDecayFast = 0.62;
  const ampDecayRunoff = 0.85;
  const maxRing = Math.hypot(aw, ad) * 0.72;

  function setColor(css) {
    try {
      mat.uniforms.uColor.value.set(css);
    } catch {
      mat.uniforms.uColor.value.set(0x66ffcc);
    }
  }

  function syncUniforms() {
    mat.uniforms.uRingRadius.value = ringRadius;
    mat.uniforms.uRippleAmp.value = rippleAmp;
  }

  function hideIfDead() {
    if (rippleAmp < 0.028 && (mode === "fast" || mode === "runoff" || mode === "stacked")) {
      mode = "off";
      mesh.visible = false;
      rippleAmp = 0;
      ringRadius = 0;
      syncUniforms();
    }
  }

  return {
    armCinematic(wx, wz, colorCss) {
      mat.uniforms.uDeath.value.set(wx, wz);
      setColor(colorCss);
      mode = "armed";
      mesh.visible = false;
      ringRadius = 0;
      rippleAmp = 0;
      syncUniforms();
    },

    onCinematicImplode() {
      if (mode !== "armed") return;
      mode = "slow";
      mesh.visible = true;
      ringRadius = 2.4;
      rippleAmp = 1;
      syncUniforms();
    },

    onCinematicReturn() {
      if (mode !== "slow") return;
      mode = "fast";
    },

    onCinematicFinished() {
      if (mode === "slow") mode = "fast";
      if (mode === "fast") mode = "runoff";
    },

    onCinematicAborted() {
      if (mode === "armed") {
        mode = "off";
        mesh.visible = false;
        rippleAmp = 0;
        ringRadius = 0;
        syncUniforms();
      }
    },

    triggerStackedFast(wx, wz, colorCss) {
      mat.uniforms.uDeath.value.set(wx, wz);
      setColor(colorCss);
      mode = "stacked";
      mesh.visible = true;
      ringRadius = 2.2;
      rippleAmp = 0.88;
      syncUniforms();
    },

    tick(dt) {
      if (mode === "off" || mode === "armed" || dt <= 0) return;

      if (mode === "slow") {
        ringRadius += dt * slowFront;
        rippleAmp *= Math.exp(-dt * ampDecaySlow);
      } else if (mode === "fast") {
        ringRadius += dt * fastFront;
        rippleAmp *= Math.exp(-dt * ampDecayFast);
      } else if (mode === "runoff" || mode === "stacked") {
        const sp = mode === "stacked" ? fastFront * 0.95 : fastFront * 1.05;
        ringRadius += dt * sp;
        rippleAmp *= Math.exp(-dt * (mode === "stacked" ? ampDecayFast * 1.15 : ampDecayRunoff));
      }

      if (ringRadius > maxRing) {
        ringRadius = maxRing;
        rippleAmp *= Math.exp(-dt * 2.2);
      }

      syncUniforms();
      hideIfDead();
    },

    dispose() {
      scene.remove(root);
      geo.dispose();
      mat.dispose();
    },
  };
}
