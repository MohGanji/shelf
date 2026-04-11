import * as THREE from "three";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import { DEFAULT_DEV_HUD } from "../config.js";

/** Chromatic aberration + neon intensity (linear multiply). */
const TronGradeShader = {
  name: "TronGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.002 },
    neonIntensity: { value: 1.0 },
    uDerezGlitch: { value: 0.0 },
    uDerezFlash: { value: 0.0 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float neonIntensity;
    uniform float uDerezGlitch;
    uniform float uDerezFlash;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float aberr = amount + uDerezGlitch;
      float a = aberr * 14.0;
      float r = texture2D(tDiffuse, vUv + dir * a).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * a).b;
      vec3 col = vec3(r, g, b) * neonIntensity;
      col = mix(col, vec3(1.0), clamp(uDerezFlash, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Horizontal CRT-style scanlines (disabled when uScan is 0). */
/** Cheap radial smear from center — driven only during nitro bursts when enabled in HUD. */
const NitroRadialBlurShader = {
  name: "NitroRadialBlurShader",
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec4 acc = vec4(0.0);
      float wsum = 0.0;
      for (float i = 0.0; i < 6.0; i++) {
        float t = i / 5.0;
        vec2 uvo = vUv - dir * uStrength * t * 0.14;
        float w = 1.0 - t * 0.35;
        acc += texture2D(tDiffuse, uvo) * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc.rgb / max(wsum, 0.0001), 1.0);
    }
  `,
};

const CrtScanlineShader = {
  name: "CrtScanlineShader",
  uniforms: {
    tDiffuse: { value: null },
    uScan: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1024, 1024) },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uScan;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float scan = sin(vUv.y * uResolution.y * 3.14159265) * 0.5 + 0.5;
      float darken = mix(1.0, 0.82 + 0.18 * scan, uScan);
      gl_FragColor = vec4(c.rgb * darken, c.a);
    }
  `,
};

/**
 * Bloom, chromatic aberration, CRT scanlines, OutputPass tone mapping / color space.
 * Matches three.js r160 post-processing patterns (RenderPass → UnrealBloomPass → … → OutputPass).
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {Partial<typeof DEFAULT_DEV_HUD>} [devHud]
 * @param {{ bloomResolutionScale?: number }} [postOpts] P10.2 — values below 1 shrink bloom RT (large GPU savings).
 */
export function createPostPipeline(renderer, scene, camera, devHud = {}, postOpts = {}) {
  const hud = { ...DEFAULT_DEV_HUD, ...devHud };
  const bloomScale =
    typeof postOpts.bloomResolutionScale === "number" && Number.isFinite(postOpts.bloomResolutionScale)
      ? Math.max(0.35, Math.min(1, postOpts.bloomResolutionScale))
      : 1;

  const renderPass = new RenderPass(scene, camera);

  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const drawablePx = new THREE.Vector2(size.x * pr, size.y * pr);
  const bloomRes = new THREE.Vector2(drawablePx.x * bloomScale, drawablePx.y * bloomScale);
  const bloomPass = new UnrealBloomPass(
    bloomRes,
    hud.bloomIntensity,
    0.35,
    hud.bloomThreshold,
  );

  const gradePass = new ShaderPass(TronGradeShader);
  gradePass.material.uniforms.amount.value = hud.chromaticAberration;
  gradePass.material.uniforms.neonIntensity.value = hud.neonIntensity;

  const crtPass = new ShaderPass(CrtScanlineShader);
  crtPass.material.uniforms.uScan.value = hud.crtScanlines ? 1.0 : 0.0;
  crtPass.material.uniforms.uResolution.value.set(drawablePx.x, drawablePx.y);

  const nitroPass = new ShaderPass(NitroRadialBlurShader);
  nitroPass.material.uniforms.uStrength.value = 0;

  const outputPass = new OutputPass();

  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(crtPass);
  composer.addPass(nitroPass);
  composer.addPass(outputPass);

  function syncFog() {
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = hud.fogDensity;
    }
  }

  function applyDevHud(patch = {}) {
    Object.assign(hud, patch);
    syncFog();
    bloomPass.strength = hud.bloomIntensity;
    bloomPass.threshold = hud.bloomThreshold;
    gradePass.material.uniforms.amount.value = hud.chromaticAberration;
    gradePass.material.uniforms.neonIntensity.value = hud.neonIntensity;
    crtPass.material.uniforms.uScan.value = hud.crtScanlines ? 1.0 : 0.0;
  }

  /** @param {{ strength?: number }} [opts] strength 0–1 */
  function setNitroFx(opts = {}) {
    const s = typeof opts.strength === "number" ? opts.strength : 0;
    const on = hud.nitroMotionBlur !== false;
    nitroPass.material.uniforms.uStrength.value = on ? Math.max(0, Math.min(1, s)) : 0;
  }

  /**
   * Player derez only (plan P2.4): chroma spike + white flash — cleared when zeros.
   * @param {{ glitch?: number; flash?: number }} [opts] glitch/flash 0–1
   */
  function setDerezPostFx(opts = {}) {
    const g = typeof opts.glitch === "number" ? opts.glitch : 0;
    const f = typeof opts.flash === "number" ? opts.flash : 0;
    gradePass.material.uniforms.uDerezGlitch.value = Math.max(0, Math.min(1, g));
    gradePass.material.uniforms.uDerezFlash.value = Math.max(0, Math.min(1, f));
  }

  syncFog();

  return {
    composer,
    /** @param {number} w @param {number} h */
    setSize(w, h) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      const dpr = renderer.getPixelRatio();
      const fullW = w * dpr;
      const fullH = h * dpr;
      bloomPass.resolution.set(fullW * bloomScale, fullH * bloomScale);
      crtPass.material.uniforms.uResolution.value.set(fullW, fullH);
    },
    render() {
      composer.render();
    },
    applyDevHud,
    setNitroFx,
    setDerezPostFx,
    dispose() {
      composer.dispose();
      bloomPass.dispose();
      gradePass.dispose();
      crtPass.dispose();
      nitroPass.dispose();
      outputPass.dispose();
    },
  };
}
