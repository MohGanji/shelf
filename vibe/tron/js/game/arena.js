import * as THREE from "../vendor/three-module.js";
import { Vec3 } from "../vendor/cannon-es-module.js";
import { getFloorGridLineStep } from "../config.js";
import { createFloorBody, createWallPhysicsBody } from "../engine/physics.js";
import { buildBarriersFromLevel } from "./blocks.js";
import {
  buildGateMeshes,
  computeOpenGateWallFootprints,
  extractGatesFromWallObjects,
  openGateGapsByEdge,
  solidSegmentsAlongWall,
} from "./gates.js";

/** @typedef {import("./gates.js").WallEdge} PerimeterEdge — perimeter rebuild uses same edge keys as gates */

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
 * Dispose mesh geometry/material for wall chunk meshes under a group.
 * @param {THREE.Group} group
 */
function disposeWallMeshGroup(group) {
  const toRemove = [...group.children];
  for (const ch of toRemove) {
    group.remove(ch);
    if (ch instanceof THREE.Mesh) {
      ch.geometry?.dispose();
      const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of mats) m?.dispose();
    }
  }
}

/**
 * Visual arena: 1-unit grid on floor, emissive perimeter wall panels, dark plane base.
 * Open gates (from `gapsByEdge`) omit wall mesh in that span so the neon arch reads as a passage.
 *
 * @param {import('three').Scene} scene
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} cfg
 * @param {ReturnType<typeof openGateGapsByEdge> | null | undefined} [gapsByEdge]
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
    emissive: new THREE.Color(cfg.colors.gridLine).multiplyScalar(0.055),
    metalness: 0.12,
    roughness: 0.82,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  const grid = new THREE.LineSegments(
    buildGridGeometry(halfW, halfD, getFloorGridLineStep(cfg.devHud)),
    new THREE.LineBasicMaterial({
      color: cfg.colors.gridLine,
      transparent: true,
      /** Fewer lines at high `floorGridLineStep` — bump opacity so the grid stays legible. */
      opacity: Math.min(1, gridBoost * 1.08 * 1.18),
    }),
  );
  grid.position.y = 0.02;
  group.add(grid);

  const t = 1;
  const panelLen = 20;
  /** Single finish for all perimeter panels (no A/B checkerboard). */
  const wallPanelMat = makePanelMaterial(cfg.colors.wallPanelA, 0x004455, neon);

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

  /** @type {Record<PerimeterEdge, THREE.Group>} */
  const edgeVisualGroups = {
    south: new THREE.Group(),
    north: new THREE.Group(),
    east: new THREE.Group(),
    west: new THREE.Group(),
  };
  edgeVisualGroups.south.name = "tron-wall-south";
  edgeVisualGroups.north.name = "tron-wall-north";
  edgeVisualGroups.east.name = "tron-wall-east";
  edgeVisualGroups.west.name = "tron-wall-west";

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

  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), wallPanelMat);
      mesh.position.set(cx, h / 2, -halfD - t / 2);
      edgeVisualGroups.south.add(mesh);
    });
  }

  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), wallPanelMat);
      mesh.position.set(cx, h / 2, halfD + t / 2);
      edgeVisualGroups.north.add(mesh);
    });
  }

  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), wallPanelMat);
      mesh.position.set(-halfW - t / 2, h / 2, cz);
      edgeVisualGroups.west.add(mesh);
    });
  }

  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), wallPanelMat);
      mesh.position.set(halfW + t / 2, h / 2, cz);
      edgeVisualGroups.east.add(mesh);
    });
  }

  group.add(
    edgeVisualGroups.south,
    edgeVisualGroups.north,
    edgeVisualGroups.west,
    edgeVisualGroups.east,
  );

  scene.add(group);
  return { group, materials: [floorMat, wallPanelMat], wallMaterials: { wallPanel: wallPanelMat }, edgeVisualGroups };
}

