/**
 * Non-barrier arena objects: boost pads, portals (plan § Game Objects).
 * Boost pads — P3.5: visuals, global cooldown per pad, free 1-bar-equivalent nitro burst.
 */

import * as THREE from "three";
import { applyBoostPadBurst } from "./nitroSystem.js";

/** @typedef {"boost_pad" | "portal"} GameObjectKind */

export const GAME_OBJECT_TYPES = Object.freeze(
  /** @type {readonly GameObjectKind[]} */ (["boost_pad", "portal"]),
);

/**
 * @param {unknown} t
 * @returns {t is GameObjectKind}
 */
export function isGameObjectType(t) {
  return t === "boost_pad" || t === "portal";
}

/** Horizontal clearance from pad center to trigger (matches ~2.4 u floor panel). */
const BOOST_PAD_TRIGGER_RADIUS = 1.35;

/**
 * @typedef {object} BoostPadTickContext
 * @property {boolean} isLobby
 * @property {boolean} levelStarted
 * @property {import('cannon-es').Body} playerBody
 * @property {import('./nitroSystem.js').NitroRuntimeState} nitroState
 * @property {import('./enemies.js').CampaignEnemyEntity[]} enemies
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @property {() => void} onBoost — SFX once when a pad fires (player or enemy)
 */

/**
 * Spawns boost pad meshes from `level.gameObjects` and handles ride-over + shared cooldown.
 *
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {unknown[] | null | undefined} opts.gameObjects
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: BoostPadTickContext) => void; dispose: () => void }}
 */
export function createBoostPadField(opts) {
  const { scene, devHud } = opts;
  const raw = opts.gameObjects;
  const root = new THREE.Group();
  root.name = "boost-pads";

  /**
   * @typedef {object} PadInst
   * @property {number} x
   * @property {number} z
   * @property {THREE.Group} node
   * @property {THREE.Mesh} mesh
   * @property {THREE.MeshStandardMaterial} mat
   * @property {number} baseEmissive
   * @property {number} cooldownUntilMs
   */
  /** @type {PadInst[]} */
  const instances = [];

  if (!Array.isArray(raw)) {
    scene.add(root);
    return {
      root,
      tick() {},
      dispose() {
        scene.remove(root);
      },
    };
  }

  const neon = devHud.neonIntensity ?? 1;
  const gridLine = typeof devHud.gridBrightness === "number" ? devHud.gridBrightness : 0.4;

  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (!g || typeof g !== "object") continue;
    if (/** @type {unknown} */ (g).type !== "boost_pad") continue;
    const x = typeof g.x === "number" ? g.x : 0;
    const z = typeof g.z === "number" ? g.z : 0;

    const geo = new THREE.BoxGeometry(2.4, 0.07, 2.4);
    const em = 0x55eeff;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a1a22,
      emissive: em,
      emissiveIntensity: 0.75 * neon,
      metalness: 0.35,
      roughness: 0.35,
      transparent: true,
      opacity: 0.96,
    });
    const mesh = /** @type {THREE.Mesh} */ (new THREE.Mesh(geo, mat));
    mesh.position.y = 0.045;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.15, 32),
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.35 + gridLine * 0.25,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.078;

    const node = new THREE.Group();
    node.position.set(x, 0, z);
    node.add(mesh);
    node.add(ring);

    instances.push({
      x,
      z,
      node,
      mesh,
      mat,
      baseEmissive: 0.75,
      cooldownUntilMs: 0,
    });
    root.add(node);
  }

  scene.add(root);

  /**
   * @param {number} _dt
   * @param {BoostPadTickContext} ctx
   */
  function tick(_dt, ctx) {
    const { isLobby, levelStarted, playerBody, nitroState, enemies, devHud: hud, onBoost } = ctx;
    if (isLobby || !levelStarted) return;

    const burstBase = typeof hud.nitroBurstDuration === "number" ? hud.nitroBurstDuration : 0.5;
    const str = typeof hud.boostPadStrength === "number" ? hud.boostPadStrength : 1;
    const burstDur = Math.max(0.05, burstBase * str);
    const coolSec = typeof hud.specialObjectCooldown === "number" ? hud.specialObjectCooldown : 5;
    const coolMs = Math.max(0.2, coolSec) * 1000;
    const nMul = hud.neonIntensity ?? 1;

    const now = performance.now();

    for (const inst of instances) {
      const cooling = now < inst.cooldownUntilMs;
      inst.mat.emissiveIntensity = (cooling ? inst.baseEmissive * 0.2 : inst.baseEmissive) * nMul;

      if (cooling) continue;

      let fired = false;

      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      if (Math.hypot(px - inst.x, pz - inst.z) < BOOST_PAD_TRIGGER_RADIUS) {
        applyBoostPadBurst(nitroState, burstDur);
        fired = true;
      }

      if (!fired) {
        for (const e of enemies) {
          if (e.eliminated) continue;
          const ex = e.body.position.x;
          const ez = e.body.position.z;
          if (Math.hypot(ex - inst.x, ez - inst.z) < BOOST_PAD_TRIGGER_RADIUS) {
            applyBoostPadBurst(e.nitroState, burstDur);
            fired = true;
            break;
          }
        }
      }

      if (fired) {
        inst.cooldownUntilMs = now + coolMs;
        onBoost();
      }
    }
  }

  function dispose() {
    scene.remove(root);
    for (const inst of instances) {
      inst.mesh.geometry.dispose();
      const children = inst.node.children;
      for (let c = 0; c < children.length; c++) {
        const ch = children[c];
        if (ch instanceof THREE.Mesh && ch !== inst.mesh) {
          ch.geometry.dispose();
          const m = ch.material;
          if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
        }
      }
      const m = inst.mesh.material;
      if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
    }
    instances.length = 0;
  }

  return { root, tick, dispose };
}
