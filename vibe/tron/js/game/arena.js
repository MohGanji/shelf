import * as THREE from "three";
import { Vec3 } from "cannon-es";
import { createFloorBody, createWallPhysicsBody } from "../engine/physics.js";

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
 */
export function buildArenaVisuals(scene, cfg) {
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

  function addStripWE(xSign) {
    const segments = Math.ceil(cfg.arenaDepth / panelLen);
    const segSize = cfg.arenaDepth / segments;
    const cx = xSign * (halfW + t / 2);
    for (let i = 0; i < segments; i++) {
      const mat = i % 2 === 0 ? matA : matB;
      const geo = new THREE.BoxGeometry(t, h, segSize);
      const mesh = new THREE.Mesh(geo, mat);
      const z = -halfD + segSize * (i + 0.5);
      mesh.position.set(cx, h / 2, z);
      group.add(mesh);
    }
  }

  function addStripNS(zSign) {
    const segments = Math.ceil(cfg.arenaWidth / panelLen);
    const segSize = cfg.arenaWidth / segments;
    const cz = zSign * (halfD + t / 2);
    for (let i = 0; i < segments; i++) {
      const mat = i % 2 === 0 ? matB : matA;
      const geo = new THREE.BoxGeometry(segSize, h, t);
      const mesh = new THREE.Mesh(geo, mat);
      const x = -halfW + segSize * (i + 0.5);
      mesh.position.set(x, h / 2, cz);
      group.add(mesh);
    }
  }

  addStripWE(-1);
  addStripWE(1);
  addStripNS(-1);
  addStripNS(1);

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
 * `getArenaPlaytestConfig` + `extractArenaDimensionsFromLevel`). Barriers, gates, interior objects — P5.4+.
 *
 * @param {import('three').Scene} scene
 * @param {import('cannon-es').World} world
 * @param {import('cannon-es').Material} wallMat
 * @param {import('cannon-es').Material} floorMat
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @param {Record<string, unknown> | null} [level] — validated campaign level; attached to `scene.userData.campaignLevel`
 */
export function buildArenaFromCampaignLevel(scene, world, wallMat, floorMat, playCfg, level = null) {
  buildArenaVisuals(scene, playCfg);
  buildArenaPhysics(world, wallMat, floorMat, playCfg);
  if (level && typeof level === "object" && typeof level.id === "string") {
    scene.userData.campaignLevel = {
      id: level.id,
      name: typeof level.name === "string" ? level.name : level.id,
    };
  } else {
    delete scene.userData.campaignLevel;
  }
}

/** cannon-es static bodies for floor + four perimeter walls (aligned with visuals). */
export function buildArenaPhysics(world, wallMat, floorMat, cfg) {
  const halfW = cfg.arenaWidth / 2;
  const halfD = cfg.arenaDepth / 2;
  const h = cfg.arenaWallHeight;
  const t = 1;

  const floor = createFloorBody(cfg, floorMat);
  world.addBody(floor);

  const y = h / 2;
  const heW = new Vec3(t / 2, h / 2, halfD + t / 2);
  const heN = new Vec3(halfW + t / 2, h / 2, t / 2);

  world.addBody(
    createWallPhysicsBody({
      halfExtents: heW,
      center: new Vec3(-halfW - t / 2, y, 0),
      wallMatRef: wallMat,
    }),
  );
  world.addBody(
    createWallPhysicsBody({
      halfExtents: heW,
      center: new Vec3(halfW + t / 2, y, 0),
      wallMatRef: wallMat,
    }),
  );
  world.addBody(
    createWallPhysicsBody({
      halfExtents: heN,
      center: new Vec3(0, y, -halfD - t / 2),
      wallMatRef: wallMat,
    }),
  );
  world.addBody(
    createWallPhysicsBody({
      halfExtents: heN,
      center: new Vec3(0, y, halfD + t / 2),
      wallMatRef: wallMat,
    }),
  );
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
