import { Box } from "../../vendor/cannon-es-module.js";

/**
 * @param {number} px
 * @param {number} pz
 * @param {number} dx
 * @param {number} dz
 * @param {number} halfW
 * @param {number} halfD
 * @param {number} r
 * @param {number} maxT
 */
function rayExitArenaInner(px, pz, dx, dz, halfW, halfD, r, maxT) {
  const xmin = -halfW + r;
  const xmax = halfW - r;
  const zmin = -halfD + r;
  const zmax = halfD - r;
  let best = Infinity;

  if (dx < -1e-8) {
    const t = (xmin - px) / dx;
    if (t > 0 && t < maxT) {
      const zz = pz + t * dz;
      if (zz >= zmin - 1e-5 && zz <= zmax + 1e-5) best = Math.min(best, t);
    }
  } else if (dx > 1e-8) {
    const t = (xmax - px) / dx;
    if (t > 0 && t < maxT) {
      const zz = pz + t * dz;
      if (zz >= zmin - 1e-5 && zz <= zmax + 1e-5) best = Math.min(best, t);
    }
  }

  if (dz < -1e-8) {
    const t = (zmin - pz) / dz;
    if (t > 0 && t < maxT) {
      const xx = px + t * dx;
      if (xx >= xmin - 1e-5 && xx <= xmax + 1e-5) best = Math.min(best, t);
    }
  } else if (dz > 1e-8) {
    const t = (zmax - pz) / dz;
    if (t > 0 && t < maxT) {
      const xx = px + t * dx;
      if (xx >= xmin - 1e-5 && xx <= xmax + 1e-5) best = Math.min(best, t);
    }
  }

  return best;
}

/**
 * @param {number} ox
 * @param {number} oz
 * @param {number} dx
 * @param {number} dz
 * @param {import('cannon-es').Body} boxBody
 * @param {number} inflate
 * @param {number} maxT
 */
function rayBarrierXZ(ox, oz, dx, dz, boxBody, inflate, maxT) {
  const shape = boxBody.shapes[0];
  if (!(shape instanceof Box)) return Infinity;
  const he = shape.halfExtents;
  const c = boxBody.position;
  const minX = c.x - he.x - inflate;
  const maxX = c.x + he.x + inflate;
  const minZ = c.z - he.z - inflate;
  const maxZ = c.z + he.z + inflate;

  let t0 = 0;
  let t1 = maxT;

  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity;
  } else {
    const inv = 1 / dx;
    let ta = (minX - ox) * inv;
    let tb = (maxX - ox) * inv;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }

  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity;
  } else {
    const inv = 1 / dz;
    let ta = (minZ - oz) * inv;
    let tb = (maxZ - oz) * inv;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
  }

  if (t1 < t0 || t1 < 0) return Infinity;
  const hit = t0 >= 0 ? t0 : 0;
  return hit >= maxT ? Infinity : hit;
}

/**
 * Shortest distance along forward ray to arena boundary or barrier face (XZ).
 * @param {object} opts
 * @param {number} opts.px
 * @param {number} opts.pz
 * @param {number} opts.heading
 * @param {number} opts.halfW
 * @param {number} opts.halfD
 * @param {number} opts.playerRadius
 * @param {import('cannon-es').Body[] | undefined} opts.barrierBodies
 * @param {number} [opts.maxDist=90]
 */
export function raycastSolidClearanceXZ(opts) {
  const {
    px,
    pz,
    heading,
    halfW,
    halfD,
    playerRadius,
    barrierBodies,
    maxDist = 90,
  } = opts;
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const r = playerRadius;

  let best = rayExitArenaInner(px, pz, dx, dz, halfW, halfD, r, maxDist);
  if (barrierBodies && barrierBodies.length) {
    const inflate = Math.max(0.08, r * 0.95);
    for (const b of barrierBodies) {
      if (!b || b.mass !== 0) continue;
      const t = rayBarrierXZ(px, pz, dx, dz, b, inflate, maxDist);
      if (t < best) best = t;
    }
  }
  return best;
}
