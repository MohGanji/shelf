/**
 * Power-up types, categories, campaign field (plan P3.1).
 * Three categories — instant / level_permanent / equippable — with color coding, pickup rules, and SFX hooks.
 */

import * as THREE from "../vendor/three-module.js";
import { POWERUP_COLORS } from "../config.js";
import { clampNitroCapacity } from "./nitroSystem.js";

export { POWERUP_COLORS };

/** @typedef {"instant" | "level_permanent" | "equippable"} PowerupCategory */

/** One-line copy for the pickup feedback toast (not shown for enemies). */
const PICKUP_NOTIFY_COPY = Object.freeze({
  nitro_recharge: { title: "Nitro refilled" },
  trail_extend: { title: "Trail extended" },
  shield: { title: "Shield ready" },
});

/** Maps level JSON `type` string → category (aligned with `levels/schema.js`). */
export const POWERUP_TYPE_CATEGORY = Object.freeze(
  /** @type {Readonly<Record<string, PowerupCategory>>} */ ({
    nitro_recharge: "instant",
    trail_extend: "level_permanent",
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
const PICKUP_RADIUS = 1.65;
/** Slightly larger grab radius for 2×2 “tile” instant / equippable pickups (nitro / shield). */
const PICKUP_RADIUS_LARGE = 1.9;

/** Powerups should read as roughly 2x2 floor pickups in campaign maps. */
const POWERUP_FOOTPRINT = 2.0;

/** P3.7 — pickup burst lifetime (seconds). */
const PICKUP_BURST_DURATION = 0.38;

/**
 * @param {string} type
 * @param {number} em — emissive (hex) from category
 * @param {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @returns {{ spin: THREE.Group; visual: "nitro" | "trail" | "shield" | "default"; emissiveMats: THREE.MeshStandardMaterial[] }}
 */
function buildPowerupSpinGroup(type, em, devHud) {
  const ei = 0.85 * (devHud.neonIntensity ?? 1);
  const emissiveMats = [];
  function std(opt) {
    const m = new THREE.MeshStandardMaterial({
      color: opt.color,
      emissive: opt.emissive ?? 0x000000,
      emissiveIntensity: typeof opt.emissiveIntensity === "number" ? opt.emissiveIntensity : ei,
      metalness: opt.metalness ?? 0.35,
      roughness: opt.roughness ?? 0.25,
      transparent: opt.transparent === true,
      opacity: typeof opt.opacity === "number" ? opt.opacity : 1,
      side: opt.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (opt.trackEmissive) emissiveMats.push(m);
    return m;
  }

  const spin = new THREE.Group();
  if (type === "nitro_recharge") {
    const cyan = 0x1ec8e8;
    const bandCol = 0xf0f4f7;
    const labelCol = 0xff7700;
    for (const sx of [-0.36, 0.36]) {
      const tankM = std({
        color: cyan,
        emissive: em,
        emissiveIntensity: ei,
        trackEmissive: true,
        metalness: 0.45,
        roughness: 0.2,
      });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.9, 18), tankM);
      tank.position.set(sx, 0, 0);
      spin.add(tank);
      for (const y of [0.3, -0.28]) {
        const bandM = std({
          color: bandCol,
          emissive: 0x445566,
          emissiveIntensity: ei * 0.35,
          trackEmissive: true,
          metalness: 0.2,
          roughness: 0.4,
        });
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20, 1, true),
          bandM,
        );
        band.position.set(sx, y, 0);
        spin.add(band);
      }
      const capM = std({
        color: 0x88aacc,
        emissive: 0x223344,
        emissiveIntensity: ei * 0.25,
        trackEmissive: true,
        metalness: 0.2,
        roughness: 0.4,
      });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.12, 8), capM);
      cap.position.set(sx, 0.5, 0);
      spin.add(cap);
    }
    for (const sx of [-0.36, 0.36]) {
      const labelM = std({
        color: labelCol,
        emissive: 0x663000,
        emissiveIntensity: ei * 0.55,
        trackEmissive: true,
        metalness: 0.15,
        roughness: 0.5,
        doubleSide: true,
      });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), labelM);
      plate.position.set(sx, 0.04, 0.37);
      spin.add(plate);
      for (let c = 0; c < 3; c++) {
        const chevM = std({
          color: 0xffcc00,
          emissive: 0xaa6600,
          emissiveIntensity: ei * 0.4,
          trackEmissive: true,
          metalness: 0.1,
          roughness: 0.45,
        });
        const tri = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 3), chevM);
        tri.rotation.z = Math.PI;
        tri.rotation.x = 0.08;
        tri.position.set(sx, -0.1 + c * 0.12, 0.38);
        spin.add(tri);
      }
    }
    /* ~2× vertical presence vs width (footprint stays 2×2 in XZ). */
    spin.scale.set(1, 2.02, 1);
    spin.position.y = 0.52;
    return { spin, visual: "nitro", emissiveMats };
  }
  if (type === "shield") {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.86);
    sh.lineTo(0.7, 0.48);
    sh.quadraticCurveTo(0.8, 0, 0.7, -0.52);
    sh.lineTo(0, -0.92);
    sh.lineTo(-0.7, -0.52);
    sh.quadraticCurveTo(-0.8, 0, -0.7, 0.48);
    sh.closePath();
    const ext = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    ext.center();
    const frameM = std({
      color: 0xff3ddb,
      emissive: 0xff00aa,
      emissiveIntensity: ei * 1.15,
      trackEmissive: true,
      metalness: 0.35,
      roughness: 0.25,
      doubleSide: true,
    });
    const faceM = std({
      color: 0xfffde8,
      emissive: 0x00fff6,
      emissiveIntensity: ei * 1.35,
      trackEmissive: true,
      metalness: 0.05,
      roughness: 0.18,
      doubleSide: true,
    });
    const frame = new THREE.Mesh(ext, frameM);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.0), faceM);
    face.position.z = 0.07;
    const g = new THREE.Group();
    g.add(frame);
    g.add(face);
    g.scale.setScalar(1.15);
    g.rotation.x = 0.12;
    g.rotation.y = 0.22;
    g.position.y = 0.58;
    spin.add(g);
    for (const off of [0, 0.4, -0.4]) {
      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 10),
        std({
          color: 0xffee44,
          emissive: 0xffcc00,
          emissiveIntensity: ei * 1.1,
          trackEmissive: true,
          metalness: 0.25,
          roughness: 0.22,
        }),
      );
      gem.position.set(off * 0.65, 0.5 - Math.abs(off) * 0.1, 0.14);
      g.add(gem);
    }
    spin.position.y = 0.12;
    return { spin, visual: "shield", emissiveMats };
  }
  if (type === "trail_extend") {
    /* Standing S in the XY plane (rises with Y); thin in Z for a wall-like drift strip. Plinth is the shared 2×2 node base. */
    const driftPts = (ox, oz) => [
      new THREE.Vector3(0.02 + ox, 0.1, oz),
      new THREE.Vector3(0.2 + ox, 0.32, oz),
      new THREE.Vector3(-0.16 + ox, 0.48, oz),
      new THREE.Vector3(0.18 + ox, 0.64, oz),
      new THREE.Vector3(-0.05 + ox, 0.82, oz),
    ];
    for (const [ox, oz] of [
      [0, 0],
      [0.1, 0.08],
    ]) {
      const curve = new THREE.CatmullRomCurve3(driftPts(ox, oz), false, "centripetal", 0.55);
      const trackM = std({
        color: 0x0d2620,
        emissive: em,
        emissiveIntensity: ei * 1.18,
        trackEmissive: true,
        metalness: 0.04,
        roughness: 0.9,
        doubleSide: true,
      });
      const geom = new THREE.TubeGeometry(curve, 64, 0.048, 6, false);
      const tr = new THREE.Mesh(geom, trackM);
      tr.scale.set(0.9, 1, 0.24);
      spin.add(tr);
    }
    /* Same height treatment as nitro: ~2× vertical on the footprint, lifted above the plinth. */
    spin.scale.set(1, 2.02, 1);
    spin.position.y = 0.5;
    return { spin, visual: "trail", emissiveMats };
  }
  const fallback = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7, 0),
    std({ color: em, emissive: em, emissiveIntensity: ei, trackEmissive: true }),
  );
  spin.add(fallback);
  return { spin, visual: "default", emissiveMats };
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
 * @property {(type: 'shield') => void} apply.onPlayerShield
 * @property {(enemy: import('./enemies.js').CampaignEnemyEntity, type: 'nitro_recharge' | 'shield') => void} apply.onEnemyPickup
 * @property {(info: { type: string; title: string }) => void} [onPickupNotify]
 */

