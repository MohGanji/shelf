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

/** P3.7 — pickup burst lifetime (seconds). */
const PICKUP_BURST_DURATION = 0.38;

/**
 * Distinct silhouette per JSON `type` (same category can differ by shape).
 * @param {string} type
 * @returns {{ geo: THREE.BufferGeometry; visual: "orb" | "column" | "poly" | "torus" }}
 */
function createPowerupGeometryForType(type) {
  switch (type) {
    case "nitro_recharge":
      return { geo: new THREE.IcosahedronGeometry(0.34, 1), visual: "orb" };
    case "trail_extend":
      return { geo: new THREE.CylinderGeometry(0.17, 0.2, 0.86, 10), visual: "column" };
    case "nitro_capacity":
      return { geo: new THREE.DodecahedronGeometry(0.39, 0), visual: "poly" };
    case "shield":
      return { geo: new THREE.TorusGeometry(0.3, 0.085, 12, 40), visual: "torus" };
    default:
      return { geo: new THREE.IcosahedronGeometry(0.36, 0), visual: "orb" };
  }
}

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
   * @property {number} emissive — hex number for burst color
   * @property {THREE.Group} node
   * @property {THREE.Mesh} mesh
   * @property {THREE.Mesh[]} accents — extra rings / belts (shared material with `mesh`)
   * @property {"orb" | "column" | "poly" | "torus"} visual
   * @property {number} phase
   * @property {boolean} gone — level_permanent consumed
   * @property {boolean} hidden — respawning (instant / equippable)
   * @property {number} respawnAtMs
   */

  /** @type {{ t: number; group: THREE.Group; geo: THREE.BufferGeometry; vel: Float32Array; mat: THREE.PointsMaterial }[]} */
  const pickupBursts = [];

  /**
   * P3.7 — additive particle pop at collection.
   * @param {number} wx
   * @param {number} wy
   * @param {number} wz
   * @param {number} em
   * @param {number} neon
   */
  function spawnPickupBurst(wx, wy, wz, em, neon) {
    const n = 40;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const sp = 1.85 + Math.random() * 2.55;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * sp;
      velocities[i * 3 + 1] = Math.max(0.15, Math.cos(phi)) * sp * 0.55 + 0.75 + Math.random() * 0.65;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: em,
      size: 0.085 + neon * 0.045,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    const group = new THREE.Group();
    group.position.set(wx, wy, wz);
    group.add(pts);
    scene.add(group);
    pickupBursts.push({ t: 0, group, geo, vel: velocities, mat });
  }

  /**
   * @param {number} dt
   */
  function tickPickupBursts(dt) {
    const g = 5.5;
    for (let i = pickupBursts.length - 1; i >= 0; i--) {
      const b = pickupBursts[i];
      b.t += dt;
      const posAttr = b.geo.attributes.position;
      const arr = /** @type {Float32Array} */ (posAttr.array);
      for (let p = 0; p < arr.length; p += 3) {
        arr[p] += b.vel[p] * dt;
        arr[p + 1] += b.vel[p + 1] * dt;
        arr[p + 2] += b.vel[p + 2] * dt;
        b.vel[p + 1] -= g * dt;
      }
      posAttr.needsUpdate = true;
      const u = b.t / PICKUP_BURST_DURATION;
      b.mat.opacity = Math.max(0, 1 - u * u * 1.15);
      if (b.t >= PICKUP_BURST_DURATION) {
        scene.remove(b.group);
        b.geo.dispose();
        b.mat.dispose();
        pickupBursts.splice(i, 1);
      }
    }
  }

  if (!Array.isArray(raw)) {
    scene.add(root);
    return {
      root,
      tick(dt) {
        tickPickupBursts(typeof dt === "number" ? dt : 0);
      },
      dispose() {
        for (const b of pickupBursts) {
          scene.remove(b.group);
          b.geo.dispose();
          b.mat.dispose();
        }
        pickupBursts.length = 0;
        scene.remove(root);
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

    const { geo, visual } = createPowerupGeometryForType(type);
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
    node.position.set(x, 0.65, z);
    node.add(mesh);

    /** @type {THREE.Mesh[]} */
    const accents = [];
    if (type === "nitro_recharge") {
      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.022, 8, 40),
        mat,
      );
      orbit.rotation.x = Math.PI / 2;
      node.add(orbit);
      accents.push(orbit);
    } else if (type === "trail_extend") {
      const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.018, 8, 28), mat);
      belt.rotation.x = Math.PI / 2;
      node.add(belt);
      accents.push(belt);
    } else if (type === "nitro_capacity") {
      const spark = new THREE.Mesh(new THREE.TetrahedronGeometry(0.14, 0), mat);
      spark.position.set(0.28, 0.26, 0.1);
      node.add(spark);
      accents.push(spark);
    }

    instances.push({
      type,
      category: cat,
      x,
      z,
      emissive: em,
      node,
      mesh,
      accents,
      visual,
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
    tickPickupBursts(dt);

    const { isLobby, levelStarted, playerBody, enemies, onPickupSound, apply } = ctx;
    const neon = typeof devHud.neonIntensity === "number" ? devHud.neonIntensity : 1;

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

      inst.phase += dt * 1.85;
      const bob = Math.sin(inst.phase * 2.08) * 0.1 + Math.cos(inst.phase * 0.71) * 0.028;
      inst.node.position.y = 0.65 + bob;

      const v = inst.visual;
      if (v === "torus") {
        inst.mesh.rotation.x = Math.PI / 2.12;
        inst.mesh.rotation.y += dt * 1.42;
        inst.mesh.rotation.z += dt * 0.55;
      } else if (v === "column") {
        inst.mesh.rotation.y += dt * 1.25;
      } else if (v === "poly") {
        inst.mesh.rotation.y += dt * 1.05;
        inst.mesh.rotation.x += dt * 0.42;
        inst.mesh.rotation.z += dt * 0.28;
      } else {
        inst.mesh.rotation.y += dt * 1.22;
        inst.mesh.rotation.x = Math.sin(inst.phase * 1.1) * 0.12;
      }

      for (const a of inst.accents) {
        if (inst.type === "nitro_recharge" || inst.type === "trail_extend") {
          a.rotation.z += dt * (inst.type === "nitro_recharge" ? 2.35 : 1.65);
        } else if (inst.type === "nitro_capacity") {
          a.rotation.x += dt * 2.1;
          a.rotation.y += dt * 1.6;
        }
      }

      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      const dPlayer = Math.hypot(px - inst.x, pz - inst.z);

      if (canPlayerPick && dPlayer < PICKUP_RADIUS) {
        spawnPickupBurst(inst.x, inst.node.position.y, inst.z, inst.emissive, neon);
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

        spawnPickupBurst(inst.x, inst.node.position.y, inst.z, inst.emissive, neon);
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
    for (const b of pickupBursts) {
      scene.remove(b.group);
      b.geo.dispose();
      b.mat.dispose();
    }
    pickupBursts.length = 0;
    scene.remove(root);
    for (const i of instances) {
      i.mesh.geometry.dispose();
      for (const a of i.accents) {
        a.geometry.dispose();
      }
      const m = i.mesh.material;
      if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
    }
    instances.length = 0;
  }

  /** P9.4 — active pickup tiles for minimap (hollow circles). */
  function getMinimapPickups() {
    return instances
      .filter((i) => !i.gone && !i.hidden)
      .map((i) => ({ x: i.x, z: i.z }));
  }

  return { root, tick, dispose, getMinimapPickups };
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
