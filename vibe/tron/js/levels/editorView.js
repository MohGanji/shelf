/**
 * P6.1 — Level editor viewport: orthographic birds-eye camera, pan (middle-drag), zoom (wheel),
 * Grid on the XZ plane — spacing from dev HUD `floorGridLineStep` (plan Phase 6).
 */

import * as THREE from "../vendor/three-module.js";

import { WORLD } from "../config.js";

/** Align with campaign palette (`config.js` gridLine / gridFloor family). */
const GRID_MAIN = 0x00e8ff;
const GRID_SEC = 0x1a2a44;
const FLOOR_COLOR = 0x020611;

/**
 * @param {{ renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement; arenaWidth?: number; arenaDepth?: number; mapWidth?: number; mapDepth?: number; devHud?: Partial<import("../config.js").DEFAULT_DEV_HUD> }} opts
 * @returns {{
 *   dispose(): void;
 *   scene: THREE.Scene;
 *   camera: THREE.OrthographicCamera;
 *   renderer: THREE.WebGLRenderer;
 *   canvas: HTMLCanvasElement;
 *   arenaWidth: number;
 *   arenaDepth: number;
 *   mapWidth: number;
 *   mapDepth: number;
 *   screenToGround: (sx: number, sy: number) => THREE.Vector3;
 *   panByScreenDelta: (fromX: number, fromY: number, toX: number, toY: number) => void;
 * }}
 */
