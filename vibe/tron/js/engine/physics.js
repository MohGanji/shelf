import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Sphere,
  Vec3,
  World,
} from "../vendor/cannon-es-module.js";

const YAW_AXIS = new Vec3(0, 1, 0);

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

/**
 * World-space XZ bounds of an oriented cycle footprint (center px,pz; local +Z = forward).
 * @param {number} px
 * @param {number} pz
 * @param {number} heading
 * @param {number} halfW — half width (local X)
 * @param {number} halfL — half length (local Z)
 */
export function cycleWorldAabbXZ(px, pz, heading, halfW, halfL) {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * halfW;
      const lz = sz * halfL;
      const wx = px + lx * c + lz * s;
      const wz = pz - lx * s + lz * c;
      if (wx < minX) minX = wx;
      if (wx > maxX) maxX = wx;
      if (wz < minZ) minZ = wz;
      if (wz > maxZ) maxZ = wz;
    }
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Keep cannon body yaw aligned with arcade `userData.heading` (local +Z forward).
 * Call before and after `world.step` so contacts do not accumulate spin.
 * @param {import('cannon-es').Body} body
 */
export function syncCyclePhysicsYaw(body) {
  const h = typeof body.userData?.heading === "number" ? body.userData.heading : 0;
  body.quaternion.setFromAxisAngle(YAW_AXIS, h);
  body.angularVelocity.set(0, 0, 0);
}

/**
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} cfg
 * @param {import('cannon-es').Material} playerMat
 */
export function createPlayerBody(cfg, playerMat) {
  const hx = cfg.cycleHalfWidth;
  const hy = cfg.cycleHalfHeight;
  const hz = cfg.cycleHalfLength;
  const useBox =
    typeof hx === "number" &&
    Number.isFinite(hx) &&
    hx > 0 &&
    typeof hy === "number" &&
    Number.isFinite(hy) &&
    hy > 0 &&
    typeof hz === "number" &&
    Number.isFinite(hz) &&
    hz > 0;

  /** @type {import('cannon-es').Box | import('cannon-es').Sphere} */
  const shape = useBox
    ? new Box(new Vec3(hx, hy, hz))
    : new Sphere(typeof cfg.playerRadius === "number" && cfg.playerRadius > 0 ? cfg.playerRadius : 0.35);

  const body = new Body({
    mass: cfg.playerMass,
    material: playerMat,
    linearDamping: cfg.playerLinearDamping ?? 0.05,
    angularDamping: 0.99,
    fixedRotation: !useBox,
  });
  body.userData = {};
  body.addShape(shape);
  const fallbackY =
    typeof cfg.playerRadius === "number" && cfg.playerRadius > 0 ? cfg.playerRadius : 0.35;
  const spawnY =
    typeof cfg.playerSpawnY === "number" && Number.isFinite(cfg.playerSpawnY)
      ? cfg.playerSpawnY
      : (useBox ? hy : fallbackY) + 0.06;
  body.position.set(0, spawnY, 0);
  if (useBox) syncCyclePhysicsYaw(body);
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
export function createWallPhysicsBody({ halfExtents, center, wallMatRef, rotationY = 0 }) {
  const shape = new Box(halfExtents);
  const body = new Body({ mass: 0, material: wallMatRef });
  body.userData = {};
  body.addShape(shape);
  body.position.copy(center);
  if (Number.isFinite(rotationY) && rotationY !== 0) {
    body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), rotationY);
  }
  body.userData.kind = "arenaWall";
  body.collisionFilterGroup = COLLISION_GROUP_ARENA_SOLID;
  body.collisionFilterMask = COLLISION_GROUP_CYCLE;
  return body;
}

export function createTriangleBarrierBody({ center, width, depth, height, wallMatRef, rotationY = 0 }) {
  const body = new Body({ mass: 0, material: wallMatRef });
  body.userData = {
    kind: "triangleBarrier",
    triangleBarrier: {
      width,
      depth,
      height,
    },
  };
  body.position.copy(center);
  if (Number.isFinite(rotationY) && rotationY !== 0) {
    body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), rotationY);
  }
  body.collisionFilterGroup = COLLISION_GROUP_ARENA_SOLID;
  body.collisionFilterMask = COLLISION_GROUP_CYCLE;
  return body;
}

/**
 * @param {import('cannon-es').Quaternion} q
 */
function yawFromQuaternion(q) {
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

/**
 * Project the oriented cycle box onto a barrier's local X/Z axes.
 *
 * @param {number} cycleHeading
 * @param {number} barrierYaw
 * @param {number} halfW
 * @param {number} halfL
 */
function cycleHalfExtentsInBarrierLocal(cycleHeading, barrierYaw, halfW, halfL) {
  const ch = Math.cos(cycleHeading);
  const sh = Math.sin(cycleHeading);
  const cb = Math.cos(barrierYaw);
  const sb = Math.sin(barrierYaw);
  let hx = 0;
  let hz = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const lx = sx * halfW;
      const lz = sz * halfL;
      const wx = lx * ch + lz * sh;
      const wz = -lx * sh + lz * ch;
      const bx = wx * cb - wz * sb;
      const bz = wx * sb + wz * cb;
      hx = Math.max(hx, Math.abs(bx));
      hz = Math.max(hz, Math.abs(bz));
    }
  }
  return { hx, hz };
}

