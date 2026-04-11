import { Body, Box, ContactMaterial, Material, Sphere, Vec3, World } from "cannon-es";

/** cannon-es groups — cycles do not collide with each other here (plan P2.3; resolved in game code). */
export const COLLISION_GROUP_ARENA_SOLID = 1;
export const COLLISION_GROUP_FLOOR = 2;
export const COLLISION_GROUP_CYCLE = 4;

/** @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

const wallMat = new Material("arenaWall");
const floorMat = new Material("arenaFloor");
const playerMat = new Material("player");

/**
 * sin(impactAngle) × currentSpeed with impactAngle = arcsin(|v·n̂| / |v|) → strip |v·n̂| × sin from normal component.
 * Matches plan: head-on loses most inward speed; glancing keeps most tangential motion.
 */
export function applyWallSlideVelocity(playerBody, contactNormalWorld, cfg) {
  const v = playerBody.velocity;
  const n = contactNormalWorld;
  const vn = v.dot(n);
  if (vn <= 1e-6) return;

  const speed = v.length();
  if (speed < 1e-6) return;

  const sinImpact = Math.min(1, vn / speed);
  const strip = vn * sinImpact * (cfg.wallSlideDamping ?? 1);
  playerBody.velocity.vsub(n.scale(strip), playerBody.velocity);
}

export function createPhysicsWorld() {
  const world = new World({
    gravity: new Vec3(0, -22, 0),
  });
  world.defaultContactMaterial.friction = 0;
  world.defaultContactMaterial.restitution = 0;

  world.addContactMaterial(
    new ContactMaterial(playerMat, wallMat, {
      friction: 0,
      restitution: 0,
    }),
  );
  world.addContactMaterial(
    new ContactMaterial(playerMat, floorMat, {
      /** Arcade drive sets horizontal velocity each tick — floor friction would fight coast/brake. */
      friction: 0,
      restitution: 0,
    }),
  );

  return { world, wallMat, floorMat, playerMat };
}

export function createPlayerBody(cfg, playerMat) {
  const radius = cfg.playerRadius;
  const shape = new Sphere(radius);
  const body = new Body({
    mass: cfg.playerMass,
    material: playerMat,
    linearDamping: cfg.playerLinearDamping ?? 0.05,
    angularDamping: 0.99,
    fixedRotation: true,
  });
  body.userData = {};
  body.addShape(shape);
  const spawnY =
    typeof cfg.playerSpawnY === "number" && Number.isFinite(cfg.playerSpawnY)
      ? cfg.playerSpawnY
      : radius + 0.06;
  body.position.set(0, spawnY, 0);
  body.type = Body.DYNAMIC;
  body.collisionFilterGroup = COLLISION_GROUP_CYCLE;
  body.collisionFilterMask = COLLISION_GROUP_ARENA_SOLID | COLLISION_GROUP_FLOOR;
  return body;
}

export function createFloorBody(cfg, floorMat) {
  const halfW = cfg.arenaWidth / 2 + 2;
  const halfD = cfg.arenaDepth / 2 + 2;
  const shape = new Box(new Vec3(halfW, 0.05, halfD));
  const body = new Body({ mass: 0, material: floorMat });
  body.addShape(shape);
  body.position.set(0, -0.05, 0);
  body.collisionFilterGroup = COLLISION_GROUP_FLOOR;
  body.collisionFilterMask = COLLISION_GROUP_CYCLE;
  return body;
}

/** Static perimeter wall (vertical slide response handled in attachWallSlide). */
export function createWallPhysicsBody({ halfExtents, center, wallMatRef }) {
  const shape = new Box(halfExtents);
  const body = new Body({ mass: 0, material: wallMatRef });
  body.userData = {};
  body.addShape(shape);
  body.position.copy(center);
  body.userData.kind = "arenaWall";
  body.collisionFilterGroup = COLLISION_GROUP_ARENA_SOLID;
  body.collisionFilterMask = COLLISION_GROUP_CYCLE;
  return body;
}