/**
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {unknown[] | null | undefined} opts.powerups — `level.powerups` from validated JSON
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {(wx: number, wy: number, wz: number, em: number, neon: number) => void} [opts.spawnPickupBurst] — P9.3 shared particles
 * @param {boolean} [opts.pickupVisualDetail] — emissive pulse on meshes (when enabled by graphics profile)
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: PowerupFieldTickContext) => void; dispose: () => void; getMinimapPickups: () => { x: number; z: number; kind: 'pickup' }[] }}
 */
export function createCampaignPowerupField(opts) {
  const { scene, devHud } = opts;
  const pickupVisualDetail = opts.pickupVisualDetail === true;
  const externalPickupBurst = opts.spawnPickupBurst;
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
   * @property {THREE.Object3D} spin — main pickup icon (tanks, shield, drift marks)
   * @property {"nitro" | "trail" | "shield" | "default"} visual
   * @property {number} phase
   * @property {boolean} gone — level_permanent consumed
   * @property {boolean} hidden — respawning (instant / equippable)
   * @property {number} respawnAtMs
   * @property {number[]} emissiveBases
   * @property {THREE.MeshStandardMaterial[]} emissiveMats
   * @property {number} basePlateEmissive
   * @property {THREE.MeshStandardMaterial | null} basePlateMat
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
  function spawnPickupBurstLocal(wx, wy, wz, em, neon) {
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
   * @param {number} wx
   * @param {number} wy
   * @param {number} wz
   * @param {number} em
   * @param {number} neon
   */
  function spawnPickupBurst(wx, wy, wz, em, neon) {
    if (typeof externalPickupBurst === "function") {
      externalPickupBurst(wx, wy, wz, em, neon);
      return;
    }
    spawnPickupBurstLocal(wx, wy, wz, em, neon);
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
        if (!externalPickupBurst) {
          tickPickupBursts(typeof dt === "number" ? dt : 0);
        }
      },
      getMinimapPickups() {
        return [];
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

    const em = emissiveHex(cat);
    const { spin, visual, emissiveMats } = buildPowerupSpinGroup(type, em, devHud);
    spin.traverse((ch) => {
      if (ch instanceof THREE.Mesh) {
        ch.castShadow = false;
        ch.receiveShadow = false;
        if (cat === "equippable" && ch.material && !Array.isArray(ch.material)) {
          const m = /** @type {THREE.MeshStandardMaterial} */ (ch.material);
          m.transparent = true;
          m.opacity = 0.95;
        }
      }
    });
    const emissiveBases = emissiveMats.map((m) => m.emissiveIntensity);
    const node = new THREE.Group();
    node.position.set(x, 0.78, z);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x071118,
      emissive: em,
      emissiveIntensity: 0.22 * (devHud.neonIntensity ?? 1),
      metalness: 0.25,
      roughness: 0.45,
      transparent: true,
      opacity: 0.88,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(POWERUP_FOOTPRINT, 0.06, POWERUP_FOOTPRINT), baseMat);
    base.position.y = -0.7;
    base.castShadow = false;
    base.receiveShadow = true;
    node.add(base);
    node.add(spin);

    instances.push({
      type,
      category: cat,
      x,
      z,
      emissive: em,
      node,
      spin,
      visual,
      phase: i * 1.17,
      gone: false,
      hidden: false,
      respawnAtMs: 0,
      emissiveBases,
      emissiveMats,
      basePlateEmissive: baseMat.emissiveIntensity,
      basePlateMat: baseMat,
    });
    root.add(node);
  }

  scene.add(root);

  /**
   * @param {number} dt
   * @param {PowerupFieldTickContext} ctx
   */
  function tick(dt, ctx) {
    if (!externalPickupBurst) {
      tickPickupBursts(dt);
    }

    const { isLobby, levelStarted, playerBody, enemies, onPickupSound, onPickupNotify, apply } = ctx;
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
      inst.node.position.y = 0.78 + bob;

      const v = inst.visual;
      if (v === "shield") {
        inst.spin.rotation.x = Math.sin(inst.phase * 0.6) * 0.1 + 0.08;
        inst.spin.rotation.y += dt * 0.9;
        inst.spin.rotation.z = Math.sin(inst.phase * 0.45) * 0.06;
      } else if (v === "trail") {
        inst.spin.rotation.y += dt * 0.45;
        inst.spin.rotation.x = 0.14;
      } else if (v === "nitro") {
        inst.spin.rotation.y += dt * 0.55;
        inst.spin.rotation.x = Math.sin(inst.phase * 1.0) * 0.1;
      } else {
        inst.spin.rotation.y += dt * 1.15;
        inst.spin.rotation.x = Math.sin(inst.phase * 1.1) * 0.12;
      }

      if (pickupVisualDetail) {
        const pulse = 0.9 + 0.1 * Math.sin(inst.phase * 2.15);
        for (let j = 0; j < inst.emissiveMats.length; j++) {
          const m = inst.emissiveMats[j];
          const b = inst.emissiveBases[j];
          if (m && typeof b === "number") m.emissiveIntensity = b * pulse;
        }
        if (inst.basePlateMat && typeof inst.basePlateEmissive === "number") {
          inst.basePlateMat.emissiveIntensity = inst.basePlateEmissive * (0.88 + 0.12 * pulse);
        }
      }

      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      const dPlayer = Math.hypot(px - inst.x, pz - inst.z);
      const pickR =
        inst.type === "nitro_recharge" || inst.type === "shield" ? PICKUP_RADIUS_LARGE : PICKUP_RADIUS;

      if (canPlayerPick && dPlayer < pickR) {
        spawnPickupBurst(inst.x, inst.node.position.y, inst.z, inst.emissive, neon);
        if (inst.category === "level_permanent") {
          if (inst.type === "trail_extend") apply.onPlayerTrailExtend();
          onPickupSound("level_permanent");
        } else if (inst.category === "instant") {
          if (inst.type === "nitro_recharge") apply.onPlayerNitroRecharge();
          onPickupSound("instant");
        } else if (inst.type === "shield") {
          apply.onPlayerShield();
          onPickupSound("equippable");
        }
        const n = PICKUP_NOTIFY_COPY[/** @type {keyof typeof PICKUP_NOTIFY_COPY} */ (inst.type)];
        if (n && typeof onPickupNotify === "function") {
          onPickupNotify({ type: inst.type, title: n.title });
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
        if (Math.hypot(ex - inst.x, ez - inst.z) >= pickR) continue;

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
      i.node.traverse((ch) => {
        if (ch instanceof THREE.Mesh) {
          ch.geometry?.dispose();
          const mat = ch.material;
          if (mat && !Array.isArray(mat) && "dispose" in mat) /** @type {THREE.Material} */ (mat).dispose();
        }
      });
    }
    instances.length = 0;
  }

  /** P9.4 — active pickup tiles for minimap. */
  function getMinimapPickups() {
    return instances
      .filter((i) => !i.gone && !i.hidden)
      .map((i) => ({ x: i.x, z: i.z, kind: /** @type {const} */ ("pickup") }));
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