function cycleSupportInBarrierLocal(cycleHeading, barrierYaw, nx, nz, halfW, halfL) {
  const rel = cycleHeading - barrierYaw;
  const axisX = { x: Math.cos(rel), z: -Math.sin(rel) };
  const axisZ = { x: Math.sin(rel), z: Math.cos(rel) };
  return Math.abs(nx * axisX.x + nz * axisX.z) * halfW + Math.abs(nx * axisZ.x + nz * axisZ.z) * halfL;
}

function handleTriangleBarrierSlide(playerBody, body, cfg, heading, halfW, halfL) {
  const tri = body.userData?.triangleBarrier;
  if (!tri || typeof tri.width !== "number" || typeof tri.depth !== "number") return false;
  const p = playerBody.position;
  const c = body.position;
  const barrierYaw = yawFromQuaternion(body.quaternion);
  const cb = Math.cos(barrierYaw);
  const sb = Math.sin(barrierYaw);
  const dxw = p.x - c.x;
  const dzw = p.z - c.z;
  const localX = dxw * cb - dzw * sb;
  const localZ = dxw * sb + dzw * cb;
  const w = tri.width;
  const d = tri.depth;
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const hypLen = Math.hypot(w, d) || 1;
  const edges = [
    { nx: 0, nz: -1, px: x0, pz: z0 },
    { nx: -1, nz: 0, px: x0, pz: z1 },
    { nx: d / hypLen, nz: w / hypLen, px: x1, pz: z0 },
  ];

  let best = null;
  for (const e of edges) {
    const support = cycleSupportInBarrierLocal(heading, barrierYaw, e.nx, e.nz, halfW, halfL);
    const signed = e.nx * (localX - e.px) + e.nz * (localZ - e.pz);
    if (signed > support + 0.02) return false;
    const penetration = support - signed;
    if (!best || penetration < best.penetration) best = { ...e, penetration };
  }
  if (!best) return false;

  const nx = best.nx * cb + best.nz * sb;
  const nz = -best.nx * sb + best.nz * cb;
  const push = Math.max(0, best.penetration) + 0.012;
  if (push > 0.012) {
    p.x += nx * push;
    p.z += nz * push;
  }
  applyWallSlideVelocity(playerBody, new Vec3(-nx, 0, -nz), cfg);
  return true;
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
  const heading = typeof playerBody.userData?.heading === "number" ? playerBody.userData.heading : 0;
  const halfWx = cfg.cycleHalfWidth;
  const halfLz = cfg.cycleHalfLength;
  const arenaHalfW = cfg.arenaWidth / 2;
  const arenaHalfD = cfg.arenaDepth / 2;
  const pad = 0.12;
  const fp = openFootprints;
  const r = cfg.playerRadius;

  const useOriented =
    typeof halfWx === "number" &&
    Number.isFinite(halfWx) &&
    typeof halfLz === "number" &&
    Number.isFinite(halfLz);

  if (useOriented) {
    const { minX, maxX, minZ, maxZ } = cycleWorldAabbXZ(p.x, p.z, heading, halfWx, halfLz);
    if (minX <= -arenaHalfW + pad) {
      let skip = false;
      if (fp?.west) {
        for (const { z0, z1 } of fp.west) {
          if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        const target = -arenaHalfW + pad;
        const push = target - minX;
        if (push > 0) p.x += push;
        applyWallSlideVelocity(playerBody, new Vec3(-1, 0, 0), cfg);
      }
    }
    if (maxX >= arenaHalfW - pad) {
      let skip = false;
      if (fp?.east) {
        for (const { z0, z1 } of fp.east) {
          if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        const target = arenaHalfW - pad;
        const push = maxX - target;
        if (push > 0) p.x -= push;
        applyWallSlideVelocity(playerBody, new Vec3(1, 0, 0), cfg);
      }
    }
    if (minZ <= -arenaHalfD + pad) {
      let skip = false;
      if (fp?.south) {
        for (const { x0, x1 } of fp.south) {
          if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        const target = -arenaHalfD + pad;
        const push = target - minZ;
        if (push > 0) p.z += push;
        applyWallSlideVelocity(playerBody, new Vec3(0, 0, -1), cfg);
      }
    }
    if (maxZ >= arenaHalfD - pad) {
      let skip = false;
      if (fp?.north) {
        for (const { x0, x1 } of fp.north) {
          if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
            skip = true;
            break;
          }
        }
      }
      if (!skip) {
        const target = arenaHalfD - pad;
        const push = maxZ - target;
        if (push > 0) p.z -= push;
        applyWallSlideVelocity(playerBody, new Vec3(0, 0, 1), cfg);
      }
    }
    return;
  }

  if (p.x - r <= -arenaHalfW + pad) {
    let skip = false;
    if (fp?.west) {
      for (const { z0, z1 } of fp.west) {
        if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) {
      const target = -arenaHalfW + pad;
      const push = target - (p.x - r);
      if (push > 0) p.x += push;
      applyWallSlideVelocity(playerBody, new Vec3(-1, 0, 0), cfg);
    }
  }
  if (p.x + r >= arenaHalfW - pad) {
    let skip = false;
    if (fp?.east) {
      for (const { z0, z1 } of fp.east) {
        if (p.z >= z0 - r - 0.02 && p.z <= z1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) {
      const target = arenaHalfW - pad;
      const push = (p.x + r) - target;
      if (push > 0) p.x -= push;
      applyWallSlideVelocity(playerBody, new Vec3(1, 0, 0), cfg);
    }
  }
  if (p.z - r <= -arenaHalfD + pad) {
    let skip = false;
    if (fp?.south) {
      for (const { x0, x1 } of fp.south) {
        if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) {
      const target = -arenaHalfD + pad;
      const push = target - (p.z - r);
      if (push > 0) p.z += push;
      applyWallSlideVelocity(playerBody, new Vec3(0, 0, -1), cfg);
    }
  }
  if (p.z + r >= arenaHalfD - pad) {
    let skip = false;
    if (fp?.north) {
      for (const { x0, x1 } of fp.north) {
        if (p.x >= x0 - r - 0.02 && p.x <= x1 + r + 0.02) {
          skip = true;
          break;
        }
      }
    }
    if (!skip) {
      const target = arenaHalfD - pad;
      const push = (p.z + r) - target;
      if (push > 0) p.z -= push;
      applyWallSlideVelocity(playerBody, new Vec3(0, 0, 1), cfg);
    }
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
  const p = playerBody.position;
  const heading = typeof playerBody.userData?.heading === "number" ? playerBody.userData.heading : 0;
  const halfW = typeof cfg.cycleHalfWidth === "number" && Number.isFinite(cfg.cycleHalfWidth) ? cfg.cycleHalfWidth : 0;
  const halfL = typeof cfg.cycleHalfLength === "number" && Number.isFinite(cfg.cycleHalfLength) ? cfg.cycleHalfLength : 0;
  const useCycleBox = halfW > 0 && halfL > 0;
  const fallbackR = typeof cfg.playerRadius === "number" && Number.isFinite(cfg.playerRadius) ? cfg.playerRadius : 0.5;

  for (const boxBody of barrierBodies) {
    if (!boxBody || boxBody.mass !== 0) continue;
    if (useCycleBox && boxBody.userData?.kind === "triangleBarrier") {
      handleTriangleBarrierSlide(playerBody, boxBody, cfg, heading, halfW, halfL);
      continue;
    }
    const shape = boxBody.shapes[0];
    if (!(shape instanceof Box)) continue;

    const he = shape.halfExtents;
    const c = boxBody.position;
    const barrierYaw = yawFromQuaternion(boxBody.quaternion);

    if (useCycleBox) {
      const cb = Math.cos(barrierYaw);
      const sb = Math.sin(barrierYaw);
      const dxw = p.x - c.x;
      const dzw = p.z - c.z;
      const localX = dxw * cb - dzw * sb;
      const localZ = dxw * sb + dzw * cb;
      const cycle = cycleHalfExtentsInBarrierLocal(heading, barrierYaw, halfW, halfL);
      const expandedX = he.x + cycle.hx;
      const expandedZ = he.z + cycle.hz;
      const overlapX = expandedX - Math.abs(localX);
      const overlapZ = expandedZ - Math.abs(localZ);
      if (overlapX < -0.02 || overlapZ < -0.02) continue;

      let nxLocal = 0;
      let nzLocal = 0;
      let push = 0;
      if (overlapX < overlapZ) {
        nxLocal = localX >= 0 ? 1 : -1;
        push = Math.max(0, overlapX) + 0.012;
      } else {
        nzLocal = localZ >= 0 ? 1 : -1;
        push = Math.max(0, overlapZ) + 0.012;
      }

      const nx = nxLocal * cb + nzLocal * sb;
      const nz = -nxLocal * sb + nzLocal * cb;
      if (push > 0.012) {
        p.x += nx * push;
        p.z += nz * push;
      }
      applyWallSlideVelocity(playerBody, new Vec3(-nx, 0, -nz), cfg);
      continue;
    }

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

    if (dist > fallbackR + 0.02) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    if (dist < fallbackR - 1e-5) {
      const push = fallbackR - dist + 0.012;
      p.x += nx * push;
      p.y += ny * push;
      p.z += nz * push;
    }

    applyWallSlideVelocity(playerBody, new Vec3(-nx, -ny, -nz), cfg);
  }
}
