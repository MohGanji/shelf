/**
 * Non-barrier arena objects: boost pads, portals (plan § Game Objects).
 * Boost pads — P3.5: visuals, global cooldown per pad, free 1-bar-equivalent nitro burst.
 * Portals — P3.6: paired warp, one-sided back wall, trail detach + exit immunity, shared pair cooldown.
 */

import * as THREE from "three";
import { Body, Box, Vec3 } from "cannon-es";
import { COLLISION_GROUP_ARENA_SOLID, COLLISION_GROUP_CYCLE } from "../engine/physics.js";
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
      getMinimapBoostPads() {
        return [];
      },
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

  /** P9.4 — boost pad centers for minimap. */
  function getMinimapBoostPads() {
    return instances.map((i) => ({ x: i.x, z: i.z }));
  }

  return { root, tick, dispose, getMinimapBoostPads };
}

/**
 * @typedef {object} PortalEndpoint
 * @property {number} x
 * @property {number} z
 * @property {number} rotation
 * @property {string} pairId
 * @property {number} colorHex
 */

/**
 * @param {number} rotY
 */
function portalForwardXZ(rotY) {
  return { x: Math.sin(rotY), z: Math.cos(rotY) };
}

/**
 * @param {number} rotY
 */
function portalRightXZ(rotY) {
  return { x: Math.cos(rotY), z: -Math.sin(rotY) };
}

/**
 * @typedef {object} PortalFieldTickContext
 * @property {boolean} isLobby
 * @property {boolean} levelStarted
 * @property {import('cannon-es').Body} playerBody
 * @property {import('./enemies.js').CampaignEnemyEntity[]} enemies
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @property {() => void} detachPlayerTrail
 * @property {(e: import('./enemies.js').CampaignEnemyEntity) => void} detachEnemyTrail
 * @property {() => void} onPortalSound
 */

/**
 * Paired portals: teleport player + enemies, preserve speed, rotate heading to exit `rotation`,
 * break trail at entry, short trail-hit immunity after exit. Inactive face uses a thin static box (slide like a wall).
 *
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {import('cannon-es').World} opts.world
 * @param {import('cannon-es').Material} opts.wallMat
 * @param {unknown[] | null | undefined} opts.gameObjects
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: PortalFieldTickContext) => void; dispose: () => void }}
 */