function buildGridGeometry(halfW, halfD, lineStep) {
  const positions = [];
  const step = lineStep;
  const z0 = -halfD;
  const z1 = halfD;
  for (let x = -halfW; x <= halfW + 1e-6; x += step) {
    positions.push(x, 0, z0, x, 0, z1);
  }
  const x0 = -halfW;
  const x1 = halfW;
  for (let z = -halfD; z <= halfD + 1e-6; z += step) {
    positions.push(x0, 0, z, x1, 0, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/**
 * Rebuild one perimeter edge's visuals + physics after gate lock state changes (P5.7 exit unlock).
 *
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {import('cannon-es').Material} wallMat
 * @param {PerimeterEdge} edge
 * @param {ReturnType<typeof openGateGapsByEdge>} gapsByEdge
 */
export function rebuildPerimeterWallEdge(scene, world, playCfg, wallMat, edge, visualGaps, physicsGaps) {
  const per = scene.userData.tronPerimeter;
  if (!per || !per.edgeVisualGroups || !per.wallBodiesByEdge || !per.wallMaterials) return;

  const visGroup = per.edgeVisualGroups[edge];
  const bodies = per.wallBodiesByEdge[edge];
  const wallPanel = per.wallMaterials.wallPanel;
  if (!wallPanel) return;

  disposeWallMeshGroup(visGroup);
  for (const b of bodies) {
    world.removeBody(b);
  }
  bodies.length = 0;

  const halfW = playCfg.arenaWidth / 2;
  const halfD = playCfg.arenaDepth / 2;
  const h = playCfg.arenaWallHeight;
  const t = 1;
  const aw = playCfg.arenaWidth;
  const ad = playCfg.arenaDepth;
  const y = h / 2;
  const panelLen = 20;

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

  const vg = visualGaps[edge];
  const pg = physicsGaps[edge];

  if (edge === "south") {
    for (const seg of solidSegmentsAlongWall(aw, vg)) {
      forChunks(seg.start, seg.end, (u, v) => {
        const slen = v - u;
        const cx = -halfW + (u + v) / 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), wallPanel);
        mesh.position.set(cx, h / 2, -halfD - t / 2);
        visGroup.add(mesh);
      });
    }
    for (const seg of solidSegmentsAlongWall(aw, pg)) {
      const s0 = seg.start;
      const s1 = seg.end;
      const hx = (s1 - s0) / 2;
      const cx = -halfW + (s0 + s1) / 2;
      const body = createWallPhysicsBody({
        halfExtents: new Vec3(hx, h / 2, t / 2),
        center: new Vec3(cx, y, -halfD - t / 2),
        wallMatRef: wallMat,
      });
      world.addBody(body);
      bodies.push(body);
    }
  } else if (edge === "north") {
    for (const seg of solidSegmentsAlongWall(aw, vg)) {
      forChunks(seg.start, seg.end, (u, v) => {
        const slen = v - u;
        const cx = -halfW + (u + v) / 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(slen, h, t), wallPanel);
        mesh.position.set(cx, h / 2, halfD + t / 2);
        visGroup.add(mesh);
      });
    }
    for (const seg of solidSegmentsAlongWall(aw, pg)) {
      const s0 = seg.start;
      const s1 = seg.end;
      const hx = (s1 - s0) / 2;
      const cx = -halfW + (s0 + s1) / 2;
      const body = createWallPhysicsBody({
        halfExtents: new Vec3(hx, h / 2, t / 2),
        center: new Vec3(cx, y, halfD + t / 2),
        wallMatRef: wallMat,
      });
      world.addBody(body);
      bodies.push(body);
    }
  } else if (edge === "west") {
    for (const seg of solidSegmentsAlongWall(ad, vg)) {
      forChunks(seg.start, seg.end, (u, v) => {
        const slen = v - u;
        const cz = -halfD + (u + v) / 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), wallPanel);
        mesh.position.set(-halfW - t / 2, h / 2, cz);
        visGroup.add(mesh);
      });
    }
    for (const seg of solidSegmentsAlongWall(ad, pg)) {
      const s0 = seg.start;
      const s1 = seg.end;
      const hz = (s1 - s0) / 2;
      const cz = -halfD + (s0 + s1) / 2;
      const body = createWallPhysicsBody({
        halfExtents: new Vec3(t / 2, h / 2, hz),
        center: new Vec3(-halfW - t / 2, y, cz),
        wallMatRef: wallMat,
      });
      world.addBody(body);
      bodies.push(body);
    }
  } else if (edge === "east") {
    for (const seg of solidSegmentsAlongWall(ad, vg)) {
      forChunks(seg.start, seg.end, (u, v) => {
        const slen = v - u;
        const cz = -halfD + (u + v) / 2;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, h, slen), wallPanel);
        mesh.position.set(halfW + t / 2, h / 2, cz);
        visGroup.add(mesh);
      });
    }
    for (const seg of solidSegmentsAlongWall(ad, pg)) {
      const s0 = seg.start;
      const s1 = seg.end;
      const hz = (s1 - s0) / 2;
      const cz = -halfD + (s0 + s1) / 2;
      const body = createWallPhysicsBody({
        halfExtents: new Vec3(t / 2, h / 2, hz),
        center: new Vec3(halfW + t / 2, y, cz),
        wallMatRef: wallMat,
      });
      world.addBody(body);
      bodies.push(body);
    }
  }
}