export function mountEditorOrthographicViewport(opts) {
  const { renderer, canvas } = opts;
  const arenaWidth =
    typeof opts.arenaWidth === "number" && opts.arenaWidth >= WORLD.minimumArenaSize
      ? opts.arenaWidth
      : 80;
  const arenaDepth =
    typeof opts.arenaDepth === "number" && opts.arenaDepth >= WORLD.minimumArenaSize
      ? opts.arenaDepth
      : 80;
  const mapWidth =
    typeof opts.mapWidth === "number" && opts.mapWidth >= arenaWidth + 2
      ? opts.mapWidth
      : arenaWidth + 2;
  const mapDepth =
    typeof opts.mapDepth === "number" && opts.mapDepth >= arenaDepth + 2
      ? opts.mapDepth
      : arenaDepth + 2;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const ambient = new THREE.AmbientLight(0x6688aa, 0.85);
  scene.add(ambient);

  const extent = Math.max(mapWidth, mapDepth, WORLD.minimumArenaSize);
  const halfW = mapWidth / 2;
  const halfD = mapDepth / 2;
  const innerW = Math.max(1, mapWidth - 2);
  const innerD = Math.max(1, mapDepth - 2);

  const floorGeom = new THREE.PlaneGeometry(mapWidth, mapDepth);
  const floorMat = new THREE.MeshBasicMaterial({
    color: FLOOR_COLOR,
    transparent: true,
    opacity: 0.96,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, 0);
  scene.add(floor);

  const interiorGeom = new THREE.PlaneGeometry(innerW, innerD);
  const interiorMat = new THREE.MeshBasicMaterial({
    color: 0x101a2a,
    transparent: true,
    opacity: 0.86,
    depthWrite: true,
  });
  const interior = new THREE.Mesh(interiorGeom, interiorMat);
  interior.rotation.x = -Math.PI / 2;
  interior.position.set(0, 0, 0);
  scene.add(interior);

  /** @type {THREE.Mesh[]} */
  const wallStrips = [];
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0x003044,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  for (const [w, d, x, z] of [
    [mapWidth, 1, 0, -halfD + 0.5],
    [mapWidth, 1, 0, halfD - 0.5],
    [1, innerD, -halfW + 0.5, 0],
    [1, innerD, halfW - 0.5, 0],
  ]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), wallMat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.004, z);
    wallStrips.push(strip);
    scene.add(strip);
  }

  const gridStep = 1;
  const gridPositions = [];
  for (let gx = 0; gx <= mapWidth; gx += gridStep) {
    const x = -halfW + gx;
    gridPositions.push(x, 0.012, -halfD, x, 0.012, halfD);
  }
  for (let gz = 0; gz <= mapDepth; gz += gridStep) {
    const z = -halfD + gz;
    gridPositions.push(-halfW, 0.012, z, halfW, 0.012, z);
  }
  const gridGeom = new THREE.BufferGeometry();
  gridGeom.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: GRID_SEC, transparent: true, opacity: 0.58 });
  const grid = new THREE.LineSegments(gridGeom, gridMat);
  scene.add(grid);

  const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(mapWidth, mapDepth));
  const edgeMat = new THREE.LineBasicMaterial({ color: GRID_MAIN, transparent: true, opacity: 0.9 });
  const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
  edgeLines.rotation.x = -Math.PI / 2;
  edgeLines.position.set(0, 0.002, 0);
  scene.add(edgeLines);

  const interiorEdgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(innerW, innerD));
  const interiorEdgeMat = new THREE.LineBasicMaterial({ color: 0x33ddff, transparent: true, opacity: 0.42 });
  const interiorEdgeLines = new THREE.LineSegments(interiorEdgeGeom, interiorEdgeMat);
  interiorEdgeLines.rotation.x = -Math.PI / 2;
  interiorEdgeLines.position.set(0, 0.018, 0);
  scene.add(interiorEdgeLines);

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const hitLast = new THREE.Vector3();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  // Match the HUD minimap: +Z is up/north and X is mirrored horizontally.
  camera.up.set(0, 0, 1);

  /** Half-height of ortho frustum at the ground (world Y=0); smaller = zoomed in. */
  let viewHalfHeight = Math.max(halfW, halfD) * 0.72;
  const minHalf = Math.max(8, Math.min(halfW, halfD) * 0.08);
  const maxHalf = Math.max(halfW, halfD) * 4;

  let panX = 0;
  let panZ = 0;
  const camHeight = 120;

  function applyFrustum() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = Math.max(canvas.clientHeight || window.innerHeight, 1);
    const aspect = w / h;
    const hh = viewHalfHeight;
    const hw = hh * aspect;
    camera.left = -hw;
    camera.right = hw;
    camera.top = hh;
    camera.bottom = -hh;
    camera.position.set(panX, camHeight, panZ);
    camera.lookAt(panX, 0, panZ);
    camera.updateProjectionMatrix();
  }

  function syncRendererSize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = Math.max(canvas.clientHeight || window.innerHeight, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    applyFrustum();
  }

  function screenToGround(sx, sy) {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    ndc.x = (sx / w) * 2 - 1;
    ndc.y = -(sy / h) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(groundPlane, hit);
    return hit;
  }

  function panByScreenDelta(fromX, fromY, toX, toY) {
    const from = screenToGround(fromX, fromY).clone();
    const to = screenToGround(toX, toY).clone();
    panX -= to.x - from.x;
    panZ -= to.z - from.z;
    applyFrustum();
  }

  /** @type {number | null} */
  let panPointerId = null;
  let isPanning = false;

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    isPanning = true;
    panPointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    screenToGround(e.clientX, e.clientY);
    hitLast.copy(hit);
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!isPanning || e.pointerId !== panPointerId) return;
    e.preventDefault();
    screenToGround(e.clientX, e.clientY);
    const dx = hit.x - hitLast.x;
    const dz = hit.z - hitLast.z;
    panX -= dx;
    panZ -= dz;
    hitLast.copy(hit);
    applyFrustum();
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (e.pointerId !== panPointerId) return;
    isPanning = false;
    panPointerId = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY;
    const factor = Math.exp(delta * 0.0012);
    viewHalfHeight = THREE.MathUtils.clamp(viewHalfHeight * factor, minHalf, maxHalf);
    applyFrustum();
  }

  function onResize() {
    syncRendererSize();
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", onResize);

  syncRendererSize();

  let rafId = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);
    renderer.render(scene, camera);
  }
  tick();

  return {
    scene,
    camera,
    renderer,
    canvas,
    arenaWidth,
    arenaDepth,
    mapWidth,
    mapDepth,
    screenToGround,
    panByScreenDelta,
    dispose() {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      floorGeom.dispose();
      floorMat.dispose();
      interiorGeom.dispose();
      interiorMat.dispose();
      for (const strip of wallStrips) strip.geometry.dispose();
      wallMat.dispose();
      grid.geometry.dispose();
      gridMat.dispose();
      edgeGeom.dispose();
      edgeMat.dispose();
      interiorEdgeGeom.dispose();
      interiorEdgeMat.dispose();
    },
  };
}
