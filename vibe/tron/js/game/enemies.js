/**
 * Campaign enemy cycles (plan P4.1): spawn from level JSON, same mesh/physics as player,
 * per-enemy attributes → `getArenaPlaytestConfig`, trail + tile owner ids. Stationary until
 * the player's first W (non-lobby); then forward-only drive placeholder until P4.2 AI steering.
 */

import { getArenaPlaytestConfig } from "../config.js";
import { createPlayerBody, applyContinuousArenaWallSlide, applyContinuousBarrierSlide } from "../engine/physics.js";
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
 * @returns {{ list: CampaignEnemyEntity[]; tick: (dt: number, ctx: { levelStarted: boolean; isLobby: boolean }) => void }}
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
    });
  }

  scene.userData.campaignEnemies = list;

  /**
   * @param {number} dt
   * @param {{ levelStarted: boolean; isLobby: boolean }} ctx
   */
  function tick(dt, ctx) {
    const { levelStarted, isLobby } = ctx;
    const canMove = isLobby || levelStarted;

    for (const e of list) {
      const keys = canMove
        ? { w: true, a: false, s: false, d: false, space: false }
        : { w: false, a: false, s: false, d: false, space: false };

      if (!canMove) {
        e.body.velocity.set(0, e.body.velocity.y, 0);
        e.body.userData.speed = 0;
      }

      tickPlayerArcadeDrive({
        body: e.body,
        dt,
        keys,
        nitroState: e.nitroState,
        playCfg: e.playCfg,
        devHud,
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
    e.cycle.update(dt, {
      speed: spd,
      steer: 0,
      accelerating: spd > 0.5,
      braking: false,
      nitroBurstStrength: 0,
    });
  }
}
