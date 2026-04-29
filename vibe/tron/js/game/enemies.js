/**
 * Campaign enemy cycles (plan P4.1–P4.4): spawn from level JSON; stationary until first W,
 * then tile-trail + solid-ray steering + hunting + peer separation (avoidance range, reaction time).
 */

import { getArenaPlaytestConfig, normalizeEnemyCategory } from "../config.js";
import {
  createPlayerBody,
  applyContinuousArenaWallSlide,
  applyContinuousBarrierSlide,
  syncCyclePhysicsYaw,
} from "../engine/physics.js";
import { AI_SPEED_TUNE_REF, computeEnemyCycleKeys } from "./ai.js";
import { createLightCycle } from "./cycle.js";
import { createTrailWallSystem } from "./trail.js";
import { createNitroState, isNitroBurstActive } from "./nitroSystem.js";
import { tickPlayerArcadeDrive } from "./playerDrive.js";
import { syncHeadingSpeedFromVelocity } from "./playerMovement.js";
import { LOBBY_LEVEL_ID } from "../levels/schema.js";

/**
 * @typedef {object} CampaignEnemyEntity
 * @property {string} id
 * @property {import('cannon-es').Body} body
 * @property {ReturnType<typeof createLightCycle>} cycle
 * @property {ReturnType<typeof createTrailWallSystem>} trail
 * @property {import('./nitroSystem.js').NitroRuntimeState} nitroState
 * @property {ReturnType<typeof getArenaPlaytestConfig>} playCfg
 * @property {number} intelligence — 1–10 (plan enemy attributes)
 * @property {"easy" | "medium" | "hard" | "boss"} category
 * @property {string} color — cycle / trail hex (minimap, UI)
 * @property {boolean} [eliminated] — P2.3 combat: trail or cycle derez
 * @property {boolean} [cinematicDerezActive] — P2.6: awaiting implosion; mesh still in scene, body removed
 * @property {{ x: number; y: number; z: number; heading: number } | null} [derezSnapshot] — frozen pose for camera + VFX
 */

/**
 * @typedef {object} EnemyTickContext
 * @property {boolean} levelStarted
 * @property {boolean} isLobby
 * @property {import('cannon-es').Body} playerBody
 * @property {ReturnType<typeof createTrailWallSystem>} playerTrail
 * @property {number} playerMaxMoveSpeed — player `maxMoveSpeed` for AI speed scaling
 * @property {import('../config.js').DEFAULT_DEV_HUD} devHud
 */

/**
 * @param {object} opts
 * @param {import('three').Scene} opts.scene
 * @param {import('cannon-es').World} opts.world
 * @param {import('cannon-es').Material} opts.playerMat — shared contact material with player (cycle bodies)
 * @param {ReturnType<import('../config.js').createRuntimeFromPlayerSave>} opts.runtime
 * @param {import('../config.js').DEFAULT_DEV_HUD} opts.devHud
 * @param {Record<string, unknown> | null} opts.campaignLevel
 * @param {{ arenaWidth: number; arenaDepth: number } | null} opts.arenaSize
 * @param {{ x: number; z: number } | null | undefined} opts.enemyFaceTarget — world XZ to face at spawn (e.g. player entrance); matches `atan2` convention in {@link ./ai.js} and {@link ./gates.js}
 * @returns {{ list: CampaignEnemyEntity[]; tick: (dt: number, ctx: EnemyTickContext) => void }}
 */
