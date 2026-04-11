/**
 * Campaign enemy cycles (plan P4.1–P4.4): spawn from level JSON; stationary until first W,
 * then tile-trail + solid-ray steering + hunting + peer separation (avoidance range, reaction time).
 */

import { getArenaPlaytestConfig } from "../config.js";
import { createPlayerBody, applyContinuousArenaWallSlide, applyContinuousBarrierSlide } from "../engine/physics.js";
import { computeEnemyCycleKeys } from "./ai.js";
import { createLightCycle } from "./cycle.js";
import { createTrailWallSystem } from "./trail.js";
import { createNitroState } from "./nitroSystem.js";
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
 */

/**
 * @typedef {object} EnemyTickContext
 * @property {boolean} levelStarted
 * @property {boolean} isLobby
 * @property {import('cannon-es').Body} playerBody
 * @property {ReturnType<typeof createTrailWallSystem>} playerTrail
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
 * @returns {{ list: CampaignEnemyEntity[]; tick: (dt: number, ctx: EnemyTickContext) => void }}
 */
export function createCampaignEnemyEntities(opts) {
  const { scene, world, playerMat, runtime, devHud, campaignLevel, arenaSize } = opts;

  /** @type {CampaignEnemyEntity[]} */
  const list = [];

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
    const playCfg = getArenaPlaytestConfig(runtime, attrs, size);
    const intelligence =
      typeof attrs.intelligence === "number" && Number.isFinite(attrs.intelligence)
        ? Math.max(1, Math.min(10, Math.floor(attrs.intelligence)))
        : 3;

    const body = createPlayerBody(playCfg, playerMat);
    const x = typeof raw.x === "number" ? raw.x : 0;
    const z = typeof raw.z === "number" ? raw.z : 0;
    const heading = typeof raw.rotation === "number" ? raw.rotation : 0;
    body.position.set(x, playCfg.playerSpawnY, z);
    body.velocity.set(0, 0, 0);
    body.userData.heading = heading;
    body.userData.speed = 0;
    body.allowSleep = false;
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
    });
  }

  scene.userData.campaignEnemies = list;

  /**
   * @param {number} dt
   * @param {EnemyTickContext} ctx
   */
  function tick(dt, ctx) {
    const { levelStarted, isLobby, playerBody, playerTrail, devHud: hud } = ctx;
    const canMove = isLobby || levelStarted;

    const barriers = scene.userData.barrierBodies;
    /** @type {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} */
    const trailSources = [
      {
        map: playerTrail.getTrailTileMap(),
        ownerId: "player",
        edgeCount: playerTrail.getLogicalEdgeCount(),
      },
    ];
    for (const e of list) {
      trailSources.push({
        map: e.trail.getTrailTileMap(),
        ownerId: e.id,
        edgeCount: e.trail.getLogicalEdgeCount(),
      });
    }

    const pvx = playerBody.velocity.x;
    const pvz = playerBody.velocity.z;
    const pspd =
      typeof playerBody.userData.speed === "number" ? playerBody.userData.speed : 0;

    /** P4.4 — player + every enemy position for separation steering within `aiAvoidanceRange`. */
    const peers = [
      { id: "player", x: playerBody.position.x, z: playerBody.position.z },
      ...list.map((en) => ({ id: en.id, x: en.body.position.x, z: en.body.position.z })),
    ];

    for (let ei = 0; ei < list.length; ei++) {
      const e = list[ei];
      /** @type {{ w: boolean; a: boolean; s: boolean; d: boolean; space: boolean }} */
      let keys = { w: false, a: false, s: false, d: false, space: false };

      if (!canMove) {
        e.body.velocity.set(0, e.body.velocity.y, 0);
        e.body.userData.speed = 0;
        e.body.userData.aiSteer = 0;
        e.body.userData.aiSteerSmoothed = 0;
      } else {
        const ai = computeEnemyCycleKeys({
          body: e.body,
          intelligence: e.intelligence,
          playerPos: { x: playerBody.position.x, z: playerBody.position.z },
          playerVx: pvx,
          playerVz: pvz,
          playerSpeed: pspd,
          dt,
          enemyIndex: ei,
          selfId: e.id,
          devHud: hud,
          playCfg: e.playCfg,
          barrierBodies: barriers,
          trailSources,
          peers,
        });
        keys = {
          w: ai.w,
          a: ai.a,
          s: ai.s,
          d: ai.d,
          space: ai.space,
        };
        e.body.userData.aiSteer = ai.steer;
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
 * After `world.step`, apply arena + barrier slide to each enemy (same as player).
 * @param {CampaignEnemyEntity[]} list
 * @param {import('three').Scene} scene
 */
export function applyEnemyWallAndBarrierSlide(list, scene) {
  const fp = scene.userData.openGateFootprints;
  const barriers = scene.userData.barrierBodies;
  for (const e of list) {
    applyContinuousArenaWallSlide(e.body, e.playCfg, fp);
    applyContinuousBarrierSlide(e.body, barriers, e.playCfg);
  }
}

/**
 * @param {CampaignEnemyEntity[]} list
 */
export function syncEnemyHeadingSpeed(list) {
  for (const e of list) {
    syncHeadingSpeedFromVelocity(e.body);
  }
}

/**
 * @param {CampaignEnemyEntity[]} list
 * @param {number} dt
 */
export function updateEnemyTrails(list, dt) {
  for (const e of list) {
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
    const h = e.body.userData.heading ?? 0;
    e.cycle.root.position.set(e.body.position.x, e.body.position.y, e.body.position.z);
    e.cycle.root.rotation.y = h;
    const spd = e.body.userData.speed ?? 0;
    const st = typeof e.body.userData.aiSteer === "number" ? e.body.userData.aiSteer : 0;
    e.cycle.update(dt, {
      speed: spd,
      steer: st,
      accelerating: spd > 0.5,
      braking: false,
      nitroBurstStrength: 0,
    });
  }
}
