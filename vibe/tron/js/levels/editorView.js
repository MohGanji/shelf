/**
 * P6.1 — Level editor viewport: orthographic birds-eye camera, pan (middle-drag), zoom (wheel),
 * 1-unit grid on the XZ plane (plan Phase 6).
 */

import * as THREE from "three";

import { WORLD } from "../config.js";

const GRID_MAIN = 0x00a8c8;
const GRID_SEC = 0x1a2a44;
const FLOOR_COLOR = 0x0c1018;

/**
 * @param {{ renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement; arenaWidth?: number; arenaDepth?: number }} opts
 * @returns {{ dispose(): void }}
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const ambient = new THREE.AmbientLight(0x6688aa, 0.85);
  scene.add(ambient);

  const extent = Math.max(arenaWidth, arenaDepth, WORLD.minimumArenaSize);
  const halfW = arenaWidth / 2;
  const halfD = arenaDepth / 2;

  const floorGeom = new THREE.PlaneGeometry(arenaWidth, arenaDepth);
  const floorMat = new THREE.MeshBasicMaterial({
    color: FLOOR_COLOR,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.001, 0);
  scene.add(floor);

  const grid = new THREE.GridHelper(extent, extent, GRID_MAIN, GRID_SEC);
  grid.position.y = 0;
  const gridMat = grid.material;
  if (Array.isArray(gridMat)) {
    for (const m of gridMat) {
      m.transparent = true;
      m.opacity = 0.55;
    }
  } else {
    gridMat.transparent = true;
    gridMat.opacity = 0.55;
  }
  scene.add(grid);

  const edgeGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(arenaWidth, arenaDepth));
  const edgeMat = new THREE.LineBasicMaterial({ color: GRID_MAIN, transparent: true, opacity: 0.9 });
  const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
  edgeLines.rotation.x = -Math.PI / 2;
  edgeLines.position.set(0, 0.002, 0);
  scene.add(edgeLines);

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const hitLast = new THREE.Vector3();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  camera.up.set(0, 0, -1);

  /** Half-height of ortho frustum at the ground (world Y=0); smaller = zoomed in. */
  let viewHalfHeight = Math.max(halfW, halfD) * 0.65;
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
      grid.geometry.dispose();
      const gm = grid.material;
      if (Array.isArray(gm)) gm.forEach((m) => m.dispose());
      else gm.dispose();
      edgeGeom.dispose();
      edgeMat.dispose();
    },
  };
}
