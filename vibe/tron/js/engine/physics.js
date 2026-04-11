import { Body, Box, ContactMaterial, Material, Sphere, Vec3, World } from "cannon-es";

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
      friction: 0.35,
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
    linearDamping: 0.05,
    angularDamping: 0.99,
    fixedRotation: true,
  });
  body.addShape(shape);
  body.position.set(0, cfg.playerHeight, 0);
  body.type = Body.DYNAMIC;
  return body;
}

export function createFloorBody(cfg, floorMat) {
  const halfW = cfg.arenaWidth / 2 + 2;
  const halfD = cfg.arenaDepth / 2 + 2;
  const shape = new Box(new Vec3(halfW, 0.05, halfD));
  const body = new Body({ mass: 0, material: floorMat });
  body.addShape(shape);
  body.position.set(0, -0.05, 0);
  return body;
}

/** Static perimeter wall (vertical slide response handled in attachWallSlide). */
export function createWallPhysicsBody({ halfExtents, center, wallMatRef }) {
  const shape = new Box(halfExtents);
  const body = new Body({ mass: 0, material: wallMatRef });
  body.addShape(shape);
  body.position.copy(center);
  body.userData.kind = "arenaWall";
  return body;
}

/**
 * cannon-es `collide` fires only on first overlap; wall riding needs per-frame correction.
 * When the sphere is in the boundary band, damp velocity into each perimeter plane using the plan slide formula.
 */
export function applyContinuousArenaWallSlide(playerBody, cfg) {
  const p = playerBody.position;
  const r = cfg.playerRadius;
  const halfW = cfg.arenaWidth / 2;
  const halfD = cfg.arenaDepth / 2;
  const pad = 0.12;

  if (p.x - r <= -halfW + pad) {
    applyWallSlideVelocity(playerBody, new Vec3(-1, 0, 0), cfg);
  }
  if (p.x + r >= halfW - pad) {
    applyWallSlideVelocity(playerBody, new Vec3(1, 0, 0), cfg);
  }
  if (p.z - r <= -halfD + pad) {
    applyWallSlideVelocity(playerBody, new Vec3(0, 0, -1), cfg);
  }
  if (p.z + r >= halfD - pad) {
    applyWallSlideVelocity(playerBody, new Vec3(0, 0, 1), cfg);
  }
}
