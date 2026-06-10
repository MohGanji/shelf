import * as THREE from "../vendor/three-module.js";
import { CopyShader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/CopyShader.js";
import { FXAAShader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { EffectComposer } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js";

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

/** Cheap vignette + animated grain (tier-gated). */
const FilmGradeShader = {
  name: "FilmGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.04 },
    uTime: { value: 0 },
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 dc = vUv - 0.5;
      float vig = 1.0 - dot(dc, dc) * uVignette * 1.45;
      vig = clamp(vig, 0.0, 1.0);
      float n = (hash(vUv * 1200.0 + uTime * 3.7) - 0.5) * uGrain;
      gl_FragColor = vec4(c.rgb * vig + n, c.a);
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
 * @param {{ bloomResolutionScale?: number; postFilmStrength?: number; postAntialias?: 'off' | 'fxaa' | 'smaa' }} [postOpts] P10.2 — values below 1 shrink bloom RT (large GPU savings).
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
  const bloomRadius =
    typeof hud.bloomRadius === "number" && Number.isFinite(hud.bloomRadius) ? hud.bloomRadius : 0.4;
  const bloomPass = new UnrealBloomPass(bloomRes, hud.bloomIntensity, bloomRadius, hud.bloomThreshold);

  const gradePass = new ShaderPass(TronGradeShader);
  gradePass.material.uniforms.amount.value = hud.chromaticAberration;
  gradePass.material.uniforms.neonIntensity.value = hud.neonIntensity;

  const crtPass = new ShaderPass(CrtScanlineShader);
  crtPass.material.uniforms.uScan.value = hud.crtScanlines ? 1.0 : 0.0;
  crtPass.material.uniforms.uResolution.value.set(drawablePx.x, drawablePx.y);
  /** Full-screen pass — skip entirely unless scanlines are on (visually identical at uScan=0). */
  crtPass.enabled = !!hud.crtScanlines;

  const nitroPass = new ShaderPass(NitroRadialBlurShader);
  nitroPass.material.uniforms.uStrength.value = 0;
  /** Full-screen 6-tap blur — skip entirely until a nitro burst drives strength above ~0. */
  nitroPass.enabled = false;

  const filmStrength =
    typeof postOpts.postFilmStrength === "number" && Number.isFinite(postOpts.postFilmStrength)
      ? Math.max(0, postOpts.postFilmStrength)
      : 0;
  const aaMode = postOpts.postAntialias === "fxaa" || postOpts.postAntialias === "smaa" ? postOpts.postAntialias : "off";
  /**
   * FXAA blurs the whole frame and hides film grain; SMAA does not, so any `uGrain` reads as harsh
   * stippling on bloom. Disable grain for SMAA; vignette from this pass stays.
   */
  const filmGrainMul = aaMode === "smaa" ? 0 : 1;
  const filmPass = new ShaderPass(FilmGradeShader);
  filmPass.material.uniforms.uVignette.value = filmStrength > 0 ? 0.22 + filmStrength * 0.65 : 0;
  filmPass.material.uniforms.uGrain.value =
    filmStrength > 0 ? (0.018 + filmStrength * 0.07) * filmGrainMul : 0;
  filmPass.enabled = filmStrength > 0.001;

  const outputPass = new OutputPass();

  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(crtPass);
  composer.addPass(nitroPass);
  composer.addPass(filmPass);

  /** @type {ShaderPass | InstanceType<typeof SMAAPass> | null} */
  let aaPass = null;
  if (aaMode === "fxaa") {
    aaPass = new ShaderPass(FXAAShader);
    composer.addPass(aaPass);
  } else if (aaMode === "smaa") {
    const ds0 = new THREE.Vector2();
    renderer.getDrawingBufferSize(ds0);
    aaPass = new SMAAPass(Math.max(1, ds0.x), Math.max(1, ds0.y));
    composer.addPass(aaPass);
  }

  composer.addPass(outputPass);

  function syncAaResolution() {
    if (!aaPass) return;
    const ds = new THREE.Vector2();
    renderer.getDrawingBufferSize(ds);
    const sx = Math.max(1, ds.x);
    const sy = Math.max(1, ds.y);
    if (aaMode === "fxaa") {
      aaPass.material.uniforms.resolution.value.set(1 / sx, 1 / sy);
    } else if (aaMode === "smaa") {
      aaPass.setSize(sx, sy);
    }
  }

  syncAaResolution();

  function syncFog() {
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.density = hud.fogDensity;
    }
  }

  function applyDevHud(patch = {}) {
    Object.assign(hud, patch);
    syncFog();
    bloomPass.strength = hud.bloomIntensity;
    bloomPass.radius =
      typeof hud.bloomRadius === "number" && Number.isFinite(hud.bloomRadius) ? hud.bloomRadius : 0.4;
    bloomPass.threshold = hud.bloomThreshold;
    gradePass.material.uniforms.amount.value = hud.chromaticAberration;
    gradePass.material.uniforms.neonIntensity.value = hud.neonIntensity;
    crtPass.material.uniforms.uScan.value = hud.crtScanlines ? 1.0 : 0.0;
    crtPass.enabled = !!hud.crtScanlines;
  }

  /** @param {{ strength?: number }} [opts] strength 0–1 */
  function setNitroFx(opts = {}) {
    const s = typeof opts.strength === "number" ? opts.strength : 0;
    const on = hud.nitroMotionBlur !== false;
    const strength = on ? Math.max(0, Math.min(1, s)) : 0;
    nitroPass.material.uniforms.uStrength.value = strength;
    nitroPass.enabled = strength > 0.01;
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
      syncAaResolution();
    },
    render() {
      if (filmPass.enabled) {
        filmPass.material.uniforms.uTime.value = performance.now() * 0.001;
      }
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
      filmPass.dispose();
      aaPass?.dispose();
      outputPass.dispose();
    },
  };
}
