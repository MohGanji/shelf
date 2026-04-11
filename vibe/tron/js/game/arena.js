import * as THREE from "three";
import { Vec3 } from "cannon-es";
import { createFloorBody, createWallPhysicsBody } from "../engine/physics.js";
import { buildBarriersFromLevel } from "./blocks.js";
import {
  buildGateMeshes,
  computeOpenGateWallFootprints,
  extractGatesFromWallObjects,
  openGateGapsByEdge,
  solidSegmentsAlongWall,
} from "./gates.js";

function makePanelMaterial(colorHex, emissive, neon) {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissive,
    emissiveIntensity: neon,
    metalness: 0.2,
    roughness: 0.45,
  });
}

/**
 * Visual arena: 1-unit grid on floor, emissive perimeter wall panels, dark plane base.
 * Open gates (from `gapsByEdge`) omit wall mesh in that span so the neon arch reads as a passage.
 *
 * @param {import('three').Scene} scene
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} cfg
 * @param {ReturnType<typeof openGateGapsByEdge> | null | undefined} [gapsByEdge] — merged open-gate intervals per edge (wall coords)
 */
export function buildArenaVisuals(scene, cfg, gapsByEdge) {
  const group = new THREE.Group();
  const halfW = cfg.arenaWidth / 2;
  const halfD = cfg.arenaDepth / 2;
  const h = cfg.arenaWallHeight;
  const neon = 0.35 + cfg.devHud.neonIntensity * 0.45;
  const gridBoost = 0.25 + cfg.devHud.gridBrightness * 0.55;

  const floorGeo = new THREE.PlaneGeometry(cfg.arenaWidth, cfg.arenaDepth);
  const floorMat = new THREE.MeshStandardMaterial({
    color: cfg.colors.gridFloor,
    emissive: new THREE.Color(cfg.colors.gridLine).multiplyScalar(0.04),
    metalness: 0.15,
    roughness: 0.85,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new THREE.LineSegments(
    buildGridGeometry(halfW, halfD),
    new THREE.LineBasicMaterial({
      color: cfg.colors.gridLine,
      transparent: true,
      opacity: Math.min(1, gridBoost),
    }),
  );
  grid.position.y = 0.02;
  group.add(grid);

  const t = 1;
  const panelLen = 20;
  const matA = makePanelMaterial(cfg.colors.wallPanelA, 0x004455, neon);
  const matB = makePanelMaterial(cfg.colors.wallPanelB, 0x00aadd, neon * 1.15);

  const g =
    gapsByEdge ??
    /** @type {ReturnType<typeof openGateGapsByEdge>} */ ({
      north: [],
      south: [],
      east: [],
      west: [],
    });

  const aw = cfg.arenaWidth;
  const ad = cfg.arenaDepth;

  /** @param {number} s0 @param {number} s1 @param {(u: number, v: number, idx: number) => void} fn */
  function forChunks(s0, s1, fn) {
    let u = s0;
    let idx = 0;
    while (u < s1 - 1e-4) {
      const v = Math.min(s1, u + panelLen);
      fn(u, v, idx);
      u = v;
      idx += 1;
    }
  }

  let nsNegIdx = 0;
  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const mat = nsNegIdx % 2 === 0 ? matB : matA;
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), mat);
      mesh.position.set(cx, h / 2, -halfD - t / 2);
      group.add(mesh);
      nsNegIdx += 1;
    });
  }

  let nsPosIdx = 0;
  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const mat = nsPosIdx % 2 === 0 ? matB : matA;
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), mat);
      mesh.position.set(cx, h / 2, halfD + t / 2);
      group.add(mesh);
      nsPosIdx += 1;
    });
  }

  let weNegIdx = 0;
  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const mat = weNegIdx % 2 === 0 ? matA : matB;
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), mat);
      mesh.position.set(-halfW - t / 2, h / 2, cz);
      group.add(mesh);
      weNegIdx += 1;
    });
  }

  let wePosIdx = 0;
  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const mat = wePosIdx % 2 === 0 ? matA : matB;
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), mat);
      mesh.position.set(halfW + t / 2, h / 2, cz);
      group.add(mesh);
      wePosIdx += 1;
    });
  }

  scene.add(group);
  return { group, materials: [floorMat, matA, matB] };
}

