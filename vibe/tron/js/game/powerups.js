/**
 * Power-up types, categories, campaign field (plan P3.1).
 * Three categories — instant / level_permanent / equippable — with color coding, pickup rules, and SFX hooks.
 */

import * as THREE from "three";
import { POWERUP_COLORS } from "../config.js";
import { clampNitroCapacity } from "./nitroSystem.js";

export { POWERUP_COLORS };

/** @typedef {"instant" | "level_permanent" | "equippable"} PowerupCategory */

/** Maps level JSON `type` string → category (aligned with `levels/schema.js`). */
export const POWERUP_TYPE_CATEGORY = Object.freeze(
  /** @type {Readonly<Record<string, PowerupCategory>>} */ ({
    nitro_recharge: "instant",
    trail_extend: "level_permanent",
    nitro_capacity: "level_permanent",
    shield: "equippable",
  }),
);

/**
 * @param {string} type
 * @returns {PowerupCategory | null}
 */
export function getPowerupCategory(type) {
  return POWERUP_TYPE_CATEGORY[type] ?? null;
}

/** Horizontal distance (units) from cycle center to pickup to collect. */
const PICKUP_RADIUS = 1.12;

/**
 * @typedef {object} PowerupFieldTickContext
 * @property {boolean} isLobby
 * @property {boolean} levelStarted
 * @property {import('cannon-es').Body} playerBody
 * @property {import('./enemies.js').CampaignEnemyEntity[]} enemies
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @property {(cat: PowerupCategory) => void} onPickupSound
 * @property {object} apply
 * @property {(type: 'nitro_recharge') => void} apply.onPlayerNitroRecharge
 * @property {(type: 'trail_extend') => void} apply.onPlayerTrailExtend
 * @property {(type: 'nitro_capacity') => void} apply.onPlayerNitroCapacity
 * @property {(type: 'shield') => void} apply.onPlayerShield
 * @property {(enemy: import('./enemies.js').CampaignEnemyEntity, type: 'nitro_recharge' | 'shield') => void} apply.onEnemyPickup
 */

/**
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {unknown[] | null | undefined} opts.powerups — `level.powerups` from validated JSON
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: PowerupFieldTickContext) => void; dispose: () => void }}
 */
