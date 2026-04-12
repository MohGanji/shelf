/**
 * P6.3 — Editor placement: palette click-to-place, select / delete / move / rotate,
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
  snapTile,
} from "./editorLevel.js";

/**
 * @typedef {{
 *   type: "floor";
 *   list: "barriers" | "gameObjects" | "powerups" | "enemies";
 *   index: number;
 * }} FloorPick
 *
 * @typedef {{ type: "gate"; index: number }} GatePick
 *
 * @typedef {FloorPick | GatePick} EditorPick
 */

/**
 * @param {number} ix
 * @param {number} iz
 * @param {number} aw
 * @param {number} ad
 */
function tileInsideArena(ix, iz, aw, ad) {
  const halfW = aw / 2;
  const halfD = ad / 2;
  return Math.abs(ix) < halfW - 1e-6 && Math.abs(iz) < halfD - 1e-6;
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
 *   };
 *   getPaletteSelection: () => unknown;
 *   level: Record<string, unknown>;
 *   onPersist?: (level: Record<string, unknown>) => void;
 *   onSelectionChange?: (sel: EditorPick | null) => void;
 *   beforeMutation?: () => void;
 * }} opts
 * @returns {{ dispose(): void; refresh(): void; getSelection: () => EditorPick | null; clearSelection(): void }}
 */