export function createPortalField(opts) {
  const { scene, world, wallMat, playCfg, devHud } = opts;
  const raw = opts.gameObjects;
  const root = new THREE.Group();
  root.name = "portals";

  /** @type {import('cannon-es').Body[]} */
  const physicsBodies = [];

  /** @type {{ a: PortalEndpoint; b: PortalEndpoint }[]} */
  const pairs = [];

  /** @type {Map<string, number>} */
  const pairCooldownUntilMs = new Map();

  const spawnY =
    typeof playCfg.playerSpawnY === "number" && Number.isFinite(playCfg.playerSpawnY)
      ? playCfg.playerSpawnY
      : 0.35;

  function parseHex(h) {
    if (typeof h !== "string" || h[0] !== "#") return 0xff00ff;
    const n = parseInt(h.slice(1), 16);
    return Number.isFinite(n) ? n : 0xff00ff;
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    scene.add(root);
    return {
      root,
      tick() {},
      getMinimapPortals() {
        return [];
      },
      dispose() {
        scene.remove(root);
      },
    };
  }

  /** @type {Map<string, PortalEndpoint[]>} */
  const byPair = new Map();
  for (let i = 0; i < raw.length; i++) {
    const g = raw[i];
    if (!g || typeof g !== "object") continue;
    if (/** @type {unknown} */ (g).type !== "portal") continue;
    const o = /** @type {Record<string, unknown>} */ (g);
    const pairId = typeof o.pairId === "string" ? o.pairId : "";
    if (!pairId) continue;
    const ep = {
      x: typeof o.x === "number" ? o.x : 0,
      z: typeof o.z === "number" ? o.z : 0,
      rotation: typeof o.rotation === "number" ? o.rotation : 0,
      pairId,
      colorHex: parseHex(typeof o.pairColor === "string" ? o.pairColor : "#FF00FF"),
    };
    let arr = byPair.get(pairId);
    if (!arr) {
      arr = [];
      byPair.set(pairId, arr);
    }
    arr.push(ep);
  }

  const neon = devHud.neonIntensity ?? 1;

  for (const [pid, ends] of byPair) {
    if (ends.length !== 2) continue;
    pairs.push({ a: ends[0], b: ends[1] });

    for (const ep of ends) {
      const node = new THREE.Group();
      node.position.set(ep.x, 0, ep.z);
      node.rotation.y = ep.rotation;

      const em = ep.colorHex;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.09, 12, 48),
        new THREE.MeshStandardMaterial({
          color: em,
          emissive: em,
          emissiveIntensity: 0.95 * neon,
          metalness: 0.35,
          roughness: 0.3,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.72;

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.92, 40),
        new THREE.MeshStandardMaterial({
          color: 0x040608,
          emissive: em,
          emissiveIntensity: 0.55 * neon,
          metalness: 0.2,
          roughness: 0.5,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
        }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.04;

      node.add(disc);
      node.add(ring);
      root.add(node);

      const fwd = portalForwardXZ(ep.rotation);
      const bx = ep.x - fwd.x * 0.55;
      const bz = ep.z - fwd.z * 0.55;
      const body = new Body({ mass: 0, material: wallMat });
      body.addShape(new Box(new Vec3(1.15, 0.72, 0.08)));
      body.position.set(bx, spawnY, bz);
      body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), ep.rotation);
      body.userData.kind = "portalBack";
      body.collisionFilterGroup = COLLISION_GROUP_ARENA_SOLID;
      body.collisionFilterMask = COLLISION_GROUP_CYCLE;
      world.addBody(body);
      physicsBodies.push(body);
    }
  }

  scene.add(root);

  /**
   * @param {import('cannon-es').Body} body
   * @param {PortalEndpoint} from
   * @param {PortalEndpoint} to
   * @param {number} nowMs
   */
  function warpBody(body, _from, to, nowMs) {
    const tf = portalForwardXZ(to.rotation);
    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const spd0 = Math.hypot(vx, vz);
    const spdStored = typeof body.userData.speed === "number" ? body.userData.speed : 0;
    const outSpd = spd0 > 0.35 ? spd0 : Math.max(spdStored, 2.5);

    const spawnD = 2.35;
    body.position.x = to.x + tf.x * spawnD;
    body.position.z = to.z + tf.z * spawnD;
    body.position.y = spawnY;
    body.velocity.x = tf.x * outSpd;
    body.velocity.z = tf.z * outSpd;
    body.velocity.y = 0;
    body.userData.heading = Math.atan2(tf.x, tf.z);
    body.userData.speed = outSpd;

    const immSec =
      typeof devHud.portalExitImmunityDuration === "number" ? devHud.portalExitImmunityDuration : 0.15;
    body.userData.portalTrailImmuneUntilMs = nowMs + Math.max(0.05, immSec) * 1000;
    body.userData._portalAntiReentryMs = nowMs;
  }

  /**
   * @param {import('cannon-es').Body} body
   * @param {PortalEndpoint} portal
   */
  function inPortalTrigger(body, portal) {
    const relx = body.position.x - portal.x;
    const relz = body.position.z - portal.z;
    const fwd = portalForwardXZ(portal.rotation);
    const rt = portalRightXZ(portal.rotation);
    const along = relx * fwd.x + relz * fwd.z;
    const lat = relx * rt.x + relz * rt.z;
    if (along > 0.48 || along < -1.45) return false;
    if (Math.abs(lat) > 1.22) return false;

    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const spd = Math.hypot(vx, vz);
    const into = vx * fwd.x + vz * fwd.z;
    if (spd > 0.55 && into < spd * 0.28) return false;
    return true;
  }

  /**
   * @param {number} _dt
   * @param {PortalFieldTickContext} ctx
   */
  function tick(_dt, ctx) {
    const {
      isLobby,
      levelStarted,
      playerBody,
      enemies,
      devHud: hud,
      detachPlayerTrail,
      detachEnemyTrail,
      onPortalSound,
    } = ctx;
    if (isLobby || !levelStarted) return;

    const coolSec = typeof hud.specialObjectCooldown === "number" ? hud.specialObjectCooldown : 5;
    const coolMs = Math.max(0.25, coolSec) * 1000;
    const now = performance.now();

    for (const pair of pairs) {
      const pid = pair.a.pairId;
      const until = pairCooldownUntilMs.get(pid) ?? 0;
      if (now < until) continue;

      /** @type {[PortalEndpoint, PortalEndpoint][]} */
      const ab = [
        [pair.a, pair.b],
        [pair.b, pair.a],
      ];

      let warped = false;
      for (const [from, to] of ab) {
        if (!inPortalTrigger(playerBody, from)) continue;
        if (now - (playerBody.userData._portalAntiReentryMs ?? 0) < 220) continue;
        detachPlayerTrail();
        warpBody(playerBody, from, to, now);
        pairCooldownUntilMs.set(pid, now + coolMs);
        onPortalSound();
        warped = true;
        break;
      }
      if (warped) continue;

      for (const e of enemies) {
        if (e.eliminated) continue;
        if (now < (pairCooldownUntilMs.get(pid) ?? 0)) break;
        const b = e.body;
        let enemyWarped = false;
        for (const [from, to] of ab) {
          if (!inPortalTrigger(b, from)) continue;
          if (now - (b.userData._portalAntiReentryMs ?? 0) < 220) continue;
          detachEnemyTrail(e);
          warpBody(b, from, to, now);
          pairCooldownUntilMs.set(pid, now + coolMs);
          onPortalSound();
          enemyWarped = true;
          break;
        }
        if (enemyWarped) break;
      }
    }
  }

  function dispose() {
    scene.remove(root);
    for (const b of physicsBodies) {
      world.removeBody(b);
    }
    physicsBodies.length = 0;
    for (const ch of root.children) {
      ch.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const m = o.material;
          if (m && !Array.isArray(m) && "dispose" in m) /** @type {THREE.Material} */ (m).dispose();
        }
      });
    }
  }

  /** P9.4 — portal endpoint positions for minimap. */
  function getMinimapPortals() {
    /** @type {{ x: number; z: number }[]} */
    const out = [];
    for (const pair of pairs) {
      out.push({ x: pair.a.x, z: pair.a.z }, { x: pair.b.x, z: pair.b.z });
    }
    return out;
  }

  return { root, tick, dispose, getMinimapPortals };
}
