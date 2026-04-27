/**
 * Non-barrier arena objects: boost pads, portals (plan § Game Objects).
 * Boost pads — P3.5: visuals, continuous pad-zone nitro sustain.
 * Portals — P3.6: paired warp, one-sided back wall, trail detach + exit immunity, shared pair cooldown.
 */

import * as THREE from "../vendor/three-module.js";
import { Body, Box, Vec3 } from "../vendor/cannon-es-module.js";
import { COLLISION_GROUP_ARENA_SOLID, COLLISION_GROUP_CYCLE } from "../engine/physics.js";
import { applyBoostPadBurst } from "./nitroSystem.js";
import { resolvePortalRotationY, PORTAL_FLOOR_FOOTPRINT } from "../levels/footprints.js";

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

/** @param {unknown} h @param {number} fallback */
function parseOptionalHexColor(h, fallback) {
  if (typeof h !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(h)) return fallback;
  const n = parseInt(h.slice(1), 16);
  return Number.isFinite(n) ? n : fallback;
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
 * @property {() => void} [onNitroBurstStart] — same presentation cue as held nitro
 */

/**
 * Spawns boost pad meshes from `level.gameObjects` and sustains nitro while a cycle rides over a pad.
 *
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {unknown[] | null | undefined} opts.gameObjects
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: BoostPadTickContext) => boolean; dispose: () => void }}
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
   * @property {number} width
   * @property {number} depth
   * @property {number} colorHex
   * @property {THREE.Group} node
   * @property {THREE.Mesh} mesh
   * @property {THREE.MeshStandardMaterial} mat
   * @property {number} baseEmissive
   * @property {boolean} playerInside
   * @property {Set<string>} enemyInsideIds
   */
  /** @type {PadInst[]} */
  const instances = [];

  if (!Array.isArray(raw)) {
    scene.add(root);
    return {
      root,
      tick() {
        return false;
      },
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
    const width = typeof g.width === "number" && Number.isFinite(g.width) && g.width > 0 ? g.width : 4;
    const depth = typeof g.depth === "number" && Number.isFinite(g.depth) && g.depth > 0 ? g.depth : 4;
    const colorHex = parseOptionalHexColor(/** @type {Record<string, unknown>} */ (g).color, 0x55eeff);

    const geo = new THREE.BoxGeometry(width, 0.07, depth);
    const em = colorHex;
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
      new THREE.RingGeometry(Math.min(width, depth) * 0.28, Math.min(width, depth) * 0.42, 32),
      new THREE.MeshBasicMaterial({
        color: em,
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
      width,
      depth,
      colorHex,
      node,
      mesh,
      mat,
      baseEmissive: 0.75,
      playerInside: false,
      enemyInsideIds: new Set(),
    });
    root.add(node);
  }

  scene.add(root);

  /**
   * @param {number} dt
   * @param {BoostPadTickContext} ctx
   * @returns {boolean} player overlapping any boost pad this frame (for sustained nitro/boost audio).
   */
  function tick(dt, ctx) {
    const { isLobby, levelStarted, playerBody, nitroState, enemies, devHud: hud, onBoost, onNitroBurstStart } = ctx;
    if (!isLobby && !levelStarted) return false;

    const burstBase = typeof hud.nitroBurstDuration === "number" ? hud.nitroBurstDuration : 0.5;
    const str = typeof hud.boostPadStrength === "number" ? hud.boostPadStrength : 1;
    const burstDur = Math.max(0.05, burstBase * str);
    const sustainDur = Math.max(0.1, Math.min(burstDur, dt * 2 + 0.08));
    const nMul = hud.neonIntensity ?? 1;

    let playerOverBoostPad = false;
    for (const inst of instances) {
      const px = playerBody.position.x;
      const pz = playerBody.position.z;
      const playerInsideNow = isInsideBoostPad(px, pz, inst);
      const playerEntered = playerInsideNow && !inst.playerInside;
      inst.playerInside = playerInsideNow;
      if (playerInsideNow) {
        playerOverBoostPad = true;
        applyBoostPadBurst(nitroState, sustainDur);
      }

      let enemyEntered = false;
      const nextEnemyInside = new Set();
      for (const e of enemies) {
        if (e.eliminated) continue;
        const ex = e.body.position.x;
        const ez = e.body.position.z;
        if (isInsideBoostPad(ex, ez, inst)) {
          nextEnemyInside.add(e.id);
          if (!inst.enemyInsideIds.has(e.id)) enemyEntered = true;
          applyBoostPadBurst(e.nitroState, sustainDur);
        }
      }
      inst.enemyInsideIds = nextEnemyInside;

      const occupied = playerInsideNow || nextEnemyInside.size > 0;
      inst.mat.emissiveIntensity = inst.baseEmissive * (occupied ? 1.35 : 1) * nMul;

      if (playerEntered || enemyEntered) {
        onBoost();
        if (playerEntered) onNitroBurstStart?.();
      }
    }
    return playerOverBoostPad;
  }

  /**
   * @param {number} wx
   * @param {number} wz
   * @param {PadInst} inst
   */
  function isInsideBoostPad(wx, wz, inst) {
    return (
      Math.abs(wx - inst.x) <= inst.width / 2 + BOOST_PAD_TRIGGER_RADIUS * 0.2 &&
      Math.abs(wz - inst.z) <= inst.depth / 2 + BOOST_PAD_TRIGGER_RADIUS * 0.2
    );
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

  /**
   * P9.4 — boost pad AABBs on XZ (world) + accent color for minimap (filled rects, not point circles).
   * @returns {{ x0: number; x1: number; z0: number; z1: number; color: string }[]}
   */
  function getMinimapBoostPads() {
    return instances.map((i) => {
      const hw = i.width / 2;
      const hd = i.depth / 2;
      const n = (i.colorHex & 0xffffff) >>> 0;
      const color = `#${n.toString(16).padStart(6, "0")}`;
      return {
        x0: i.x - hw,
        x1: i.x + hw,
        z0: i.z - hd,
        z1: i.z + hd,
        color,
      };
    });
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
 * World-space exit / forward in XZ for a portal. JSON `resolvePortalRotationY` (0 or 90°) is the **group** Y, and
 * the torus has an extra local +π/2 Y, so the opening faces `portalForwardXZ(rot + π/2)` — same as the editor
 * (`rY + π/2` on one mesh). Use this for travel, trigger slab, and back baffle, not `portalForwardXZ(rot)` alone.
 * @param {number} levelRotY — from {@link resolvePortalRotationY}
 */
function portalExitForwardXZ(levelRotY) {
  return portalForwardXZ(levelRotY + Math.PI * 0.5);
}

/**
 * @param {number} levelRotY
 */
function portalExitRightXZ(levelRotY) {
  return portalRightXZ(levelRotY + Math.PI * 0.5);
}

/**
 * @typedef {object} PortalFieldTickContext
 * @property {boolean} isLobby — passed from main; not used to disable warps (lobby has `levelStarted` at load)
 * @property {boolean} levelStarted
 * @property {import('cannon-es').Body} playerBody
 * @property {import('./enemies.js').CampaignEnemyEntity[]} enemies
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @property {() => void} detachPlayerTrail
 * @property {(e: import('./enemies.js').CampaignEnemyEntity) => void} detachEnemyTrail
 * @property {() => void} onPortalSound
 */

/**
 * Paired portals: teleport player + enemies, preserve speed, exit yaw from resolved portal orientation (`portalHalfTurn` in level JSON),
 * break trail at entry, short trail-hit immunity after exit. A thin static box sits on the **exit** side of the frame (`+fwd` from
 * the portal center) so the approach from `-fwd` is never blocked; it only stops sliding through the back of the arch after the ring.
 *
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {import('cannon-es').World} opts.world
 * @param {import('cannon-es').Material} opts.wallMat
 * @param {unknown[] | null | undefined} opts.gameObjects
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} opts.playCfg
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {(from: PortalEndpoint, to: PortalEndpoint) => void} [opts.onPortalWarp] — P9.3 warp particles
 * @param {() => void} [opts.onPlayerWarp] — e.g. snap chase camera; called right after a successful **player** warp
 * @param {boolean} [opts.portalVisualDetail] — additive inner shell + stronger idle pulse (when enabled by graphics profile)
 * @returns {{ root: THREE.Group; tick: (dt: number, ctx: PortalFieldTickContext) => void; dispose: () => void }}
 */
export function createPortalField(opts) {
  const { scene, world, wallMat, playCfg, devHud } = opts;
  const portalVisualDetail = opts.portalVisualDetail === true;
  const onPortalWarp = opts.onPortalWarp;
  const onPlayerWarp = opts.onPlayerWarp;
  const raw = opts.gameObjects;
  const root = new THREE.Group();
  root.name = "portals";

  /** @type {import('cannon-es').Body[]} */
  const physicsBodies = [];

  /** @type {{ a: PortalEndpoint; b: PortalEndpoint }[]} */
  const pairs = [];

  /** @type {Map<string, number>} */
  const pairCooldownUntilMs = new Map();

  /** @type {THREE.Mesh[]} */
  const portalRingMeshes = [];

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
      rotation: resolvePortalRotationY(o),
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

    const P = PORTAL_FLOOR_FOOTPRINT;
    const major = P * 0.43;
    const minor = P * 0.026;
    for (const ep of ends) {
      const node = new THREE.Group();
      node.position.set(ep.x, 0, ep.z);
      node.rotation.y = ep.rotation;

      const em = ep.colorHex;
      // Default TorusGeometry lies in the XY plane (flat; hole axis is +Z). RotY(π/2) places the main ring
      // in the YZ plane (standing “Stargate” with horizontal passage through, matching gate scale).
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(major, minor, 20, 64),
        new THREE.MeshStandardMaterial({
          color: em,
          emissive: em,
          emissiveIntensity: 0.95 * neon,
          metalness: 0.35,
          roughness: 0.3,
        }),
      );
      ring.rotation.set(0, Math.PI / 2, 0);
      ring.position.y = major + minor;
      ring.userData.portalRingPhase = portalRingMeshes.length * 0.73;
      portalRingMeshes.push(ring);

      node.add(ring);
      if (portalVisualDetail) {
        const shell = new THREE.Mesh(
          new THREE.TorusGeometry(major * 1.045, minor * 0.62, 12, 56),
          new THREE.MeshBasicMaterial({
            color: em,
            transparent: true,
            opacity: 0.2,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        shell.rotation.copy(ring.rotation);
        shell.position.copy(ring.position);
        node.add(shell);
      }
      root.add(node);

      const exitFwd = portalExitForwardXZ(ep.rotation);
      const backOff = 0.85;
      // Baffle *past* the opening on the exit side; approach is from `-exitFwd` in XZ.
      const bx = ep.x + exitFwd.x * backOff;
      const bz = ep.z + exitFwd.z * backOff;
      const body = new Body({ mass: 0, material: wallMat });
      body.userData = {};
      body.addShape(new Box(new Vec3(P * 0.55, 0.95, 0.1)));
      body.position.set(bx, spawnY, bz);
      body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), ep.rotation + Math.PI * 0.5);
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
  function warpBody(body, from, to, nowMs) {
    onPortalWarp?.(from, to);
    const tf = portalExitForwardXZ(to.rotation);
    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const spd0 = Math.hypot(vx, vz);
    const spdStored = typeof body.userData.speed === "number" ? body.userData.speed : 0;
    const outSpd = spd0 > 0.35 ? spd0 : Math.max(spdStored, 2.5);

    const spawnD = 2.65;
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
    const fwd = portalExitForwardXZ(portal.rotation);
    const rt = portalExitRightXZ(portal.rotation);
    const along = relx * fwd.x + relz * fwd.z;
    const lat = relx * rt.x + relz * rt.z;
    if (along > 0.55 || along < -2.05) return false;
    if (Math.abs(lat) > PORTAL_FLOOR_FOOTPRINT * 0.49) return false;

    const vx = body.velocity.x;
    const vz = body.velocity.z;
    const spd = Math.hypot(vx, vz);
    const into = vx * fwd.x + vz * fwd.z;
    // `fwd` = world exit (matches mesh: group Y + child π/2 on the torus). Block only clear wrong-way.
    if (spd > 0.5 && into < -0.2 * spd) return false;
    return true;
  }

  /**
   * @param {number} _dt
   * @param {PortalFieldTickContext} ctx
   */
  function tick(_dt, ctx) {
    const { levelStarted, playerBody, enemies, devHud: hud, detachPlayerTrail, detachEnemyTrail, onPortalSound } =
      ctx;

    const ph = performance.now() * 0.001;
    const amp = portalVisualDetail ? 0.052 : 0.032;
    for (const ring of portalRingMeshes) {
      const off = typeof ring.userData.portalRingPhase === "number" ? ring.userData.portalRingPhase : 0;
      const s = 1 + amp * Math.sin(ph * 2.35 + off);
      ring.scale.setScalar(s);
    }

    // Match boost pads: lobby has levelStarted true at load; campaign stays off until first W.
    if (!levelStarted) return;

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
        onPlayerWarp?.();
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
    /** @type {{ x: number; z: number; kind: 'portal' }[]} */
    const out = [];
    for (const pair of pairs) {
      out.push(
        { x: pair.a.x, z: pair.a.z, kind: /** @type {const} */ ("portal") },
        { x: pair.b.x, z: pair.b.z, kind: /** @type {const} */ ("portal") },
      );
    }
    return out;
  }

  return { root, tick, dispose, getMinimapPortals };
}
