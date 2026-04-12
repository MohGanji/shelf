import * as THREE from "../vendor/three-module.js";
import { Vec3 } from "../vendor/cannon-es-module.js";
import { createWallPhysicsBody } from "../engine/physics.js";

/**
 * Interior barriers from validated level JSON — visuals + static cannon-es boxes (plan § Arena Object Categories, P5.4).
 * P5.5: adjacent `wall` tiles and same-shape `building` squares (same height) merge into fewer meshes/bodies via axis-aligned runs.
 */

function neonBarrierMaterial(baseHex, emissiveHex, neonStrength) {
  return new THREE.MeshStandardMaterial({
    color: baseHex,
    emissive: emissiveHex,
    emissiveIntensity: neonStrength,
    metalness: 0.25,
    roughness: 0.42,
  });
}

/**
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 */
function barrierNeon(playCfg) {
  const n = 0.38 + playCfg.devHud.neonIntensity * 0.5;
  return n;
}

/**
 * @param {import('cannon-es').Material} wallMatRef
 * @param {THREE.Vector3Like} halfExtents
 * @param {THREE.Vector3Like} center
 */
function addBarrierBox(world, wallMatRef, halfExtents, center) {
  const body = createWallPhysicsBody({
    halfExtents: new Vec3(halfExtents.x, halfExtents.y, halfExtents.z),
    center: new Vec3(center.x, center.y, center.z),
    wallMatRef,
  });
  body.userData.kind = "barrier";
  world.addBody(body);
  return body;
}

/**
 * @param {unknown} b
 * @returns {{ type: string; x: number; z: number; height?: number; shape?: string; variant?: string } | null}
 */
function coerceBarrier(b) {
  if (!b || typeof b !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (b);
  const type = o.type;
  const x = o.x;
  const z = o.z;
  if (typeof type !== "string") return null;
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (typeof z !== "number" || !Number.isFinite(z)) return null;
  const out = { type, x, z };
  if (typeof o.height === "number" && Number.isFinite(o.height)) out.height = o.height;
  if (typeof o.shape === "string") out.shape = o.shape;
  if (typeof o.variant === "string") out.variant = o.variant;
  return out;
}

/** 1-unit tile centers from level JSON (integers expected; rounded for stable keys). */
function tileKey(x, z) {
  return `${Math.round(x)},${Math.round(z)}`;
}

/**
 * Merge colinear runs on the grid: horizontal passes first, then vertical, then 1×1 for diagonal-only stubs.
 * Same adjacency rule as the editor (4-neighbor); diagonal touch does not merge.
 *
 * @param {Iterable<string>} tileKeys `"ix,iz"`
 * @returns {{ cx: number; cz: number; halfX: number; halfZ: number }[]}
 */
function mergeAxisAlignedBarrierTiles(tileKeys) {
  /** @type {Set<string>} */
  let rem = new Set(tileKeys);
  /** @type {{ cx: number; cz: number; halfX: number; halfZ: number }[]} */
  const out = [];

  const zUniq = [...new Set([...rem].map((k) => Number(k.split(",")[1])))].sort((a, b) => a - b);
  for (const z of zUniq) {
    const xs = [...rem]
      .filter((k) => Number(k.split(",")[1]) === z)
      .map((k) => Number(k.split(",")[0]))
      .sort((a, b) => a - b);
    if (xs.length === 0) continue;
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const run = xs.slice(i, j + 1);
      const x0 = run[0];
      const x1 = run[run.length - 1];
      const len = x1 - x0 + 1;
      out.push({ cx: (x0 + x1) / 2, cz: z, halfX: len / 2, halfZ: 0.5 });
      for (const x of run) rem.delete(tileKey(x, z));
      i = j + 1;
    }
  }

  const xUniq = [...new Set([...rem].map((k) => Number(k.split(",")[0])))].sort((a, b) => a - b);
  for (const x of xUniq) {
    const zs = [...rem]
      .filter((k) => Number(k.split(",")[0]) === x)
      .map((k) => Number(k.split(",")[1]))
      .sort((a, b) => a - b);
    if (zs.length === 0) continue;
    let i = 0;
    while (i < zs.length) {
      let j = i;
      while (j + 1 < zs.length && zs[j + 1] === zs[j] + 1) j++;
      const run = zs.slice(i, j + 1);
      const z0 = run[0];
      const z1 = run[run.length - 1];
      const len = z1 - z0 + 1;
      out.push({ cx: x, cz: (z0 + z1) / 2, halfX: 0.5, halfZ: len / 2 });
      for (const z of run) rem.delete(tileKey(x, z));
      i = j + 1;
    }
  }

  for (const k of rem) {
    const [ix, iz] = k.split(",").map(Number);
    out.push({ cx: ix, cz: iz, halfX: 0.5, halfZ: 0.5 });
  }

  return out;
}

