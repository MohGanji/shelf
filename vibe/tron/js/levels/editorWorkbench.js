/**
 * P6.3 — Editor placement: palette click-to-place, select, move,
 * gate drag along walls, portal pair flow, gate clear-zone blocking, hover preview.
 */

import * as THREE from "../vendor/three-module.js";

import { GATE_WIDTH } from "./schema.js";
import { upsertWipLevel } from "./loader.js";
import {
  collectGateClearTileKeys,
  collectOccupiedFloorTileKeys,
  countDistinctPortalPairs,
  findIncompletePortalPairId,
  PORTAL_PAIR_COLORS,
  setEditorObjectPlacement,
  snapAuthoringCell,
} from "./editorLevel.js";
import {
  floorObjectInsideAuthoringBounds,
  floorObjectOccupiedCells,
  getFloorObjectFootprint,
  getFloorObjectTopLeft,
  getFloorObjectWorldCenter,
  gridTopLeftToWorldCenter,
  resolveTriangleBuildingRotationY,
} from "./footprints.js";

/**
 * @typedef {{
 *   type: "floor";
 *   list: "barriers" | "gameObjects" | "powerups" | "enemies";
 *   index: number;
 *   x?: number;
 *   z?: number;
 * }} FloorPick
 *
 * @typedef {{ type: "gate"; index: number }} GatePick
 *
 * @typedef {FloorPick | GatePick} EditorPick
 */

