/**
 * Trail tile hits + cycle↔cycle outcomes (plan P2.3).
 * `body.userData.shieldActive` absorbs one trail hit when true (P3.4 equips this).
 */

/**
 * @param {ReturnType<import('./trail.js').createTrailWallSystem>} playerTrail
 * @param {import('./enemies.js').CampaignEnemyEntity[]} enemies
 */
export function buildTrailSources(playerTrail, enemies) {
  /** @type {{ map: ReturnType<import('./trailTileMap.js').createTrailTileMap>; ownerId: string; getEdgeCount: () => number }[]} */
  const sources = [
    {
      map: playerTrail.getTrailTileMap(),
      ownerId: "player",
      getEdgeCount: () => playerTrail.getLogicalEdgeCount(),
    },
  ];
  for (const e of enemies) {
    if (e.eliminated) continue;
    sources.push({
      map: e.trail.getTrailTileMap(),
      ownerId: e.id,
      getEdgeCount: () => e.trail.getLogicalEdgeCount(),
    });
  }
  return sources;
}

/**
 * @param {import('cannon-es').Body} body
 * @param {number} x
 * @param {number} z
 * @param {string} selfId
 * @param {ReturnType<typeof buildTrailSources>} sources
 * @param {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @returns {'clear' | 'lethal' | 'absorbed'}
 */
export function tryTrailHitOnBody(body, x, z, selfId, sources, devHud) {
  const immuneUntil = body.userData?.portalTrailImmuneUntilMs;
  if (typeof immuneUntil === "number" && performance.now() < immuneUntil) {
    return "clear";
  }
  let hitKind = "clear";
  for (const s of sources) {
    const n = selfId === s.ownerId ? s.getEdgeCount() : 0;
    const imm = selfId === s.ownerId ? devHud.trailImmunitySegments : 0;
    const kind = s.map.evaluateCollision(x, z, selfId, n, imm);
    if (kind === "clear") continue;
    hitKind = kind === "own-lethal" || kind === "other-trail" ? "lethal" : "clear";
    break;
  }
  if (hitKind !== "lethal") return "clear";

  if (body.userData?.shieldActive) {
    body.userData.shieldActive = false;
    const spd = typeof body.userData.speed === "number" ? body.userData.speed : 0;
    const p = devHud.shieldSlowdownPercent ?? 0.3;
    body.userData.speed = spd * (1 - p);
    return "absorbed";
  }
  return "lethal";
}

/**
 * @param {import('cannon-es').Body} bodyA
 * @param {import('cannon-es').Body} bodyB
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {import('../config.js').DEFAULT_DEV_HUD} devHud
 * @returns {null | { bump: boolean; derezA: boolean; derezB: boolean }}
 */
export function evaluateCyclePairContact(bodyA, bodyB, playCfg, devHud) {
  const r = playCfg.playerRadius;
  const dx = bodyA.position.x - bodyB.position.x;
  const dz = bodyA.position.z - bodyB.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > r * 2 - 0.04) return null;

  const th = devHud.lowSpeedThreshold ?? 10;
  const spdA = typeof bodyA.userData.speed === "number" ? Math.abs(bodyA.userData.speed) : 0;
  const spdB = typeof bodyB.userData.speed === "number" ? Math.abs(bodyB.userData.speed) : 0;
  const lowA = spdA < th;
  const lowB = spdB < th;

  const shA = !!bodyA.userData?.shieldActive;
  const shB = !!bodyB.userData?.shieldActive;

  if (shA && shB) {
    bodyA.userData.shieldActive = false;
    bodyB.userData.shieldActive = false;
    applyCycleBumpSeparation(bodyA, bodyB, r, dx, dz, dist);
    return { bump: true, derezA: false, derezB: false };
  }
  if (shA && !shB) {
    bodyA.userData.shieldActive = false;
    applyCycleBumpSeparation(bodyA, bodyB, r, dx, dz, dist);
    return { bump: false, derezA: false, derezB: true };
  }
  if (!shA && shB) {
    bodyB.userData.shieldActive = false;
    applyCycleBumpSeparation(bodyA, bodyB, r, dx, dz, dist);
    return { bump: false, derezA: true, derezB: false };
  }

  if (lowA && lowB) {
    applyCycleBumpSeparation(bodyA, bodyB, r, dx, dz, dist);
    return { bump: true, derezA: false, derezB: false };
  }
  if (lowA && !lowB) {
    return { bump: false, derezA: true, derezB: false };
  }
  if (!lowA && lowB) {
    return { bump: false, derezA: false, derezB: true };
  }
  return { bump: false, derezA: true, derezB: true };
}

/**
 * @param {import('cannon-es').Body} bodyA
 * @param {import('cannon-es').Body} bodyB
 * @param {number} r
 * @param {number} dx
 * @param {number} dz
 * @param {number} dist
 */
export function applyCycleBumpSeparation(bodyA, bodyB, r, dx, dz, dist) {
  let nx = dx;
  let nz = dz;
  let d = dist;
  if (d < 1e-5) {
    nx = 1;
    nz = 0;
    d = 1;
  } else {
    nx /= d;
    nz /= d;
  }
  const overlap = r * 2 - d;
  const push = Math.max(0, overlap) * 0.5 + 0.015;
  bodyA.position.x -= nx * push;
  bodyA.position.z -= nz * push;
  bodyB.position.x += nx * push;
  bodyB.position.z += nz * push;
  bodyA.velocity.x = 0;
  bodyA.velocity.z = 0;
  bodyB.velocity.x = 0;
  bodyB.velocity.z = 0;
  bodyA.userData.speed = 0;
  bodyB.userData.speed = 0;
}