/**
 * cannon-es `collide` fires only on first overlap; wall riding needs per-frame correction.
 * When the sphere is in the boundary band, damp velocity into each perimeter plane using the plan slide formula.
 */
/**
 * @param {import('cannon-es').Body} playerBody
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} cfg
 * @param {ReturnType<import('../game/gates.js').computeOpenGateWallFootprints> | null | undefined} [openFootprints] — open gate spans: skip slide so cycles can pass through holes
 */
export function applyContinuousArenaWallSlide(playerBody, cfg, openFootprints) {
  const p = playerBody.position;
  const r = cfg.playerRadius;
  const halfW = cfg.arenaWidth / 2;
  const halfD = cfg.arenaDepth / 2;
  const pad = 0.12;
  const fp = openFootprints;

  if (p.x - r <= -halfW + pad) {
    let skip = false;
    if (fp?.west) {
      for (const { z0, z1 } of fp.west) {
        if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) applyWallSlideVelocity(playerBody, new Vec3(-1, 0, 0), cfg);
  }
  if (p.x + r >= halfW - pad) {
    let skip = false;
    if (fp?.east) {
      for (const { z0, z1 } of fp.east) {
        if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) applyWallSlideVelocity(playerBody, new Vec3(1, 0, 0), cfg);
  }
  if (p.z - r <= -halfD + pad) {
    let skip = false;
    if (fp?.south) {
      for (const { x0, x1 } of fp.south) {
        if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) applyWallSlideVelocity(playerBody, new Vec3(0, 0, -1), cfg);
  }
  if (p.z + r >= halfD - pad) {
    let skip = false;
    if (fp?.north) {
      for (const { x0, x1 } of fp.north) {
        if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) applyWallSlideVelocity(playerBody, new Vec3(0, 0, 1), cfg);
  }
}

/**
 * Arcade drive overwrites velocity each tick — interior barrier boxes need the same slide response as arena walls.
 * @param {import('cannon-es').Body} playerBody
 * @param {import('cannon-es').Body[] | undefined} barrierBodies
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} cfg
 */
export function applyContinuousBarrierSlide(playerBody, barrierBodies, cfg) {
  if (!barrierBodies || barrierBodies.length === 0) return;
  const r = cfg.playerRadius;
  const p = playerBody.position;

  for (const boxBody of barrierBodies) {
    if (!boxBody || boxBody.mass !== 0) continue;
    const shape = boxBody.shapes[0];
    if (!(shape instanceof Box)) continue;

    const he = shape.halfExtents;
    const c = boxBody.position;

    const qx = clamp(p.x, c.x - he.x, c.x + he.x);
    const qy = clamp(p.y, c.y - he.y, c.y + he.y);
    const qz = clamp(p.z, c.z - he.z, c.z + he.z);

    let dx = p.x - qx;
    let dy = p.y - qy;
    let dz = p.z - qz;
    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < 1e-7) {
      const px = p.x - c.x;
      const py = p.y - c.y;
      const pz = p.z - c.z;
      const ax = he.x - Math.abs(px);
      const ay = he.y - Math.abs(py);
      const az = he.z - Math.abs(pz);
      const m = Math.min(ax, ay, az);
      if (m === ax) {
        dx = px > 0 ? 1 : -1;
        dy = 0;
        dz = 0;
      } else if (m === ay) {
        dx = 0;
        dy = py > 0 ? 1 : -1;
        dz = 0;
      } else {
        dx = 0;
        dy = 0;
        dz = pz > 0 ? 1 : -1;
      }
      dist = 1;
    }

    if (dist > r + 0.02) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    if (dist < r - 1e-5) {
      const push = r - dist + 0.012;
      p.x += nx * push;
      p.y += ny * push;
      p.z += nz * push;
    }

    applyWallSlideVelocity(playerBody, new Vec3(-nx, -ny, -nz), cfg);
  }
}