export function createCampaignPowerupField(opts) {
  const { scene, devHud } = opts;
  const raw = opts.powerups;
  const root = new THREE.Group();
  root.name = "campaign-powerups";

  /** @type {Inst[]} */
  const instances = [];

  /**
   * @typedef {object} Inst
   * @property {string} type
   * @property {PowerupCategory} category
   * @property {number} x
   * @property {number} z
   * @property {THREE.Group} node
   * @property {THREE.Mesh} mesh
   * @property {number} phase
   * @property {boolean} gone — level_permanent consumed
   * @property {boolean} hidden — respawning (instant / equippable)
   * @property {number} respawnAtMs
   */

  if (!Array.isArray(raw)) {
    scene.add(root);
    return {
      root,
      tick() {},
      dispose() {
        scene.remove(root);
        for (const i of instances) {
          i.mesh.geometry.dispose();
          const m = i.mesh.material;
          if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
        }
      },
    };
  }

  /**
   * @param {PowerupCategory} cat
   */
  function emissiveHex(cat) {
    const h = POWERUP_COLORS[cat === "level_permanent" ? "levelPermanent" : cat];
    return typeof h === "string" ? parseInt(h.slice(1), 16) : 0x00ff66;
  }

  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || typeof p !== "object") continue;
    const type = typeof p.type === "string" ? p.type : "";
    const cat = getPowerupCategory(type);
    if (!cat) continue;
    const x = typeof p.x === "number" ? p.x : 0;
    const z = typeof p.z === "number" ? p.z : 0;

    let geo;
    if (cat === "instant") geo = new THREE.IcosahedronGeometry(0.38, 0);
    else if (cat === "level_permanent") geo = new THREE.OctahedronGeometry(0.42, 0);
    else geo = new THREE.TorusGeometry(0.28, 0.1, 10, 24);

    const em = emissiveHex(cat);
    const mat = new THREE.MeshStandardMaterial({
      color: em,
      emissive: em,
      emissiveIntensity: 0.85 * (devHud.neonIntensity ?? 1),
      metalness: 0.35,
      roughness: 0.25,
      transparent: cat === "equippable",
      opacity: cat === "equippable" ? 0.92 : 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const node = new THREE.Group();
    node.position.set(x, 0.62, z);
    node.add(mesh);

    instances.push({
      type,
      category: cat,
      x,
      z,
      node,
      mesh,
      phase: i * 1.17,
      gone: false,
      hidden: false,
      respawnAtMs: 0,
    });
    root.add(node);
  }

  scene.add(root);

  /**
   * @param {number} dt
   * @param {PowerupFieldTickContext} ctx
   */
  function tick(dt, ctx) {
    const { isLobby, levelStarted, playerBody, enemies, onPickupSound, apply } = ctx;

    const canPlayerPick = isLobby || levelStarted;
    const canEnemyPick = !isLobby && levelStarted;

    const nowMs = performance.now();
    for (const inst of instances) {
      if (inst.gone) continue;
      if (inst.hidden) {
        if (nowMs >= inst.respawnAtMs) {
          inst.hidden = false;
          inst.node.visible = true;
        } else {
          continue;
        }
      }

      inst.phase += dt * 1.8;
      inst.node.position.y = 0.62 + Math.sin(inst.phase * 2.1) * 0.09;
      inst.mesh.rotation.y += dt * 1.35;
      if (inst.mesh.geometry instanceof THREE.TorusGeometry) {
        inst.mesh.rotation.x = Math.PI / 2.15;
      }

      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      const dPlayer = Math.hypot(px - inst.x, pz - inst.z);

      if (canPlayerPick && dPlayer < PICKUP_RADIUS) {
        if (inst.category === "level_permanent") {
          if (inst.type === "trail_extend") apply.onPlayerTrailExtend();
          else if (inst.type === "nitro_capacity") apply.onPlayerNitroCapacity();
          onPickupSound("level_permanent");
        } else if (inst.category === "instant") {
          if (inst.type === "nitro_recharge") apply.onPlayerNitroRecharge();
          onPickupSound("instant");
        } else if (inst.type === "shield") {
          apply.onPlayerShield();
          onPickupSound("equippable");
        }
        scheduleRespawnOrConsume(inst, devHud);
        continue;
      }

      if (!canEnemyPick) continue;

      for (const e of enemies) {
        if (e.eliminated) continue;
        // Level-permanent pickups: player only (plan § Power-ups).
        if (inst.category === "level_permanent") break;

        const ex = e.body.position.x;
        const ez = e.body.position.z;
        if (Math.hypot(ex - inst.x, ez - inst.z) >= PICKUP_RADIUS) continue;

        if (inst.type === "nitro_recharge") {
          apply.onEnemyPickup(e, "nitro_recharge");
          onPickupSound("instant");
        } else if (inst.type === "shield") {
          apply.onEnemyPickup(e, "shield");
          onPickupSound("equippable");
        }
        scheduleRespawnOrConsume(inst, devHud);
        break;
      }
    }
  }

  /**
   * @param {Inst} inst
   * @param {import('../config.js').DEFAULT_DEV_HUD} hud
   */
  function scheduleRespawnOrConsume(inst, hud) {
    if (inst.category === "level_permanent") {
      inst.gone = true;
      inst.node.visible = false;
      return;
    }
    const sec = typeof hud.powerupRespawnTime === "number" ? hud.powerupRespawnTime : 10;
    inst.hidden = true;
    inst.node.visible = false;
    inst.respawnAtMs = performance.now() + Math.max(0.5, sec) * 1000;
  }

  function dispose() {
    scene.remove(root);
    for (const i of instances) {
      i.mesh.geometry.dispose();
      const m = i.mesh.material;
      if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
    }
    instances.length = 0;
  }

  return { root, tick, dispose };
}

/**
 * @param {import('./nitroSystem.js').NitroRuntimeState} state
 * @param {number} maxBars
 */
export function refillNitroBars(state, maxBars) {
  const m = Math.max(1, Math.floor(maxBars));
  state.bars = m;
  state.rechargeAccum = 0;
  clampNitroCapacity(state, m);
}