export function createCampaignEnemyEntities(opts) {
  const { scene, world, playerMat, runtime, devHud, campaignLevel, arenaSize, enemyFaceTarget } = opts;

  /** @type {CampaignEnemyEntity[]} */
  const list = [];
  /** Reused each tick to avoid allocating a fresh `trailSources` array when many enemies are active. */
  const trailSourcesScratch = [];

  if (!campaignLevel || typeof campaignLevel !== "object") {
    return { list, tick: () => {} };
  }

  const lid = typeof campaignLevel.id === "string" ? campaignLevel.id : "";
  if (lid === LOBBY_LEVEL_ID) {
    return { list, tick: () => {} };
  }

  const enemies = campaignLevel.enemies;
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return { list, tick: () => {} };
  }

  const size = arenaSize ?? {
    arenaWidth: 400,
    arenaDepth: 400,
  };

  for (let i = 0; i < enemies.length; i++) {
    const raw = enemies[i];
    if (!raw || typeof raw !== "object") continue;

    const attrs = /** @type {Record<string, number>} */ (raw.attributes ?? {});
    const category = normalizeEnemyCategory(raw.category);
    const playCfg = getArenaPlaytestConfig(runtime, attrs, size, {
      actorType: "enemy",
      enemyCategory: category,
    });
    const intelligence =
      typeof attrs.intelligence === "number" && Number.isFinite(attrs.intelligence)
        ? Math.max(1, Math.min(10, Math.floor(attrs.intelligence)))
        : 10;

    const body = createPlayerBody(playCfg, playerMat);
    const x = typeof raw.x === "number" ? raw.x : 0;
    const z = typeof raw.z === "number" ? raw.z : 0;
    const tx =
      enemyFaceTarget &&
      typeof enemyFaceTarget.x === "number" &&
      Number.isFinite(enemyFaceTarget.x)
        ? enemyFaceTarget.x
        : null;
    const tz =
      enemyFaceTarget &&
      typeof enemyFaceTarget.z === "number" &&
      Number.isFinite(enemyFaceTarget.z)
        ? enemyFaceTarget.z
        : null;
    let heading = typeof raw.rotation === "number" ? raw.rotation : 0;
    if (tx !== null && tz !== null) {
      const dx = tx - x;
      const dz = tz - z;
      if (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4) {
        heading = Math.atan2(dx, dz);
      }
    }
    body.position.set(x, playCfg.playerSpawnY, z);
    body.velocity.set(0, 0, 0);
    body.userData.heading = heading;
    syncCyclePhysicsYaw(body);
    body.userData.speed = 0;
    body.allowSleep = false;
    /** P4.5 — equippable shield (same phases as player; AI triggers deploy). */
    body.userData.shieldPhase = "none";
    body.userData.shieldDeployRemain = 0;
    body.userData.shieldActiveRemain = 0;
    body.userData.equipSlot = undefined;
    body.userData.shieldActive = false;
    world.addBody(body);

    const colorStr = typeof raw.color === "string" ? raw.color : "#FF6600";

    const cycle = createLightCycle({
      devHud,
      variant: "enemy",
      color: colorStr,
    });
    cycle.root.position.set(x, playCfg.playerSpawnY, z);
    cycle.root.rotation.y = heading;
    scene.add(cycle.root);

    const trail = createTrailWallSystem({
      color: colorStr,
      devHud,
      world: playCfg.world,
      maxSegments: playCfg.trailMaxSegments,
      arenaWidth: playCfg.arenaWidth,
      arenaDepth: playCfg.arenaDepth,
      ownerId: `enemy-${i}`,
    });
    scene.add(trail.root);

    const id = `enemy-${i}`;
    list.push({
      id,
      body,
      cycle,
      trail,
      nitroState: createNitroState(playCfg.nitroBarCount),
      playCfg,
      intelligence,
      category,
      color: colorStr,
      eliminated: false,
    });
  }

  scene.userData.campaignEnemies = list;

  /**
   * P4.5 — shield deploy / active / expiry (mirrors player FSM without keyboard E).
   * @param {import('cannon-es').Body} body
   * @param {number} dt
   * @param {import('../config.js').DEFAULT_DEV_HUD} hud
   * @param {boolean} deployRequested
   */
  function tickEnemyShieldFsm(body, dt, hud, deployRequested) {
    if (dt <= 0) return;
    const u = body.userData;
    const deployT = typeof hud.shieldDeployTime === "number" ? hud.shieldDeployTime : 0.15;
    const durT = typeof hud.shieldDuration === "number" ? hud.shieldDuration : 5;

    if (u.shieldPhase === "deploying") {
      u.shieldDeployRemain -= dt;
      if (u.shieldDeployRemain <= 0) {
        u.shieldPhase = "active";
        u.shieldActiveRemain = durT;
      }
    } else if (u.shieldPhase === "active") {
      u.shieldActiveRemain -= dt;
      if (u.shieldActiveRemain <= 0) {
        u.shieldPhase = "none";
        u.equipSlot = undefined;
      }
    }

    if (
      deployRequested &&
      u.shieldPhase === "none" &&
      u.equipSlot === "shield"
    ) {
      u.equipSlot = undefined;
      u.shieldPhase = "deploying";
      u.shieldDeployRemain = Math.max(0.02, deployT);
    }

    u.shieldActive = u.shieldPhase === "active";
  }

  /**
   * Tactical shield from shared smart-AI pressure (not enemy category).
   * @param {object} o
   * @param {boolean} o.dangerFwd
   * @param {boolean} o.dangerL
   * @param {boolean} o.dangerR
   * @param {boolean} o.escapeBlocked
   * @param {number} o.distPlayer
   * @param {number} o.playerSpeed
   * @param {number} o.playerMaxMoveSpeed
   * @param {import('cannon-es').Body} o.body
   * @param {import('../config.js').DEFAULT_DEV_HUD} o.devHud
   */
  function shouldEnemyDeployShield(o) {
    const {
      dangerFwd,
      dangerL,
      dangerR,
      escapeBlocked,
      distPlayer,
      playerSpeed,
      playerMaxMoveSpeed,
      body,
      devHud: hud,
    } = o;
    const pMul = Math.max(0.01, playerMaxMoveSpeed) / AI_SPEED_TUNE_REF;
    const u = body.userData;
    if (u.equipSlot !== "shield") return false;
    if (u.shieldPhase !== "none") return false;
    const side = dangerL || dangerR;
    const safety = typeof hud.aiSafetyPercent === "number" ? Math.max(0, Math.min(100, hud.aiSafetyPercent)) / 100 : 0.95;
    const pressure = typeof hud.aiPressurePercent === "number" ? Math.max(0, Math.min(100, hud.aiPressurePercent)) / 100 : 0.6;
    return (
      dangerFwd ||
      escapeBlocked ||
      (distPlayer < 22 + pressure * 10) ||
      (playerSpeed > 14 * pMul && distPlayer < 34 + pressure * 18) ||
      (side && safety > 0.45)
    );
  }

  /**
   * @param {number} dt
   * @param {EnemyTickContext} ctx
   */
  function tick(dt, ctx) {
    const { levelStarted, isLobby, playerBody, playerTrail, playerMaxMoveSpeed, devHud: hud } = ctx;
    const canMove = isLobby || levelStarted;

    const barriers = scene.userData.barrierBodies;
    trailSourcesScratch.length = 0;
    trailSourcesScratch.push({
      map: playerTrail.getTrailTileMap(),
      ownerId: "player",
      edgeCount: playerTrail.getLogicalEdgeCount(),
    });
    for (const e of list) {
      if (e.eliminated) continue;
      trailSourcesScratch.push({
        map: e.trail.getTrailTileMap(),
        ownerId: e.id,
        edgeCount: e.trail.getLogicalEdgeCount(),
      });
    }
    const trailSources = trailSourcesScratch;

    const pvx = playerBody.velocity.x;
    const pvz = playerBody.velocity.z;
    const pspd =
      typeof playerBody.userData.speed === "number" ? playerBody.userData.speed : 0;

    /** P4.4 — player + every enemy position for separation steering within `aiAvoidanceRange`. */
    const peers = [
      { id: "player", x: playerBody.position.x, z: playerBody.position.z },
      ...list.filter((en) => !en.eliminated).map((en) => ({ id: en.id, x: en.body.position.x, z: en.body.position.z })),
    ];

    for (let ei = 0; ei < list.length; ei++) {
      const e = list[ei];
      if (e.eliminated) continue;
      /** @type {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean }} */
      let keys = { w: false, a: false, s: false, d: false, space: false };

      if (!canMove) {
        e.body.velocity.set(0, e.body.velocity.y, 0);
        e.body.userData.speed = 0;
        e.body.userData.aiSteer = 0;
        e.body.userData.aiSteerSmoothed = 0;
        e.body.userData.aiBraking = false;
      } else {
        const ai = computeEnemyCycleKeys({
          body: e.body,
          intelligence: e.intelligence,
          playerPos: { x: playerBody.position.x, z: playerBody.position.z },
          playerVx: pvx,
          playerVz: pvz,
          playerSpeed: pspd,
          playerMaxMoveSpeed,
          dt,
          enemyIndex: ei,
          selfId: e.id,
          devHud: hud,
          playCfg: e.playCfg,
          barrierBodies: barriers,
          trailSources,
          peers,
          nitroState: e.nitroState,
        });
        keys = {
          w: ai.w,
          a: ai.a,
          s: ai.s,
          d: ai.d,
          space: ai.space,
        };
        e.body.userData.aiSteer = ai.steer;
        e.body.userData.aiBraking = !!ai.s;

        const deployShield = shouldEnemyDeployShield({
          dangerFwd: ai.dangerFwd,
          dangerL: ai.dangerL,
          dangerR: ai.dangerR,
          escapeBlocked: ai.escapeBlocked,
          distPlayer: ai.distPlayer,
          playerSpeed: pspd,
          playerMaxMoveSpeed,
          body: e.body,
          devHud: hud,
        });
        tickEnemyShieldFsm(e.body, dt, hud, deployShield);
      }

      tickPlayerArcadeDrive({
        body: e.body,
        dt,
        keys,
        nitroState: e.nitroState,
        playCfg: e.playCfg,
        devHud: hud,
        levelStarted: true,
      });
    }
  }

  return { list, tick };
}