function buildGridGeometry(halfW, halfD) {
  const positions = [];
  const z0 = -halfD;
  const z1 = halfD;
  for (let x = -halfW; x <= halfW; x += 1) {
    positions.push(x, 0, z0, x, 0, z1);
  }
  const x0 = -halfW;
  const x1 = halfW;
  for (let z = -halfD; z <= halfD; z += 1) {
    positions.push(x0, 0, z, x1, 0, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/**
 * Perimeter grid + walls from merged play config (dimensions usually come from campaign level JSON via
 * `getArenaPlaytestConfig` + `extractArenaDimensionsFromLevel`). Barriers from JSON (P5.4); gates — P5.6+.
 *
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {import('cannon-es').Material} wallMat
 * @param {import('cannon-es').Material} floorMat
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {Record<string, unknown> | null} [level] — validated campaign level; attached to `scene.userData.campaignLevel`
 */
export function buildArenaFromCampaignLevel(scene, world, wallMat, floorMat, playCfg, level = null) {
  const gates =
    level && Array.isArray(level.wallObjects) ? extractGatesFromWallObjects(level.wallObjects) : [];
  const gapsByEdge = openGateGapsByEdge(gates);

  buildArenaVisuals(scene, playCfg, gapsByEdge);
  buildArenaPhysics(world, wallMat, floorMat, playCfg, gapsByEdge);

  if (gates.length > 0) {
    const built = buildGateMeshes(scene, playCfg, gates, playCfg.arenaWidth, playCfg.arenaDepth);
    scene.userData.gateAnimatables = built.animatables;
    scene.userData.gates = { list: gates, root: built.root };
    scene.userData.openGateFootprints = computeOpenGateWallFootprints(
      gates,
      playCfg.arenaWidth,
      playCfg.arenaDepth,
    );
  } else {
    delete scene.userData.gateAnimatables;
    delete scene.userData.gates;
    delete scene.userData.openGateFootprints;
  }

  /** @type {import('cannon-es').Body[]} */
  let barrierBodies = [];
  if (level && Array.isArray(level.barriers) && level.barriers.length > 0) {
    const built = buildBarriersFromLevel(scene, world, wallMat, playCfg, level.barriers);
    barrierBodies = built.bodies;
    scene.userData.barriersGroup = built.group;
  } else {
    delete scene.userData.barriersGroup;
  }
  scene.userData.barrierBodies = barrierBodies;

  if (level && typeof level === "object" && typeof level.id === "string") {
    scene.userData.campaignLevel = {
      id: level.id,
      name: typeof level.name === "string" ? level.name : level.id,
    };
  } else {
    delete scene.userData.campaignLevel;
  }
}

/**
 * cannon-es static bodies for floor + perimeter walls (aligned with visuals). Open gates omit physics so cycles can pass through.
 * @param {ReturnType<typeof openGateGapsByEdge> | null | undefined} [gapsByEdge]
 */
export function buildArenaPhysics(world, wallMat, floorMat, cfg, gapsByEdge) {
  const halfW = cfg.arenaWidth / 2;
  const halfD = cfg.arenaDepth / 2;
  const h = cfg.arenaWallHeight;
  const t = 1;

  const floor = createFloorBody(cfg, floorMat);
  world.addBody(floor);

  const y = h / 2;
  const aw = cfg.arenaWidth;
  const ad = cfg.arenaDepth;

  const g =
    gapsByEdge ??
    /** @type {ReturnType<typeof openGateGapsByEdge>} */ ({
      north: [],
      south: [],
      east: [],
      west: [],
    });

  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hx = (s1 - s0) / 2;
    const cx = -halfW + (s0 + s1) / 2;
    world.addBody(
      createWallPhysicsBody({
        halfExtents: new Vec3(hx, h / 2, t / 2),
        center: new Vec3(cx, y, -halfD - t / 2),
        wallMatRef: wallMat,
      }),
    );
  }
  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hx = (s1 - s0) / 2;
    const cx = -halfW + (s0 + s1) / 2;
    world.addBody(
      createWallPhysicsBody({
        halfExtents: new Vec3(hx, h / 2, t / 2),
        center: new Vec3(cx, y, halfD + t / 2),
        wallMatRef: wallMat,
      }),
    );
  }
  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hz = (s1 - s0) / 2;
    const cz = -halfD + (s0 + s1) / 2;
    world.addBody(
      createWallPhysicsBody({
        halfExtents: new Vec3(t / 2, h / 2, hz),
        center: new Vec3(-halfW - t / 2, y, cz),
        wallMatRef: wallMat,
      }),
    );
  }
  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hz = (s1 - s0) / 2;
    const cz = -halfD + (s0 + s1) / 2;
    world.addBody(
      createWallPhysicsBody({
        halfExtents: new Vec3(t / 2, h / 2, hz),
        center: new Vec3(halfW + t / 2, y, cz),
        wallMatRef: wallMat,
      }),
    );
  }
}

/** After BOOT tunnel: hide tunnel mesh, switch fog/camera, add arena lighting. */
export function applyArenaStageEnvironment(game, cfg) {
  const { scene, camera, tunnel, floorReflector } = game;
  tunnel.visible = false;
  if (floorReflector) floorReflector.visible = false;
  scene.background = new THREE.Color(0x02050a);
  scene.fog = new THREE.Fog(0x02050a, 80, 520);
  camera.near = 0.1;
  camera.far = 2000;
  camera.position.set(0, 120, 180);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const hemi = new THREE.HemisphereLight(cfg.colors.ambient, 0x020208, 0.55);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(60, 120, 40);
  const fill = new THREE.DirectionalLight(0x00aaff, 0.35);
  fill.position.set(-80, 40, -60);
  scene.add(hemi, sun, fill);
}
