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
  },
  vertexShader: CopyShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float neonIntensity;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      float a = amount * 14.0;
      float r = texture2D(tDiffuse, vUv + dir * a).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir * a).b;
      vec3 col = vec3(r, g, b) * neonIntensity;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Horizontal CRT-style scanlines (disabled when uScan is 0). */
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
 */
export function createPostPipeline(renderer, scene, camera, devHud = {}) {
  const hud = { ...DEFAULT_DEV_HUD, ...devHud };

  const renderPass = new RenderPass(scene, camera);

  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  const bloomRes = new THREE.Vector2(size.x * pr, size.y * pr);
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
  crtPass.material.uniforms.uResolution.value.set(bloomRes.x, bloomRes.y);

  const outputPass = new OutputPass();

  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(gradePass);
  composer.addPass(crtPass);
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

  syncFog();

  return {
    composer,
    /** @param {number} w @param {number} h */
    setSize(w, h) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      const dpr = renderer.getPixelRatio();
      const rw = w * dpr;
      const rh = h * dpr;
      bloomPass.resolution.set(rw, rh);
      crtPass.material.uniforms.uResolution.value.set(rw, rh);
    },
    render() {
      composer.render();
    },
    applyDevHud,
    dispose() {
      composer.dispose();
      bloomPass.dispose();
      gradePass.dispose();
      crtPass.dispose();
      outputPass.dispose();
    },
  };
}