/**
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {import('cannon-es').Material} wallMatRef
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {unknown[]} barriers
 * @returns {{ group: THREE.Group; bodies: import('cannon-es').Body[] }}
 */
export function buildBarriersFromLevel(scene, world, wallMatRef, playCfg, barriers) {
  const group = new THREE.Group();
  group.name = "barriers";
  /** @type {import('cannon-es').Body[]} */
  const bodies = [];

  const wallH = playCfg.devHud.wallHeight ?? playCfg.arenaWallHeight;
  const neon = barrierNeon(playCfg);
  const matWall = neonBarrierMaterial(0x113344, 0x0088aa, neon);
  const matBuilding = neonBarrierMaterial(0x1a3355, 0x0066cc, neon * 1.05);
  const matStructure = neonBarrierMaterial(0x223355, 0x00aaff, neon * 1.1);

  /** @type {string[]} */
  const wallTileKeys = [];
  /** @type {Map<number, Set<string>>} */
  const squareBuildingsByHeight = new Map();
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const nonSquareBuildings = [];
  /** @type {NonNullable<ReturnType<typeof coerceBarrier>>[]} */
  const structureList = [];

  for (const raw of barriers) {
    const b = coerceBarrier(raw);
    if (!b) continue;

    if (b.type === "wall") {
      wallTileKeys.push(tileKey(b.x, b.z));
      continue;
    }

    if (b.type === "building") {
      const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
      const shape = b.shape === "triangle" || b.shape === "hexagon" ? b.shape : "square";
      if (shape === "square") {
        if (!squareBuildingsByHeight.has(h)) squareBuildingsByHeight.set(h, new Set());
        squareBuildingsByHeight.get(h).add(tileKey(b.x, b.z));
      } else {
        nonSquareBuildings.push(b);
      }
      continue;
    }

    if (b.type === "structure") {
      structureList.push(b);
    }
  }

  const uniqueWallKeys = [...new Set(wallTileKeys)];
  for (const seg of mergeAxisAlignedBarrierTiles(uniqueWallKeys)) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(seg.halfX * 2, wallH, seg.halfZ * 2),
      matWall,
    );
    mesh.position.set(seg.cx, wallH / 2, seg.cz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    bodies.push(
      addBarrierBox(
        world,
        wallMatRef,
        { x: seg.halfX, y: wallH / 2, z: seg.halfZ },
        { x: seg.cx, y: wallH / 2, z: seg.cz },
      ),
    );
  }

  for (const [h, keySet] of squareBuildingsByHeight) {
    for (const seg of mergeAxisAlignedBarrierTiles(keySet)) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(seg.halfX * 2, h, seg.halfZ * 2),
        matBuilding,
      );
      mesh.position.set(seg.cx, h / 2, seg.cz);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: seg.halfX, y: h / 2, z: seg.halfZ },
          { x: seg.cx, y: h / 2, z: seg.cz },
        ),
      );
    }
  }

  for (const b of nonSquareBuildings) {
    const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
    const shape = b.shape === "triangle" || b.shape === "hexagon" ? b.shape : "square";
    const segs = shape === "triangle" ? 3 : 6;
    const radius = shape === "triangle" ? 0.55 : 0.52;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, h, segs),
      matBuilding,
    );
    mesh.position.set(b.x, h / 2, b.z);
    group.add(mesh);
    bodies.push(
      addBarrierBox(world, wallMatRef, { x: radius, y: h / 2, z: radius }, { x: b.x, y: h / 2, z: b.z }),
    );
  }

  for (const b of structureList) {
    const variant = b.variant === "column" || b.variant === "obelisk" ? b.variant : "pylon";
    const structH = Math.min(wallH * 0.85, 2.2);

    if (variant === "pylon") {
      const w = 0.22;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, structH, w),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: w / 2, y: structH / 2, z: w / 2 },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    } else if (variant === "column") {
      const r = 0.38;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, structH, 20),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: r, y: structH / 2, z: r },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    } else {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.42, structH, 4),
        matStructure,
      );
      mesh.position.set(b.x, structH / 2, b.z);
      group.add(mesh);
      bodies.push(
        addBarrierBox(
          world,
          wallMatRef,
          { x: 0.42, y: structH / 2, z: 0.42 },
          { x: b.x, y: structH / 2, z: b.z },
        ),
      );
    }
  }

  scene.add(group);
  return { group, bodies };
}