/**
 * Unlock the campaign exit gate at runtime (all enemies eliminated or zero-enemy level) and cut wall collision.
 *
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {import('cannon-es').Material} wallMat
 * @returns {null | { edge: import('./gates.js').WallEdge; role: string; locked: boolean; destination?: unknown }}
 */
export function runtimeUnlockCampaignExitGate(scene, world, playCfg, wallMat) {
  const grec = scene.userData.gates;
  if (!grec || !Array.isArray(grec.list)) return null;
  const exit = grec.list.find((x) => x.role === "exit");
  if (!exit || !exit.locked) return null;
  exit.locked = false;
  const visualGaps = openGateGapsByEdge(grec.list, { includeLockedEntrance: true });
  const physicsGaps = openGateGapsByEdge(grec.list, { includeLockedEntrance: false });
  rebuildPerimeterWallEdge(scene, world, playCfg, wallMat, exit.edge, visualGaps, physicsGaps);
  scene.userData.openGateFootprints = computeOpenGateWallFootprints(
    grec.list,
    playCfg.arenaWidth,
    playCfg.arenaDepth,
  );
  return exit;
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
  const visualGaps = openGateGapsByEdge(gates, { includeLockedEntrance: true });
  const physicsGaps = openGateGapsByEdge(gates, { includeLockedEntrance: false });

  const vis = buildArenaVisuals(scene, playCfg, visualGaps);
  const wallBodiesByEdge = buildArenaPhysics(world, wallMat, floorMat, playCfg, physicsGaps);

  /** First entry in `vis.materials` is the arena floor — used for PMREM env (P9.6). */
  scene.userData.arenaFloorMaterial = vis.materials[0];

  scene.userData.tronPerimeter = {
    wallMaterials: vis.wallMaterials,
    edgeVisualGroups: vis.edgeVisualGroups,
    wallBodiesByEdge,
  };

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
 * @returns {Record<PerimeterEdge, import('cannon-es').Body[]>}
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

  /** @type {Record<PerimeterEdge, import('cannon-es').Body[]>} */
  const wallBodiesByEdge = {
    south: [],
    north: [],
    east: [],
    west: [],
  };

  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hx = (s1 - s0) / 2;
    const cx = -halfW + (s0 + s1) / 2;
    const body = createWallPhysicsBody({
      halfExtents: new Vec3(hx, h / 2, t / 2),
      center: new Vec3(cx, y, -halfD - t / 2),
      wallMatRef: wallMat,
    });
    world.addBody(body);
    wallBodiesByEdge.south.push(body);
  }
  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hx = (s1 - s0) / 2;
    const cx = -halfW + (s0 + s1) / 2;
    const body = createWallPhysicsBody({
      halfExtents: new Vec3(hx, h / 2, t / 2),
      center: new Vec3(cx, y, halfD + t / 2),
      wallMatRef: wallMat,
    });
    world.addBody(body);
    wallBodiesByEdge.north.push(body);
  }
  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hz = (s1 - s0) / 2;
    const cz = -halfD + (s0 + s1) / 2;
    const body = createWallPhysicsBody({
      halfExtents: new Vec3(t / 2, h / 2, hz),
      center: new Vec3(-halfW - t / 2, y, cz),
      wallMatRef: wallMat,
    });
    world.addBody(body);
    wallBodiesByEdge.west.push(body);
  }
  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    const s0 = seg.start;
    const s1 = seg.end;
    const hz = (s1 - s0) / 2;
    const cz = -halfD + (s0 + s1) / 2;
    const body = createWallPhysicsBody({
      halfExtents: new Vec3(t / 2, h / 2, hz),
      center: new Vec3(halfW + t / 2, y, cz),
      wallMatRef: wallMat,
    });
    world.addBody(body);
    wallBodiesByEdge.east.push(body);
  }

  return wallBodiesByEdge;
}