export function mountEditorWorkbench(opts) {
  const { viewport, getPaletteSelection, level } = opts;
  const onPersist = opts.onPersist ?? ((L) => upsertWipLevel(L));
  const onSelectionChange = opts.onSelectionChange;
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

  function refresh() {
    rebuild();
    schedulePersist();
    onSelectionChange?.(selection);
  }

  function getSelection() {
    return selection;
  }

  /** @type {EditorPick | null} */
  let dragFloor = null;
  let dragGate = null;
  /** @type {{ index: number; edge: string; startPos: number; startClient: number } | null */
  let gateDrag = null;

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
          const p = /** @type {Record<string, unknown>} */ (o);
          if (typeof p.x === "number" && typeof p.z === "number") {
            occ.delete(`${Math.round(p.x)},${Math.round(p.z)}`);
          }
        }
      }
    }
    return occ;
  }

  function canPlaceAt(ix, iz, excludeOccupant) {
    if (!tileInsideArena(ix, iz, aw(), ad())) return false;
    const clear = collectGateClearTileKeys(
      Array.isArray(level.wallObjects) ? level.wallObjects : [],
      aw(),
      ad(),
    );
    const k = `${ix},${iz}`;
    if (clear.has(k)) return false;
    const occ = occupiedExcluding(excludeOccupant);
    return !occ.has(k);
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
        const x = o.x;
        const z = o.z;
        if (typeof t !== "string" || typeof x !== "number" || typeof z !== "number") continue;
        let mesh;
        let color = 0x4488cc;
        let h = 0.55;
        if (t === "wall") {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.96, 0.65, 0.96),
            new THREE.MeshStandardMaterial({ color, emissive: 0x002244, emissiveIntensity: 0.35 }),
          );
          mesh.position.set(x, 0.35, z);
        } else if (t === "building") {
          h = typeof o.height === "number" ? Math.max(1, Math.min(5, o.height)) : 2;
          color = 0x3366aa;
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, h, 0.92),
            new THREE.MeshStandardMaterial({ color, emissive: 0x001844, emissiveIntensity: 0.4 }),
          );
          mesh.position.set(x, h / 2, z);
        } else {
          mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.25, 0.25, 1.1, 10),
            new THREE.MeshStandardMaterial({ color: 0x5566aa, emissive: 0x001a44, emissiveIntensity: 0.35 }),
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
        const x = o.x;
        const z = o.z;
        if (typeof typ !== "string" || typeof x !== "number" || typeof z !== "number") continue;
        let mesh;
        if (typ === "boost_pad") {
          mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.06, 0.85),
            new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xaa6600, emissiveIntensity: 0.5 }),
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
        const x = o.x;
        const z = o.z;
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
        const x = o.x;
        const z = o.z;
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
        return /** @type {EditorPick} */ (o.userData.editorPick);
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
    schedulePersist();
  }

  function rotateSelection() {
    if (!selection || selection.type === "gate") return;
    const arr = level[selection.list];
    if (!Array.isArray(arr)) return;
    const o = arr[selection.index];
    if (!o || typeof o !== "object") return;
    const rec = /** @type {Record<string, unknown>} */ (o);
    if (selection.list === "enemies" || (selection.list === "gameObjects" && rec.type === "portal")) {
      beforeMutation?.();
      const r = typeof rec.rotation === "number" ? rec.rotation : 0;
      rec.rotation = r + Math.PI / 2;
      rebuild();
      schedulePersist();
      onSelectionChange?.(selection);
    }
  }

  function placeFromPalette(ix, iz) {
    const sel = getPaletteSelection();
    if (!sel) return;

    const exclude = dragFloor;

    if (!canPlaceAt(ix, iz, exclude)) return;

    if (sel.category === "barrier") {
      if (!Array.isArray(level.barriers)) level.barriers = [];
      beforeMutation?.();
      const kind = sel.kind;
      if (kind === "wall") {
        level.barriers.push({ type: "wall", x: ix, z: iz });
      } else if (kind === "building") {
        const shape =
          sel.meta && typeof sel.meta === "object" && sel.meta.shape === "hexagon"
            ? "hexagon"
            : sel.meta && typeof sel.meta === "object" && sel.meta.shape === "triangle"
              ? "triangle"
              : "square";
        level.barriers.push({ type: "building", x: ix, z: iz, height: 2, shape });
      } else if (kind === "structure") {
        const variant =
          sel.meta && typeof sel.meta === "object" && typeof sel.meta.variant === "string"
            ? sel.meta.variant
            : "pylon";
        level.barriers.push({
          type: "structure",
          x: ix,
          z: iz,
          variant: variant === "column" || variant === "obelisk" ? variant : "pylon",
        });
      }
      rebuild();
      schedulePersist();
      return;
    }

    if (sel.category === "game_object") {
      if (!Array.isArray(level.gameObjects)) level.gameObjects = [];
      if (sel.kind === "boost_pad") {
        beforeMutation?.();
        level.gameObjects.push({ type: "boost_pad", x: ix, z: iz });
      } else if (sel.kind === "portal") {
        const incomplete = findIncompletePortalPairId(level);
        if (incomplete) {
          beforeMutation?.();
          level.gameObjects.push({
            type: "portal",
            x: ix,
            z: iz,
            rotation: 0,
            pairId: incomplete,
            pairColor: findPairColorForId(level, incomplete) ?? PORTAL_PAIR_COLORS[0],
          });
        } else {
          const n = countDistinctPortalPairs(level);
          if (n >= PORTAL_PAIR_COLORS.length) return;
          beforeMutation?.();
          const pairId = `p-${Date.now().toString(36)}`;
          const pairColor = PORTAL_PAIR_COLORS[n];
          level.gameObjects.push({
            type: "portal",
            x: ix,
            z: iz,
            rotation: 0,
            pairId,
            pairColor,
          });
        }
      }
      rebuild();
      schedulePersist();
      return;
    }

    if (sel.category === "powerup") {
      if (!Array.isArray(level.powerups)) level.powerups = [];
      beforeMutation?.();
      const cat =
        sel.meta && sel.meta.category === "level_permanent"
          ? "level_permanent"
          : sel.meta && sel.meta.category === "equippable"
            ? "equippable"
            : "instant";
      const kind = sel.kind;
      if (kind === "nitro_recharge") {
        level.powerups.push({ type: "nitro_recharge", x: ix, z: iz, category: "instant" });
      } else if (kind === "trail_extend") {
        level.powerups.push({ type: "trail_extend", x: ix, z: iz, category: "level_permanent" });
      } else if (kind === "nitro_capacity") {
        level.powerups.push({ type: "nitro_capacity", x: ix, z: iz, category: "level_permanent" });
      } else if (kind === "shield") {
        level.powerups.push({ type: "shield", x: ix, z: iz, category: "equippable" });
      }
      rebuild();
      schedulePersist();
      return;
    }

    if (sel.category === "enemy") {
      if (!Array.isArray(level.enemies)) level.enemies = [];
      beforeMutation?.();
      level.enemies.push({
        x: ix,
        z: iz,
        rotation: 0,
        color: "#FF6600",
        attributes: {
          speed: 3,
          acceleration: 3,
          trailLength: 4,
          nitroBars: 3,
          handling: 3,
          intelligence: 3,
        },
      });
      rebuild();
      schedulePersist();
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
      const { ix, iz } = snapTile(hit.x, hit.z);
      const pal = getPaletteSelection();
      if (pal) {
        placeFromPalette(ix, iz);
        return;
      }
      if (selection && selection.type === "floor") {
        if (canPlaceAt(ix, iz, selection)) {
          const arr = level[selection.list];
          if (Array.isArray(arr) && arr[selection.index]) {
            const o = arr[selection.index];
            if (o && typeof o === "object") {
              beforeMutation?.();
              /** @type {Record<string, unknown>} */ (o).x = ix;
              /** @type {Record<string, unknown>} */ (o).z = iz;
              rebuild();
              schedulePersist();
              onSelectionChange?.(selection);
              return;
            }
          }
        }
        return;
      }
      setSelection(null);
      return;
    }

    if (hit.type === "gate") {
      const wo = level.wallObjects;
      if (!Array.isArray(wo)) return;
      const g = wo[hit.index];
      if (!g || typeof g !== "object") return;
      const o = /** @type {Record<string, unknown>} */ (g);
      const edge = o.edge;
      const pos = o.position;
      if (typeof edge !== "string" || typeof pos !== "number") return;
      beforeMutation?.();
      gateDrag = {
        index: hit.index,
        edge,
        startPos: pos,
        startClient: edge === "north" || edge === "south" ? e.clientX : e.clientY,
      };
      setSelection({ type: "gate", index: hit.index });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (hit.type === "floor") {
      beforeMutation?.();
      dragFloor = hit;
      setSelection(hit);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    const pal = getPaletteSelection();
    const hit = pickFromRaycast(e.clientX, e.clientY);

    if (hit.type === "ground") {
      const { ix, iz } = snapTile(hit.x, hit.z);
      const ok = pal ? canPlaceAt(ix, iz, null) : false;
      if (pal) {
        ghost.visible = true;
        ghost.position.set(ix, 0.12, iz);
        /** @type {THREE.MeshBasicMaterial} */ (ghost.material).color.setHex(ok ? 0x00ff88 : 0xff2222);
        /** @type {THREE.MeshBasicMaterial} */ (ghost.material).opacity = ok ? 0.42 : 0.32;
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
      if (hit.type !== "ground") return;
      const { ix, iz } = snapTile(hit.x, hit.z);
      if (!canPlaceAt(ix, iz, dragFloor)) return;
      const arr = level[dragFloor.list];
      if (!Array.isArray(arr)) return;
      const obj = arr[dragFloor.index];
      if (!obj || typeof obj !== "object") return;
      /** @type {Record<string, unknown>} */ (obj).x = ix;
      /** @type {Record<string, unknown>} */ (obj).z = iz;
      rebuild();
    }
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
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
      if (selection || gateDrag) {
        gateDrag = null;
        setSelection(null);
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      deleteSelection();
    }
    if (e.key === "r" || e.key === "R") {
      rotateSelection();
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
    refresh,
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