/** @param {unknown} h @param {number} fallback */
function parseOptionalHexColor(h, fallback) {
  if (typeof h !== "string" || !/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(h)) return fallback;
  const n = parseInt(h.slice(1), 16);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Right-triangle prism matching runtime triangle buildings: right angle in the
 * local southwest footprint corner before quarter-turn rotation.
 *
 * @param {number} w
 * @param {number} d
 * @param {number} h
 */
function createRightTrianglePrismGeometry(w, d, h) {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const A = [x0, y0, z0];
  const B = [x1, y0, z0];
  const C = [x0, y0, z1];
  const D = [x0, y1, z0];
  const E = [x1, y1, z0];
  const F = [x0, y1, z1];
  /** @type {number[]} */
  const verts = [];

  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {number[]} c
   */
  function tri(a, b, c) {
    verts.push(...a, ...b, ...c);
  }

  /**
   * @param {number[]} a
   * @param {number[]} b
   * @param {number[]} c
   * @param {number[]} d0
   */
  function quad(a, b, c, d0) {
    tri(a, b, c);
    tri(a, c, d0);
  }

  tri(A, C, B);
  tri(D, F, E);
  quad(A, D, E, B);
  quad(A, C, F, D);
  quad(B, E, F, C);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * @param {string} edge
 * @param {number} position
 * @param {number} aw
 * @param {number} ad
 */
function clampGatePosition(edge, position, aw, ad) {
  const w = GATE_WIDTH;
  const wallLen = edge === "north" || edge === "south" ? aw : ad;
  const half = w / 2;
  return Math.max(half, Math.min(wallLen - half, position));
}

/**
 * @param {import("three").Group} group
 */
function disposeGroupChildren(group) {
  const ch = [...group.children];
  for (const o of ch) {
    group.remove(o);
    o.traverse((x) => {
      if (x instanceof THREE.Mesh) {
        x.geometry?.dispose();
        const m = x.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m?.dispose();
      }
    });
  }
}

/**
 * @param {{
 *   viewport: {
 *     scene: THREE.Scene;
 *     camera: THREE.OrthographicCamera;
 *     canvas: HTMLCanvasElement;
 *     arenaWidth: number;
 *     arenaDepth: number;
 *     screenToGround: (sx: number, sy: number) => THREE.Vector3;
 *     panByScreenDelta?: (fromX: number, fromY: number, toX: number, toY: number) => void;
 *   };
 *   getPaletteSelection: () => unknown;
 *   level: Record<string, unknown>;
 *   onPersist?: (level: Record<string, unknown>) => void;
 *   onSelectionChange?: (sel: EditorPick | null) => void;
 *   onStatusChange?: (msg: string) => void;
 *   beforeMutation?: () => void;
 * }} opts
 * @returns {{ dispose(): void; refresh(): void; refreshVisual(): void; getSelection: () => EditorPick | null; clearSelection(): void; deleteSelection(): void; canPlaceSelectionDraft(draft: Record<string, unknown>): boolean }}
 */
export function mountEditorWorkbench(opts) {
  const { viewport, getPaletteSelection, level } = opts;
  const onPersist = opts.onPersist ?? ((L) => upsertWipLevel(L));
  const onSelectionChange = opts.onSelectionChange;
  const onStatusChange = opts.onStatusChange;
  const beforeMutation = opts.beforeMutation;

  const scene = viewport.scene;
  const canvas = viewport.canvas;
  const camera = viewport.camera;

  const contentRoot = new THREE.Group();
  contentRoot.name = "editor-workbench-content";
  scene.add(contentRoot);

  const floorRoot = new THREE.Group();
  floorRoot.name = "editor-floor-objects";
  contentRoot.add(floorRoot);

  const clearZoneRoot = new THREE.Group();
  clearZoneRoot.name = "editor-gate-clear-zones";
  contentRoot.add(clearZoneRoot);

  const ghost = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.08, 0.92),
    new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  ghost.visible = false;
  ghost.position.y = 0.12;
  ghost.raycast = () => {};
  contentRoot.add(ghost);

  /** @type {EditorPick | null} */
  let selection = null;

  /**
   * @param {EditorPick | null} next
   */
  function setSelection(next) {
    selection = next;
    onSelectionChange?.(selection);
    rebuild();
  }

  /** Rebuild 3D + persist (e.g. property edits) without re-running selection hooks — keeps the properties panel from full DOM re-sync. */
  function refreshVisual() {
    rebuild();
    schedulePersist();
  }

  function refresh() {
    rebuild();
    schedulePersist();
    onSelectionChange?.(selection);
  }

  function getSelection() {
    return selection;
  }

  /** @param {Record<string, unknown>} draft */
  function canPlaceSelectionDraft(draft) {
    if (!selection || selection.type !== "floor") return false;
    const pos = getFloorObjectTopLeft(level, selection.list, draft);
    return canPlaceObjectAt(selection.list, draft, pos.gridX, pos.gridZ, selection);
  }

  /** @type {EditorPick | null} */
  let dragFloor = null;
  /** @type {{ pick: FloorPick; pointerId: number; startX: number; startY: number; active: boolean; altKey: boolean } | null} */
  let pendingFloorDrag = null;
  /** @type {{ index: number; edge: string; startPos: number; startClient: number } | null */
  let gateDrag = null;
  /** @type {{ pick: GatePick; pointerId: number; startX: number; startY: number; active: boolean } | null} */
  let pendingGateDrag = null;
  /** @type {{ pointerId: number; lastX: number; lastY: number; moved: boolean } | null} */
  let canvasPan = null;

  /** @type {number | null} */
  let persistTimer = null;

  function schedulePersist() {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      onPersist(level);
    }, 280);
  }

  function aw() {
    return typeof level.arenaWidth === "number" ? level.arenaWidth : viewport.arenaWidth;
  }
  function ad() {
    return typeof level.arenaDepth === "number" ? level.arenaDepth : viewport.arenaDepth;
  }

  function occupiedExcluding(exclude) {
    const occ = collectOccupiedFloorTileKeys(level);
    if (exclude && exclude.type === "floor") {
      const arr = level[exclude.list];
      if (Array.isArray(arr) && arr[exclude.index]) {
        const o = arr[exclude.index];
        if (o && typeof o === "object") {
          for (const cell of floorObjectOccupiedCells(level, exclude.list, /** @type {Record<string, unknown>} */ (o))) {
            occ.delete(cell);
          }
        }
      }
    }
    return occ;
  }

  function canPlaceObjectAt(list, obj, ix, iz, excludeOccupant) {
    const test = { ...obj };
    setEditorObjectPlacement(level, list, test, ix, iz);
    if (!floorObjectInsideAuthoringBounds(level, list, test)) return false;
    const clear = collectGateClearTileKeys(
      Array.isArray(level.wallObjects) ? level.wallObjects : [],
      aw(),
      ad(),
    );
    for (const k of floorObjectOccupiedCells(level, list, test)) {
      if (clear.has(k)) return false;
      const [gx, gz] = k.split(",").map(Number);
      const c = gridTopLeftToWorldCenter(level, gx, gz, 1, 1);
      if (clear.has(`${Math.round(c.x)},${Math.round(c.z)}`)) return false;
    }
    const occ = occupiedExcluding(excludeOccupant);
    for (const k of floorObjectOccupiedCells(level, list, test)) {
      if (occ.has(k)) return false;
    }
    return true;
  }

  /**
   * ⌥/Alt+drag: duplicate a floor object at the same cell (source excluded from collision), then drag the copy.
   * Portals get a new pair or join an incomplete pair, same rules as palette placement.
   *
   * @param {FloorPick} sourcePick
   * @returns {FloorPick | null} pick for the new instance, or null (e.g. max portal pairs)
   */
  function cloneFloorObjectAtSource(sourcePick) {
    const { list, index } = sourcePick;
    const arr = level[list];
    if (!Array.isArray(arr) || !arr[index]) return null;
    const src = /** @type {Record<string, unknown>} */ (arr[index]);
    /** @type {Record<string, unknown>} */
    let draft;
    if (list === "gameObjects" && src.type === "portal") {
      const incomplete = findIncompletePortalPairId(level);
      draft = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(src)));
      if (incomplete) {
        draft.pairId = incomplete;
        draft.pairColor = findPairColorForId(level, incomplete) ?? PORTAL_PAIR_COLORS[0];
      } else {
        const n = countDistinctPortalPairs(level);
        if (n >= PORTAL_PAIR_COLORS.length) return null;
        draft.pairId = `p-${Date.now().toString(36)}`;
        draft.pairColor = PORTAL_PAIR_COLORS[n];
      }
    } else {
      draft = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(src)));
    }
    const pos = getFloorObjectTopLeft(level, list, src);
    if (!canPlaceObjectAt(list, draft, pos.gridX, pos.gridZ, sourcePick)) return null;
    arr.push(draft);
    setEditorObjectPlacement(level, list, draft, pos.gridX, pos.gridZ);
    return /** @type {FloorPick} */ ({ type: "floor", list, index: arr.length - 1 });
  }

  /** @param {EditorPick | null} a @param {EditorPick | null} b */
  function samePick(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === "gate" && b.type === "gate") return a.index === b.index;
    return a.type === "floor" && b.type === "floor" && a.list === b.list && a.index === b.index;
  }

  function rebuild() {
    disposeGroupChildren(floorRoot);
    disposeGroupChildren(clearZoneRoot);

    const c = collectGateClearTileKeys(
      Array.isArray(level.wallObjects) ? level.wallObjects : [],
      aw(),
      ad(),
    );
    for (const key of c) {
      const [ix, iz] = key.split(",").map(Number);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.98), mat);
      m.position.set(ix, 0.08, iz);
      m.userData.skipPick = true;
      m.raycast = () => {};
      clearZoneRoot.add(m);
    }

    const barriers = level.barriers;
    if (Array.isArray(barriers)) {
      for (let i = 0; i < barriers.length; i++) {
        const b = barriers[i];
        if (!b || typeof b !== "object") continue;
        const o = /** @type {Record<string, unknown>} */ (b);
        const t = o.type;
        const c = getFloorObjectWorldCenter(level, "barriers", o);
        const fp = getFloorObjectFootprint("barriers", o);
        const x = c.x;
        const z = c.z;
        if (typeof t !== "string" || typeof x !== "number" || typeof z !== "number") continue;
        let mesh;
        let color = parseOptionalHexColor(o.color, 0x4488cc);
        let h = 0.55;
        if (t === "wall") {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(0.2, fp.width - 0.04), 0.65, Math.max(0.2, fp.depth - 0.04)),
            new THREE.MeshStandardMaterial({ color, emissive: 0x002244, emissiveIntensity: 0.35 }),
          );
          mesh.position.set(x, 0.35, z);
        } else if (t === "building") {
          h = typeof o.height === "number" ? Math.max(1, Math.min(5, o.height)) : 2;
          color = parseOptionalHexColor(o.color, 0x3366aa);
          const geo =
            fp.shape === "triangle"
              ? createRightTrianglePrismGeometry(Math.max(0.2, fp.width - 0.08), Math.max(0.2, fp.depth - 0.08), h)
              : new THREE.BoxGeometry(Math.max(0.2, fp.width - 0.08), h, Math.max(0.2, fp.depth - 0.08));
          mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({ color, emissive: 0x001844, emissiveIntensity: 0.4 }),
          );
          mesh.position.set(x, h / 2, z);
          mesh.rotation.y =
            fp.shape === "triangle"
              ? resolveTriangleBuildingRotationY(/** @type {Record<string, unknown>} */ (o))
              : 0;
        } else {
          color = parseOptionalHexColor(o.color, 0x5566aa);
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(Math.min(fp.width, fp.depth) * 0.25, Math.min(fp.width, fp.depth) * 0.25, 1.1, 10),
            new THREE.MeshStandardMaterial({ color, emissive: 0x001a44, emissiveIntensity: 0.35 }),
          );
          mesh.position.set(x, 0.55, z);
        }
        mesh.userData.editorPick = /** @type {FloorPick} */ ({
          type: "floor",
          list: "barriers",
          index: i,
        });
        const sel =
          selection && selection.type === "floor" && selection.list === "barriers" && selection.index === i;
        if (sel) mesh.scale.multiplyScalar(1.06);
        floorRoot.add(mesh);
      }
    }

    const gameObjects = level.gameObjects;
    if (Array.isArray(gameObjects)) {
      for (let i = 0; i < gameObjects.length; i++) {
        const g = gameObjects[i];
        if (!g || typeof g !== "object") continue;
        const o = /** @type {Record<string, unknown>} */ (g);
        const typ = o.type;
        const c = getFloorObjectWorldCenter(level, "gameObjects", o);
        const fp = getFloorObjectFootprint("gameObjects", o);
        const x = c.x;
        const z = c.z;
        if (typeof typ !== "string" || typeof x !== "number" || typeof z !== "number") continue;
        let mesh;
        if (typ === "boost_pad") {
          const color = parseOptionalHexColor(o.color, 0xffcc44);
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(Math.max(0.2, fp.width - 0.12), 0.06, Math.max(0.2, fp.depth - 0.12)),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
          );
          mesh.position.set(x, 0.08, z);
        } else {
          const col = typeof o.pairColor === "string" ? o.pairColor : "#FF00FF";
          const c = new THREE.Color(col);
          mesh = new THREE.Mesh(
            new THREE.TorusGeometry(0.38, 0.1, 10, 24),
            new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55 }),
          );
          mesh.position.set(x, 0.45, z);
          mesh.rotation.x = Math.PI / 2;
        }
        mesh.userData.editorPick = /** @type {FloorPick} */ ({
          type: "floor",
          list: "gameObjects",
          index: i,
        });
        const sel =
          selection &&
          selection.type === "floor" &&
          selection.list === "gameObjects" &&
          selection.index === i;
        if (sel) mesh.scale.multiplyScalar(1.08);
        floorRoot.add(mesh);
      }
    }

    const powerups = level.powerups;
    if (Array.isArray(powerups)) {
      for (let i = 0; i < powerups.length; i++) {
        const p = powerups[i];
        if (!p || typeof p !== "object") continue;
        const o = /** @type {Record<string, unknown>} */ (p);
        const cat = o.category;
        const c = getFloorObjectWorldCenter(level, "powerups", o);
        const x = c.x;
        const z = c.z;
        if (typeof x !== "number" || typeof z !== "number") continue;
        let col = 0x00ff66;
        if (cat === "level_permanent") col = 0x0088ff;
        if (cat === "equippable") col = 0xcc00ff;
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.38, 0),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45 }),
        );
        mesh.position.set(x, 0.42, z);
        mesh.userData.editorPick = /** @type {FloorPick} */ ({
          type: "floor",
          list: "powerups",
          index: i,
        });
        const sel =
          selection &&
          selection.type === "floor" &&
          selection.list === "powerups" &&
          selection.index === i;
        if (sel) mesh.scale.multiplyScalar(1.1);
        floorRoot.add(mesh);
      }
    }

    const enemies = level.enemies;
    if (Array.isArray(enemies)) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || typeof e !== "object") continue;
        const o = /** @type {Record<string, unknown>} */ (e);
        const c = getFloorObjectWorldCenter(level, "enemies", o);
        const x = c.x;
        const z = c.z;
        if (typeof x !== "number" || typeof z !== "number") continue;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.2, 0.85),
          new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0x882200, emissiveIntensity: 0.45 }),
        );
        mesh.position.set(x, 0.2, z);
        const rot = typeof o.rotation === "number" ? o.rotation : 0;
        mesh.rotation.y = rot;
        mesh.userData.editorPick = /** @type {FloorPick} */ ({ type: "floor", list: "enemies", index: i });
        const sel =
          selection && selection.type === "floor" && selection.list === "enemies" && selection.index === i;
        if (sel) mesh.scale.multiplyScalar(1.08);
        floorRoot.add(mesh);
      }
    }

    const wallObjects = level.wallObjects;
    if (Array.isArray(wallObjects)) {
      for (let i = 0; i < wallObjects.length; i++) {
        const wo = wallObjects[i];
        if (!wo || typeof wo !== "object") continue;
        const o = /** @type {Record<string, unknown>} */ (wo);
        if (o.type !== "gate") continue;
        const edge = o.edge;
        const pos = o.position;
        if (typeof edge !== "string" || typeof pos !== "number") continue;
        const halfW = aw() / 2;
        const halfD = ad() / 2;
        let gx = 0;
        let gz = 0;
        const w = GATE_WIDTH;
        switch (edge) {
          case "south":
            gx = -halfW + pos;
            gz = -halfD;
            break;
          case "north":
            gx = -halfW + pos;
            gz = halfD;
            break;
          case "west":
            gx = -halfW;
            gz = -halfD + pos;
            break;
          case "east":
            gx = halfW;
            gz = -halfD + pos;
            break;
          default:
            continue;
        }
        const grp = new THREE.Group();
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 1.2, 0.25),
          new THREE.MeshStandardMaterial({ color: 0x00eeff, emissive: 0x004455, emissiveIntensity: 0.5 }),
        );
        pillar.position.y = 0.65;
        grp.add(pillar);
        grp.position.set(gx, 0, gz);
        grp.userData.editorPick = /** @type {GatePick} */ ({ type: "gate", index: i });
        grp.userData.editorGateMeta = { edge, position: pos };
        const sel = selection && selection.type === "gate" && selection.index === i;
        if (sel) grp.scale.multiplyScalar(1.12);
        floorRoot.add(grp);
      }
    }
  }

  function pickFromRaycast(clientX, clientY) {
    const v = viewport.screenToGround(clientX, clientY);
    const rc = new THREE.Raycaster();
    const w = canvas.clientWidth || 1;
    const h = Math.max(canvas.clientHeight || window.innerHeight, 1);
    const ndc = new THREE.Vector2((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    rc.setFromCamera(ndc, camera);
    const hits = rc.intersectObjects([floorRoot], true);
    for (const hhit of hits) {
      let o = hhit.object;
      while (o && !o.userData.editorPick) {
        o = o.parent;
      }
      if (o && o.userData.editorPick) {
        const pick = /** @type {EditorPick} */ (o.userData.editorPick);
        if (pick.type === "floor") {
          return { ...pick, x: v.x, z: v.z };
        }
        return pick;
      }
    }
    return { type: "ground", x: v.x, z: v.z };
  }

  function deleteSelection() {
    if (!selection) return;
    if (selection.type === "gate") return;
    const arr = level[selection.list];
    if (!Array.isArray(arr)) return;
    if (selection.index < 0 || selection.index >= arr.length) return;
    beforeMutation?.();
    arr.splice(selection.index, 1);
    setSelection(null);
    onStatusChange?.("Object deleted.");
    schedulePersist();
  }

  function paletteObjectPreview(sel) {
    if (!sel) return null;
    if (sel.category === "barrier") {
      if (sel.kind === "wall") return { list: "barriers", obj: { type: "wall" } };
      if (sel.kind === "building") {
        const shape =
          sel.meta && typeof sel.meta === "object" && sel.meta.shape === "triangle"
              ? "triangle"
              : "square";
        return {
          list: "barriers",
          obj:
            shape === "triangle"
              ? { type: "building", height: 2, shape, width: 10, depth: 10, triangleQuarter: 0, rotation: 0 }
              : { type: "building", height: 2, shape, width: 10, depth: 10 },
        };
      }
      if (sel.kind === "structure") {
        const variant =
          sel.meta && typeof sel.meta === "object" && typeof sel.meta.variant === "string"
            ? sel.meta.variant
            : "pylon";
        return {
          list: "barriers",
          obj: { type: "structure", variant: variant === "column" || variant === "obelisk" ? variant : "pylon" },
        };
      }
    }
    if (sel.category === "game_object") {
      if (sel.kind === "boost_pad") return { list: "gameObjects", obj: { type: "boost_pad" } };
      if (sel.kind === "portal") return { list: "gameObjects", obj: { type: "portal", rotation: 0 } };
    }
    if (sel.category === "powerup") {
      if (sel.kind === "nitro_recharge") return { list: "powerups", obj: { type: "nitro_recharge", category: "instant" } };
      if (sel.kind === "trail_extend") return { list: "powerups", obj: { type: "trail_extend", category: "level_permanent" } };
      if (sel.kind === "nitro_capacity") return { list: "powerups", obj: { type: "nitro_capacity", category: "level_permanent" } };
      if (sel.kind === "shield") return { list: "powerups", obj: { type: "shield", category: "equippable" } };
    }
    if (sel.category === "enemy") {
      return { list: "enemies", obj: { rotation: 0, color: "#FF6600", category: "easy" } };
    }
    return null;
  }

  function commitPaletteObject(list, obj, ix, iz) {
    if (!canPlaceObjectAt(list, obj, ix, iz, dragFloor)) {
      onStatusChange?.("Cannot place there: footprint is blocked, outside the playable interior, or in a gate clear zone.");
      return false;
    }
    const arr = level[list];
    if (!Array.isArray(arr)) level[list] = [];
    beforeMutation?.();
    setEditorObjectPlacement(level, list, obj, ix, iz);
    /** @type {unknown[]} */ (level[list]).push(obj);
    rebuild();
    onStatusChange?.("Placed. Select it to move or edit properties.");
    schedulePersist();
    return true;
  }

  function placeFromPalette(ix, iz) {
    const sel = getPaletteSelection();
    if (!sel) return;

    if (sel.category === "barrier") {
      const kind = sel.kind;
      if (kind === "wall") {
        commitPaletteObject("barriers", { type: "wall" }, ix, iz);
      } else if (kind === "building") {
        const shape =
          sel.meta && typeof sel.meta === "object" && sel.meta.shape === "triangle"
              ? "triangle"
              : "square";
        commitPaletteObject(
          "barriers",
          shape === "triangle"
            ? { type: "building", height: 2, shape, width: 10, depth: 10, triangleQuarter: 0, rotation: 0 }
            : { type: "building", height: 2, shape, width: 10, depth: 10 },
          ix,
          iz,
        );
      } else if (kind === "structure") {
        const variant =
          sel.meta && typeof sel.meta === "object" && typeof sel.meta.variant === "string"
            ? sel.meta.variant
            : "pylon";
        commitPaletteObject("barriers", {
          type: "structure",
          variant: variant === "column" || variant === "obelisk" ? variant : "pylon",
        }, ix, iz);
      }
      return;
    }

    if (sel.category === "game_object") {
      if (sel.kind === "boost_pad") {
        commitPaletteObject("gameObjects", { type: "boost_pad" }, ix, iz);
      } else if (sel.kind === "portal") {
        const incomplete = findIncompletePortalPairId(level);
        if (incomplete) {
          commitPaletteObject("gameObjects", {
            type: "portal",
            rotation: 0,
            pairId: incomplete,
            pairColor: findPairColorForId(level, incomplete) ?? PORTAL_PAIR_COLORS[0],
          }, ix, iz);
        } else {
          const n = countDistinctPortalPairs(level);
          if (n >= PORTAL_PAIR_COLORS.length) return;
          const pairId = `p-${Date.now().toString(36)}`;
          const pairColor = PORTAL_PAIR_COLORS[n];
          commitPaletteObject("gameObjects", {
            type: "portal",
            rotation: 0,
            pairId,
            pairColor,
          }, ix, iz);
        }
      }
      return;
    }

    if (sel.category === "powerup") {
      const kind = sel.kind;
      if (kind === "nitro_recharge") {
        commitPaletteObject("powerups", { type: "nitro_recharge", category: "instant" }, ix, iz);
      } else if (kind === "trail_extend") {
        commitPaletteObject("powerups", { type: "trail_extend", category: "level_permanent" }, ix, iz);
      } else if (kind === "nitro_capacity") {
        commitPaletteObject("powerups", { type: "nitro_capacity", category: "level_permanent" }, ix, iz);
      } else if (kind === "shield") {
        commitPaletteObject("powerups", { type: "shield", category: "equippable" }, ix, iz);
      }
      return;
    }

    if (sel.category === "enemy") {
      commitPaletteObject("enemies", {
        rotation: 0,
        color: "#FF6600",
        category: "easy",
      }, ix, iz);
    }
  }

  /**
   * @param {Record<string, unknown>} level
   * @param {string} pairId
   */
  function findPairColorForId(level, pairId) {
    const go = level.gameObjects;
    if (!Array.isArray(go)) return null;
    for (const g of go) {
      if (!g || typeof g !== "object") continue;
      const o = /** @type {Record<string, unknown>} */ (g);
      if (o.type === "portal" && o.pairId === pairId && typeof o.pairColor === "string") {
        return o.pairColor;
      }
    }
    return null;
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (e.button === 1) return;
    const hit = pickFromRaycast(e.clientX, e.clientY);

    if (hit.type === "ground") {
      const { ix, iz } = snapAuthoringCell(level, hit.x, hit.z);
      const pal = getPaletteSelection();
      if (pal) {
        placeFromPalette(ix, iz);
        return;
      }
      canvasPan = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, moved: false };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (hit.type === "gate") {
      const wasSelected = samePick(selection, hit);
      setSelection({ type: "gate", index: hit.index });
      if (wasSelected) {
        pendingGateDrag = { pick: hit, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (hit.type === "floor") {
      const wasSelected = samePick(selection, hit);
      setSelection(hit);
      if (wasSelected) {
        pendingFloorDrag = {
          pick: hit,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          active: false,
          altKey: e.altKey,
        };
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (canvasPan && e.pointerId === canvasPan.pointerId) {
      e.preventDefault();
      const dx = e.clientX - canvasPan.lastX;
      const dy = e.clientY - canvasPan.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        viewport.panByScreenDelta?.(canvasPan.lastX, canvasPan.lastY, e.clientX, e.clientY);
        canvasPan.lastX = e.clientX;
        canvasPan.lastY = e.clientY;
        canvasPan.moved = true;
        onStatusChange?.("Dragging map.");
      }
      return;
    }
    const pal = getPaletteSelection();
    const hit = pickFromRaycast(e.clientX, e.clientY);

    if (pendingGateDrag && e.pointerId === pendingGateDrag.pointerId) {
      const moved = Math.hypot(e.clientX - pendingGateDrag.startX, e.clientY - pendingGateDrag.startY);
      if (!pendingGateDrag.active && moved < 4) return;
      if (!pendingGateDrag.active) {
        const wo = level.wallObjects;
        const g = Array.isArray(wo) ? wo[pendingGateDrag.pick.index] : null;
        if (!g || typeof g !== "object") {
          pendingGateDrag = null;
          return;
        }
        const o = /** @type {Record<string, unknown>} */ (g);
        const edge = o.edge;
        const pos = o.position;
        if (typeof edge !== "string" || typeof pos !== "number") {
          pendingGateDrag = null;
          return;
        }
        beforeMutation?.();
        gateDrag = {
          index: pendingGateDrag.pick.index,
          edge,
          startPos: pos,
          startClient: edge === "north" || edge === "south" ? pendingGateDrag.startX : pendingGateDrag.startY,
        };
        pendingGateDrag.active = true;
        onStatusChange?.("Dragging selected gate.");
      }
    }

    if (pendingFloorDrag && e.pointerId === pendingFloorDrag.pointerId) {
      const moved = Math.hypot(e.clientX - pendingFloorDrag.startX, e.clientY - pendingFloorDrag.startY);
      if (!pendingFloorDrag.active && moved < 4) return;
      if (!pendingFloorDrag.active) {
        const pick = pendingFloorDrag.pick;
        if (pendingFloorDrag.altKey && pick.type === "floor") {
          beforeMutation?.();
          const clonePick = cloneFloorObjectAtSource(pick);
          if (clonePick) {
            dragFloor = clonePick;
            setSelection(clonePick);
            onStatusChange?.("Placing copy — release to drop (⌥ Option / Alt + drag).");
          } else {
            dragFloor = pick;
            onStatusChange?.("Can't duplicate (e.g. max portal pairs). Moving the original.");
          }
        } else {
          beforeMutation?.();
          dragFloor = pick;
        }
        pendingFloorDrag.active = true;
      }
    }

    if (hit.type === "ground") {
      const { ix, iz } = snapAuthoringCell(level, hit.x, hit.z);
      const preview = paletteObjectPreview(pal);
      const ok = preview ? canPlaceObjectAt(preview.list, preview.obj, ix, iz, null) : false;
      if (pal) {
        const fp = preview ? getFloorObjectFootprint(preview.list, preview.obj) : { width: 1, depth: 1 };
        const test = preview ? { ...preview.obj } : {};
        if (preview) setEditorObjectPlacement(level, preview.list, test, ix, iz);
        const c = preview ? getFloorObjectWorldCenter(level, preview.list, test) : { x: ix, z: iz };
        ghost.visible = true;
        ghost.position.set(c.x, 0.12, c.z);
        ghost.scale.set(fp.width, 1, fp.depth);
        /** @type {THREE.MeshBasicMaterial} */ (ghost.material).color.setHex(ok ? 0x00ff88 : 0xff2222);
        /** @type {THREE.MeshBasicMaterial} */ (ghost.material).opacity = ok ? 0.42 : 0.32;
        onStatusChange?.(
          ok
            ? `Ready to place at grid ${ix}, ${iz}.`
            : `Blocked at grid ${ix}, ${iz}: overlaps, gate clear zone, or outside the interior.`,
        );
      } else {
        ghost.visible = false;
      }
    } else {
      ghost.visible = false;
    }

    if (gateDrag) {
      const wo = level.wallObjects;
      if (!Array.isArray(wo)) return;
      const g = wo[gateDrag.index];
      if (!g || typeof g !== "object") return;
      const o = /** @type {Record<string, unknown>} */ (g);
      const edge = gateDrag.edge;
      const deltaPx =
        edge === "north" || edge === "south"
          ? e.clientX - gateDrag.startClient
          : -(e.clientY - gateDrag.startClient);
      const worldPerPx =
        (camera.right - camera.left) / Math.max(1, canvas.clientWidth || window.innerWidth);
      const deltaWorld = deltaPx * worldPerPx;
      let newPos = gateDrag.startPos + deltaWorld;
      newPos = clampGatePosition(edge, newPos, aw(), ad());
      o.position = newPos;
      rebuild();
      schedulePersist();
      return;
    }

    if (dragFloor && e.buttons === 1) {
      const target = hit.type === "ground" ? hit : pickFromRaycast(e.clientX, e.clientY);
      if (target.type !== "ground" && typeof target.x !== "number") return;
      const hitX = typeof target.x === "number" ? target.x : hit.x;
      const hitZ = typeof target.z === "number" ? target.z : hit.z;
      const { ix, iz } = snapAuthoringCell(level, hitX, hitZ);
      const arr = level[dragFloor.list];
      if (!Array.isArray(arr)) return;
      const obj = arr[dragFloor.index];
      if (!obj || typeof obj !== "object") return;
      if (!canPlaceObjectAt(dragFloor.list, /** @type {Record<string, unknown>} */ (obj), ix, iz, dragFloor)) return;
      setEditorObjectPlacement(level, dragFloor.list, /** @type {Record<string, unknown>} */ (obj), ix, iz);
      onStatusChange?.(`Moved to grid ${ix}, ${iz}.`);
      rebuild();
    }
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    if (pendingGateDrag && e.pointerId === pendingGateDrag.pointerId) {
      pendingGateDrag = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (pendingFloorDrag && e.pointerId === pendingFloorDrag.pointerId) {
      pendingFloorDrag = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (canvasPan && e.pointerId === canvasPan.pointerId) {
      const moved = canvasPan.moved;
      canvasPan = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) onStatusChange?.("Map repositioned.");
      else {
        setSelection(null);
        onStatusChange?.("Selection cleared.");
      }
      return;
    }
    const hadGateDrag = !!gateDrag;
    if (gateDrag) {
      gateDrag = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (hadGateDrag) onSelectionChange?.(selection);
    const hadFloorDrag = !!dragFloor;
    if (dragFloor) {
      dragFloor = null;
      schedulePersist();
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (hadFloorDrag) onSelectionChange?.(selection);
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (e.key === "Escape") {
      if (selection || gateDrag || canvasPan || pendingFloorDrag || pendingGateDrag) {
        gateDrag = null;
        canvasPan = null;
        pendingFloorDrag = null;
        pendingGateDrag = null;
        setSelection(null);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("keydown", onKey, true);

  rebuild();

  function clearSelection() {
    setSelection(null);
  }

  return {
    getSelection,
    canPlaceSelectionDraft,
    deleteSelection,
    refresh,
    refreshVisual,
    clearSelection,
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKey, true);
      if (persistTimer) window.clearTimeout(persistTimer);
      scene.remove(contentRoot);
      disposeGroupChildren(contentRoot);
    },
  };
}