/**
 * P9.6 — subtle grid floor reflections via a one-shot PMREM bake (plan § Visual Effects, env map).
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.MeshStandardMaterial} floorMat
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {THREE.Scene | null} [scene] — when set, barrier/building meshes get the same env map (cloned floor mats are created before this runs).
 */
export function applyArenaFloorEnvMap(renderer, floorMat, playCfg, scene = null) {
  if (!renderer || !floorMat || !playCfg) return;
  const devHud = playCfg.devHud ?? {};
  const neon =
    typeof devHud.neonIntensity === "number" && Number.isFinite(devHud.neonIntensity)
      ? devHud.neonIntensity
      : 1;
  /** Tuned subtle: visible neon bounce without mirror-like floor. */
  const envMapIntensity = Math.min(0.48, 0.12 + neon * 0.14);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x02040a);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(22, 36, 18),
    new THREE.MeshStandardMaterial({
      color: 0x050812,
      side: THREE.BackSide,
      metalness: 0.08,
      roughness: 0.92,
    }),
  );
  envScene.add(dome);

  const lineCol = new THREE.Color(playCfg.colors?.gridLine ?? 0x00e8ff);
  const warmCol = new THREE.Color(0xff6600);
  for (let i = 0; i < 8; i++) {
    const em = i % 2 === 0 ? lineCol : warmCol;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 6, 32),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: em,
        emissiveIntensity: 2.0 + neon * 0.35,
        metalness: 0.15,
        roughness: 0.45,
      }),
    );
    const ang = (i / 8) * Math.PI * 2;
    strip.position.set(Math.cos(ang) * 15, 1.5, Math.sin(ang) * 15);
    strip.lookAt(0, 1.5, 0);
    envScene.add(strip);
  }

  const k1 = new THREE.PointLight(lineCol, 260, 0, 2);
  k1.position.set(14, 10, 12);
  envScene.add(k1);
  const k2 = new THREE.PointLight(warmCol, 140, 0, 2);
  k2.position.set(-16, 6, -10);
  envScene.add(k2);

  const rt = pmrem.fromScene(envScene, 0.1);
  floorMat.envMap = rt.texture;
  floorMat.envMapIntensity = envMapIntensity;
  floorMat.metalness = Math.min(0.26, floorMat.metalness + 0.08);
  floorMat.roughness = Math.max(0.72, floorMat.roughness - 0.06);
  floorMat.needsUpdate = true;

  const barriers = scene?.userData?.barriersGroup;
  if (barriers) {
    barriers.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && "envMap" in m) {
          m.envMap = rt.texture;
          m.needsUpdate = true;
        }
      }
    });
  }

  pmrem.dispose();
  /** Keep `rt` alive — `floorMat.envMap` references its texture. */
  for (const ch of [...envScene.children]) {
    envScene.remove(ch);
    if (ch instanceof THREE.Mesh) {
      ch.geometry?.dispose();
      const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of mats) m?.dispose();
    }
  }
}

/** After BOOT tunnel: hide tunnel mesh, switch fog/camera, add arena lighting. */
export function applyArenaStageEnvironment(game, cfg) {
  const { scene, camera, tunnel, floorReflector } = game;
  tunnel.visible = false;
  if (floorReflector) floorReflector.visible = false;
  /** Deep blue-black — plan palette (#0a0a0a family) with slight ISO depth. */
  scene.background = new THREE.Color(0x06080f);
  /** Same exponential fog as BOOT/renderer so `fogDensity` in Dev HUD applies during play. */
  const fogDensity =
    typeof cfg.devHud?.fogDensity === "number" && Number.isFinite(cfg.devHud.fogDensity)
      ? cfg.devHud.fogDensity
      : 0.01;
  scene.fog = new THREE.FogExp2(0x050510, fogDensity);
  camera.near = 0.1;
  camera.far = 2000;
  camera.position.set(0, 120, 180);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  const hemi = new THREE.HemisphereLight(cfg.colors.ambient, 0x03060c, 0.62);
  const sun = new THREE.DirectionalLight(0xffffff, 0.95);
  sun.position.set(60, 120, 40);
  const fill = new THREE.DirectionalLight(0x00ccff, 0.42);
  fill.position.set(-80, 40, -60);
  /** Soft overhead cyan wash — extra read on emissive walls (distance 0 = no falloff cap). */
  const gridWash = new THREE.PointLight(0x66ddff, 0.42, 0, 2);
  gridWash.position.set(0, 110, 0);
  scene.add(hemi, sun, fill, gridWash);
}