/**
 * P2.3 — remove enemy from physics; hide mesh; clear trail tile map.
 * @param {import('cannon-es').World} world
 * @param {CampaignEnemyEntity} e
 */
export function eliminateCampaignEnemy(world, e) {
  if (e.eliminated) return;
  e.eliminated = true;
  e.cinematicDerezActive = false;
  e.derezSnapshot = null;
  e.body.userData.tronEliminated = true;
  e.body.userData.shieldPhase = "none";
  e.body.userData.shieldActive = false;
  e.body.userData.equipSlot = undefined;
  e.trail.clear();
  world.removeBody(e.body);
  e.cycle.root.visible = false;
}

/**
 * Cinematic death: same removal as `eliminateCampaignEnemy` but keep the cycle mesh for implosion.
 * Trail is cleared in `endEnemyCinematicDerez` so own-trail / wall context stays visible through kill-cam.
 * @param {import('cannon-es').World} world
 * @param {CampaignEnemyEntity} e
 */
export function beginEnemyCinematicElimination(world, e) {
  if (e.eliminated) return;
  e.eliminated = true;
  e.cinematicDerezActive = true;
  e.body.userData.tronEliminated = true;
  e.body.userData.shieldPhase = "none";
  e.body.userData.shieldActive = false;
  e.body.userData.equipSlot = undefined;
  e.derezSnapshot = {
    x: e.body.position.x,
    y: e.body.position.y,
    z: e.body.position.z,
    heading: e.body.userData.heading ?? 0,
  };
  world.removeBody(e.body);
  e.cycle.root.position.set(
    e.derezSnapshot.x,
    e.derezSnapshot.y,
    e.derezSnapshot.z,
  );
  e.cycle.root.rotation.y = e.derezSnapshot.heading;
}

