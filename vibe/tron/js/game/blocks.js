import * as THREE from "three";
import { Vec3 } from "cannon-es";
import { createWallPhysicsBody } from "../engine/physics.js";

/**
 * Interior barriers from validated level JSON — visuals + static cannon-es boxes (plan § Arena Object Categories, P5.4).
 * Merging adjacent tiles (P5.5) is not handled here — each JSON entry is one body.
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

  for (const raw of barriers) {
    const b = coerceBarrier(raw);
    if (!b) continue;

    if (b.type === "wall") {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, wallH, 1),
        matWall,
      );
      mesh.position.set(b.x, wallH / 2, b.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      group.add(mesh);
      bodies.push(
        addBarrierBox(world, wallMatRef, { x: 0.5, y: wallH / 2, z: 0.5 }, { x: b.x, y: wallH / 2, z: b.z }),
      );
      continue;
    }

    if (b.type === "building") {
      const h = typeof b.height === "number" ? Math.max(1, Math.min(5, Math.floor(b.height))) : 2;
      const shape = b.shape === "triangle" || b.shape === "hexagon" ? b.shape : "square";

      if (shape === "square") {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, h, 1), matBuilding);
        mesh.position.set(b.x, h / 2, b.z);
        group.add(mesh);
        bodies.push(
          addBarrierBox(world, wallMatRef, { x: 0.5, y: h / 2, z: 0.5 }, { x: b.x, y: h / 2, z: b.z }),
        );
        continue;
      }

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
      continue;
    }

    if (b.type === "structure") {
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
  }

  scene.add(group);
  return { group, bodies };
}