/**
 * @param {CampaignEnemyEntity} e
 */
export function endEnemyCinematicDerez(e) {
  e.cinematicDerezActive = false;
  e.derezSnapshot = null;
  e.trail.clear();
  e.cycle.root.visible = false;
}

/**
 * After `world.step`, apply arena + barrier slide to each enemy (same as player).
 * @param {CampaignEnemyEntity[]} list
 * @param {import('three').Scene} scene
 */
export function applyEnemyWallAndBarrierSlide(list, scene) {
  const fp = scene.userData.openGateFootprints;
  const barriers = scene.userData.barrierBodies;
  for (const e of list) {
    if (e.eliminated) continue;
    applyContinuousArenaWallSlide(e.body, e.playCfg, fp);
    applyContinuousBarrierSlide(e.body, barriers, e.playCfg);
  }
}

/**
 * @param {CampaignEnemyEntity[]} list
 */
export function syncEnemyHeadingSpeed(list) {
  for (const e of list) {
    if (e.eliminated) continue;
    syncHeadingSpeedFromVelocity(e.body);
  }
}

/**
 * @param {CampaignEnemyEntity[]} list
 * @param {number} dt
 */
export function updateEnemyTrails(list, dt) {
  for (const e of list) {
    if (e.eliminated) continue;
    e.trail.update(dt, {
      x: e.body.position.x,
      z: e.body.position.z,
      heading: e.body.userData.heading ?? 0,
      speed: e.body.userData.speed ?? 0,
    });
  }
}

/**
 * @param {CampaignEnemyEntity[]} list
 * @param {number} dt
 */
export function updateEnemyCycleMeshes(list, dt) {
  for (const e of list) {
    if (e.eliminated) continue;
    const h = e.body.userData.heading ?? 0;
    e.cycle.root.position.set(e.body.position.x, e.body.position.y, e.body.position.z);
    e.cycle.root.rotation.y = h;
    const spd = e.body.userData.speed ?? 0;
    const st = typeof e.body.userData.aiSteer === "number" ? e.body.userData.aiSteer : 0;
    const nitroVis = isNitroBurstActive(e.nitroState) ? 1 : 0;
    const sp = e.body.userData.shieldPhase;
    /** @type {'off' | 'deploy' | 'active'} */
    let shieldBubbleMode = "off";
    if (sp === "deploying") shieldBubbleMode = "deploy";
    else if (sp === "active") shieldBubbleMode = "active";
    e.cycle.update(dt, {
      speed: spd,
      steer: st,
      accelerating: spd > 0.5 && !e.body.userData.aiBraking,
      braking: !!e.body.userData.aiBraking,
      nitroBurstStrength: nitroVis,
      shieldBubbleMode,
    });
  }
}
