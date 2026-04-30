/**
 * Non-colliding arena decoration: skyline, drift props, garnish, edge caps, banners.
 * Toggled via Dev HUD vizAmbience* flags.
 */

import * as THREE from "../vendor/three-module.js";
import { mergeDevHud } from "../config.js";
import { reapplyAmbientStageLighting } from "./arena.js";
import { extractGatesFromWallObjects, openGateGapsByEdge, solidSegmentsAlongWall } from "./gates.js";

/**
 * @param {number} i
 * @param {number} j
 * @returns {number}
 */
function hash01(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * @param {import("../engine/graphicsProfile.js").GraphicsProfile | null | undefined} gfx
 */
function instanceCaps(gfx) {
  const t = gfx?.tier ?? "medium";
  if (t === "low") return { hex: 11, barcode: 3, cubes: 18, sprites: 5, skyline: 3 };
  if (t === "high") return { hex: 26, barcode: 7, cubes: 44, sprites: 11, skyline: 8 };
  return { hex: 17, barcode: 5, cubes: 28, sprites: 8, skyline: 5 };
}

/**
 * Distant backdrop: never write depth so arena + sprites shade correctly over it.
 * @param {THREE.Object3D} obj
 * @param {number} renderOrder
 */
function setBackdropDrawing(obj, renderOrder) {
  obj.traverse((ch) => {
    if (!(ch instanceof THREE.Mesh)) return;
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of mats) {
      if (!m) continue;
      m.depthWrite = false;
      /** @type {THREE.Material & { depthTest?: boolean }} */ (m).depthTest = true;
    }
    ch.renderOrder = renderOrder;
  });
  obj.renderOrder = renderOrder;
}

/** Procedural neon art for floating sprites — replace with PNG list via `floatingSpriteTextures`. */
function makeFloatingAbstractSpriteTexture(ix) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  const g = ctx.createRadialGradient(128, 118, 12, 128, 128, 160);
  g.addColorStop(0, `rgba(${120 + (ix * 31) % 80},200,255,0.22)`);
  g.addColorStop(0.45, `rgba(${200 + (ix * 17) % 55},80,200,0.12)`);
  g.addColorStop(1, "rgba(8,10,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = "lighter";
  for (let s = 0; s < 9; s++) {
    const hue = 160 + (ix * 13 + s * 29) % 100;
    ctx.strokeStyle = `hsla(${hue},85%,62%,${0.12 + hash01(ix, s + 3) * 0.18})`;
    ctx.lineWidth = 1.2 + hash01(ix, s + 7);
    ctx.beginPath();
    ctx.moveTo(hash01(ix, s) * 260 - 20, hash01(ix, s + 11) * 280);
    ctx.bezierCurveTo(
      80 + s * 22,
      40 + hash01(ix, s + 19) * 200,
      180 - s * 12,
      200 + hash01(ix, s + 23) * 40,
      220 + hash01(ix, s + 29) * 50,
      hash01(ix, s + 31) * 256,
    );
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural wall ribbon — replace via `wallBannerTextures` when you have assets. */
function makeAbstractWallBannerTexture(ix) {
  const c = document.createElement("canvas");
  c.width = 384;
  c.height = 96;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  ctx.fillStyle = "rgba(4,12,22,0.35)";
  ctx.fillRect(0, 0, 384, 96);
  const lg = ctx.createLinearGradient(0, 0, 384, 96);
  lg.addColorStop(0, `rgba(0,220,255,${0.06 + hash01(ix, 41) * 0.08})`);
  lg.addColorStop(0.5, `rgba(200,90,255,${0.07 + hash01(ix, 43) * 0.08})`);
  lg.addColorStop(1, `rgba(255,160,80,${0.05 + hash01(ix, 47) * 0.07})`);
  ctx.fillStyle = lg;
  ctx.fillRect(8, 10, 368, 76);
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "rgba(140,240,255,0.35)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(4, 6, 376, 84);
  const cell = 46;
  for (let x = 22; x < 360; x += cell) {
    if (hash01(ix, x) < 0.28) continue;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x + 18 + hash01(ix, x + 1) * 12, 76);
    ctx.strokeStyle = `rgba(${100 + (ix + x) % 120},230,255,0.2)`;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @typedef {{
 *   root: THREE.Group;
 *   groups: Record<string, THREE.Object3D>;
 *   drift: Array<{ mesh: THREE.InstancedMesh; n: number; kind: string; phase: Float32Array; spd: Float32Array }>;
 *   sprites: THREE.Sprite[];
 *   dispose(): void;
 *   syncFromDevHud: (patch?: Partial<import("../config.js").DEFAULT_DEV_HUD>) => void;
 *   tick: (args: { t: number; dt?: number }) => void;
 * }} ArenaAmbience
 */

/**
 * @param {object} opts
 * @param {THREE.Scene} opts.scene
 * @param {object} opts.playCfg
 * @param {import("../config.js").DEFAULT_DEV_HUD} opts.devHud
 * @param {import("../engine/graphicsProfile.js").GraphicsProfile | null} [opts.graphicsProfile]
 * @param {Record<string, unknown> | null} [opts.level]
 * @param {THREE.Texture[]} [opts.floatingSpriteTextures] — preloaded sprites (not disposed by ambience)
 * @param {THREE.Texture[]} [opts.wallBannerTextures] — preloaded wall ribbons (not disposed here)
 * @returns {ArenaAmbience}
 */
export function createArenaAmbience(opts) {
  const { scene, playCfg, devHud, graphicsProfile = null } = opts;
  const floatingSpriteTextures =
    Array.isArray(opts.floatingSpriteTextures) && opts.floatingSpriteTextures.length > 0
      ? opts.floatingSpriteTextures
      : null;
  const wallBannerTextures =
    Array.isArray(opts.wallBannerTextures) && opts.wallBannerTextures.length > 0
      ? opts.wallBannerTextures
      : null;
  /** @type {Set<THREE.Texture>} */
  const externalTexturesDontDispose = new Set();
  const caps = instanceCaps(graphicsProfile);
  const halfW = playCfg.arenaWidth / 2;
  const halfD = playCfg.arenaDepth / 2;
  const h = typeof playCfg.arenaWallHeight === "number" ? playCfg.arenaWallHeight : 3;
  const aw = playCfg.arenaWidth;
  const ad = playCfg.arenaDepth;

  const gates =
    opts.level && Array.isArray(opts.level.wallObjects)
      ? extractGatesFromWallObjects(/** @type {Array<unknown>} */ (opts.level.wallObjects))
      : [];
  const g = openGateGapsByEdge(gates, { includeLockedEntrance: true });

  if (typeof scene.userData._disposeArenaAmbience === "function") {
    try {
      scene.userData._disposeArenaAmbience();
    } catch {
      /* ignore */
    }
    delete scene.userData._disposeArenaAmbience;
  }

  const root = new THREE.Group();
  root.name = "arena-ambience";
  scene.add(root);

  /** @type {THREE.Sprite[]} */
  const spriteList = [];

  /** @type {Record<string, THREE.Object3D>} */
  const groups = {
    skyline: new THREE.Group(),
    driftHex: new THREE.Group(),
    driftBarcode: new THREE.Group(),
    driftCubes: new THREE.Group(),
    sprites: new THREE.Group(),
    banners: new THREE.Group(),
    garnish: new THREE.Group(),
    edgeLight: new THREE.Group(),
  };
  root.add(...Object.values(groups));

  const zBackdrop = Math.max(aw, ad) + 520;

  // --- skyline (far silhouettes; depthWrite off + early renderOrder avoids hiding sprites)
  {
    const n = caps.skyline;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x05070c,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1300;
    const dummy = new THREE.Object3D();
    const zOffsets = [-halfD - zBackdrop, halfD + zBackdrop];
    for (let i = 0; i < n; i++) {
      const side = hash01(i, 2) > 0.5 ? zOffsets[0] : zOffsets[1];
      const wide = hash01(i, 7) > 0.58;
      const wx = (wide ? 22 + hash01(i, 11) * 58 : 4 + hash01(i, 3) * 10) * 0.72;
      const wy = (10 + hash01(i, 5) * 36 + (wide ? 0 : hash01(i, 9) * 16)) * 0.7;
      const wz = (2 + hash01(i, 4) * (wide ? 5 : 2)) * 0.75;
      const x = (hash01(i, 13) - 0.5) * (halfW * 2.75 + aw * 0.12);
      dummy.position.set(x, wy / 2, side + (hash01(i, 17) - 0.5) * 48);
      dummy.scale.set(wx, wy, wz);
      dummy.rotation.y = wide ? hash01(i, 19) * 0.045 : hash01(i, 23) * 0.28;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    groups.skyline.add(mesh);
    setBackdropDrawing(groups.skyline, -1300);
  }

  /** @type {ArenaAmbience["drift"]} */
  const drift = [];

  /**
   * @param {THREE.InstancedMesh} mesh
   * @param {number} nInst
   * @param {string} kind
   */
  function pushDrift(mesh, nInst, kind) {
    const phase = new Float32Array(nInst);
    const spd = new Float32Array(nInst);
    for (let i = 0; i < nInst; i++) {
      phase[i] = hash01(i + kind.length * 91, nInst) * Math.PI * 2;
      spd[i] = 0.35 + hash01(i + kind.length * 17, nInst + 3) * 0.95;
    }
    drift.push({ mesh, n: nInst, kind, phase, spd });
  }

  {
    const n = caps.hex;
    const geo = new THREE.BoxGeometry(0.42, 0.06, 0.48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ccee,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const yHi = Math.min(h + 54, Math.max(h + 28, halfW * 0.09 + 38));
    for (let i = 0; i < n; i++) {
      const x = (hash01(i, 29) - 0.5) * aw * 0.88;
      const z = (hash01(i, 31) - 0.5) * ad * 0.88;
      const y = h + 4 + hash01(i, 33) * yHi;
      dummy.position.set(x, y, z);
      dummy.rotation.set(hash01(i, 37), hash01(i, 41), hash01(i, 43));
      dummy.scale.setScalar((2.8 + hash01(i, 47) * 4) * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    groups.driftHex.add(mesh);
    pushDrift(mesh, n, "hex");
  }

  // --- distant "shooting" streaks (parallel to ground; Dev HUD still vizAmbienceDriftBarcode)
  {
    const n = caps.barcode;
    const len = Math.max(aw, ad) * 0.55 + 80;
    const geo = new THREE.BoxGeometry(len, 0.05, 0.16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3a4a62,
      transparent: true,
      opacity: 0.125,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = -400;
    const dummy = new THREE.Object3D();
    const yLo = Math.max(h, 42) + 26;
    const yHi = yLo + Math.min(120, Math.max(aw, ad) * 0.12 + 72);
    for (let i = 0; i < n; i++) {
      const x = (hash01(i, 51) - 0.5) * aw * 1.08;
      const z = (hash01(i, 53) - 0.5) * ad * 1.08;
      const y = yLo + hash01(i, 55) * (yHi - yLo);
      dummy.position.set(x, y, z);
      dummy.rotation.order = "YXZ";
      dummy.rotation.x = -Math.PI / 2 + (hash01(i, 141) - 0.5) * 0.09;
      dummy.rotation.y = ((hash01(i, 147) + i * 0.17) % 1) * Math.PI;
      dummy.rotation.z = 0;
      const sc = 0.92 + hash01(i, 151) * 0.85;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    groups.driftBarcode.add(mesh);
    pushDrift(mesh, n, "ray");
  }

  {
    const n = caps.cubes;
    const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6688aa,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const x = (hash01(i, 71) - 0.5) * aw * 0.94;
      const z = (hash01(i, 73) - 0.5) * ad * 0.94;
      dummy.position.set(x, h + 2 + hash01(i, 75) * Math.min(halfW * 0.085 + 36, halfD * 0.085 + 36), z);
      dummy.rotation.set(hash01(i, 77), hash01(i, 79), hash01(i, 81));
      dummy.scale.setScalar((0.85 + hash01(i, 83) * 2.8) * 0.5);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    groups.driftCubes.add(mesh);
    pushDrift(mesh, n, "cube");
  }

  /** @returns {THREE.CanvasTexture} */
  function pickFloatingSpriteTexture(i) {
    if (floatingSpriteTextures) {
      const tex = floatingSpriteTextures[i % floatingSpriteTextures.length];
      externalTexturesDontDispose.add(tex);
      return tex;
    }
    return makeFloatingAbstractSpriteTexture(i);
  }

  {
    const n = caps.sprites;
    for (let i = 0; i < n; i++) {
      const map = pickFloatingSpriteTexture(i);
      const mat = new THREE.SpriteMaterial({
        map,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.renderOrder = 2;
      sprite.position.set(
        (hash01(i + 111, i) - 0.5) * aw * 0.92,
        h + 5 + hash01(i + 113, i) * 44,
        (hash01(i + 115, i) - 0.5) * ad * 0.92,
      );
      const s = 4.6 + hash01(i + 117, i) * 6.5;
      sprite.scale.set(s * 3.2, s * 3.2, s);
      groups.sprites.add(sprite);
      spriteList.push(sprite);
    }
  }

  /** @type {{ label: string; tex: THREE.Texture }[]} */
  const bannerTexCache = [];

  /** @param {number} ix */
  function pickWallBannerTexture(ix) {
    if (wallBannerTextures) {
      const tex = wallBannerTextures[ix % wallBannerTextures.length];
      externalTexturesDontDispose.add(tex);
      return tex;
    }
    const slot = String(ix % 24);
    let ent = bannerTexCache.find((e) => e.label === slot);
    if (!ent) {
      const tex = makeAbstractWallBannerTexture(ix);
      ent = { label: slot, tex };
      bannerTexCache.push(ent);
    }
    return ent.tex;
  }

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

  let bannerIdx = 0;
  /** Banners sit just inside the arena (wall inner faces are at ±halfW / ±halfD). */
  const bannerIn = 0.32;
  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    forChunks(seg.start, seg.end, (u, v, idx) => {
      if (idx % 14 !== 0) return;
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const geom = new THREE.PlaneGeometry(Math.min(slen * 0.85, 18), 2.2);
      const mat = new THREE.MeshBasicMaterial({
        map: pickWallBannerTexture(bannerIdx++),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(cx, h + 0.35, -halfD + bannerIn);
      mesh.rotation.x = -0.15;
      mesh.renderOrder = 8;
      groups.banners.add(mesh);
    });
  }
  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    forChunks(seg.start, seg.end, (u, v, idx) => {
      if (idx % 14 !== 5) return;
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const geom = new THREE.PlaneGeometry(Math.min(slen * 0.85, 18), 2.2);
      const mat = new THREE.MeshBasicMaterial({
        map: pickWallBannerTexture(bannerIdx++),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(cx, h + 0.35, halfD - bannerIn);
      mesh.rotation.x = 0.15;
      mesh.rotation.y = Math.PI;
      mesh.renderOrder = 8;
      groups.banners.add(mesh);
    });
  }
  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    forChunks(seg.start, seg.end, (u, v, idx) => {
      if (idx % 14 !== 9) return;
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const geom = new THREE.PlaneGeometry(2.2, Math.min(slen * 0.85, 18));
      const mat = new THREE.MeshBasicMaterial({
        map: pickWallBannerTexture(bannerIdx++),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(-halfW + bannerIn, h + 0.35, cz);
      mesh.rotation.y = Math.PI / 2;
      mesh.rotation.x = -0.12;
      mesh.renderOrder = 8;
      groups.banners.add(mesh);
    });
  }
  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    forChunks(seg.start, seg.end, (u, v, idx) => {
      if (idx % 16 !== 3) return;
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      const geom = new THREE.PlaneGeometry(2.2, Math.min(slen * 0.85, 18));
      const mat = new THREE.MeshBasicMaterial({
        map: pickWallBannerTexture(bannerIdx++),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(halfW - bannerIn, h + 0.35, cz);
      mesh.rotation.y = -Math.PI / 2;
      mesh.rotation.x = -0.12;
      mesh.renderOrder = 8;
      groups.banners.add(mesh);
    });
  }

  // --- floor garnish
  {
    /** @type {number[]} */
    const pos = [];
    const stepMajor = Math.max(
      4,
      Math.min(
        88,
        typeof playCfg.devHud?.floorGridLineStep === "number" ? playCfg.devHud.floorGridLineStep : 16,
      ),
    );
    const sub = Math.max(2, Math.round(stepMajor / 4));
    for (let x = -halfW; x <= halfW; x += stepMajor / sub) {
      if (Math.abs(x) > halfW - 2) continue;
      const j = hash01(Math.floor(x * 130), 3);
      if (j < 0.25) continue;
      pos.push(x, 0.08, -halfD, x, 0.08, halfD);
    }
    for (let z = -halfD; z <= halfD; z += stepMajor / sub) {
      if (Math.abs(z) > halfD - 2) continue;
      const j = hash01(Math.floor(z * 99), 5);
      if (j < 0.28) continue;
      pos.push(-halfW, 0.08, z, halfW, 0.08, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(pos), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x1a5570,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    groups.garnish.add(new THREE.LineSegments(geo, mat));
  }

  const capH = 0.12;

  /** @returns {THREE.MeshBasicMaterial} */
  function makeCapMat() {
    return new THREE.MeshBasicMaterial({
      color: 0x55ddff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
  }

  for (const seg of solidSegmentsAlongWall(aw, g.south)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      const geo = new THREE.BoxGeometry(slen, capH, 0.22);
      groups.edgeLight.add(new THREE.Mesh(geo, makeCapMat()));
      const mesh = /** @type {THREE.Mesh} */ (groups.edgeLight.children[groups.edgeLight.children.length - 1]);
      mesh.position.set(cx, h + capH / 2, -halfD - 0.02);
      mesh.renderOrder = -5;
    });
  }
  for (const seg of solidSegmentsAlongWall(aw, g.north)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cx = -halfW + (u + v) / 2;
      groups.edgeLight.add(new THREE.Mesh(new THREE.BoxGeometry(slen, capH, 0.22), makeCapMat()));
      const mesh = /** @type {THREE.Mesh} */ (groups.edgeLight.children[groups.edgeLight.children.length - 1]);
      mesh.position.set(cx, h + capH / 2, halfD + 0.02);
      mesh.renderOrder = -5;
    });
  }
  for (const seg of solidSegmentsAlongWall(ad, g.west)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      groups.edgeLight.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, capH, slen), makeCapMat()));
      const mesh = /** @type {THREE.Mesh} */ (groups.edgeLight.children[groups.edgeLight.children.length - 1]);
      mesh.position.set(-halfW - 0.02, h + capH / 2, cz);
      mesh.renderOrder = -5;
    });
  }
  for (const seg of solidSegmentsAlongWall(ad, g.east)) {
    forChunks(seg.start, seg.end, (u, v) => {
      const slen = v - u;
      const cz = -halfD + (u + v) / 2;
      groups.edgeLight.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, capH, slen), makeCapMat()));
      const mesh = /** @type {THREE.Mesh} */ (groups.edgeLight.children[groups.edgeLight.children.length - 1]);
      mesh.position.set(halfW + 0.02, h + capH / 2, cz);
      mesh.renderOrder = -5;
    });
  }

  const tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP0 = new THREE.Vector3();

  /** Updated in {@link syncFromDevHud} only — avoids `mergeDevHud` every frame in {@link tick}. */
  let driftAmbientAnimEnabled = true;

  /**
   * @param {Partial<import("../config.js").DEFAULT_DEV_HUD>} [patch]
   */
  function syncFromDevHud(patch = {}) {
    const h2 = mergeDevHud(devHud);
    driftAmbientAnimEnabled =
      h2.vizAmbienceDriftHex !== false ||
      h2.vizAmbienceDriftBarcode !== false ||
      h2.vizAmbienceDriftCubes !== false;
    groups.skyline.visible = h2.vizAmbienceSkyline !== false;
    groups.driftHex.visible = h2.vizAmbienceDriftHex !== false;
    groups.driftBarcode.visible = h2.vizAmbienceDriftBarcode !== false;
    groups.driftCubes.visible = h2.vizAmbienceDriftCubes !== false;
    groups.sprites.visible = h2.vizAmbienceSprites !== false;
    groups.banners.visible = h2.vizAmbienceWallBanners !== false;
    groups.garnish.visible = h2.vizAmbienceFloorGarnish !== false;
    groups.edgeLight.visible = h2.vizAmbienceEdgeLight !== false;
    if (Object.prototype.hasOwnProperty.call(patch, "vizAmbienceSecondaryPalette")) {
      reapplyAmbientStageLighting(scene, h2, playCfg);
    }
  }

  function tick({ t, dt }) {
    if (!driftAmbientAnimEnabled) return;
    const ddt = typeof dt === "number" && dt > 1e-6 && dt < 0.2 ? dt : 1 / 60;
    for (const d of drift) {
      if (!d.mesh.visible) continue;
      const k = d.kind;
      for (let i = 0; i < d.n; i++) {
        d.mesh.getMatrixAt(i, tmpM);
        tmpM.decompose(tmpP, tmpQ, tmpS);
        tmpP0.copy(tmpP);
        const ph = d.phase[i];
        const sp = d.spd[i];
        if (k === "hex") {
          tmpP0.y += Math.sin(t * sp + ph) * 0.45;
          tmpP0.x += Math.cos(t * sp * 0.7 + ph) * 0.22;
        } else if (k === "ray") {
          const v = (40 + sp * 110) * ddt;
          const ang = ph;
          tmpP0.x += Math.cos(ang) * v;
          tmpP0.z += Math.sin(ang) * v;
          const padX = aw * 0.62;
          const padZ = ad * 0.62;
          if (tmpP0.x > halfW + padX) tmpP0.x -= aw * 1.92;
          if (tmpP0.x < -halfW - padX) tmpP0.x += aw * 1.92;
          if (tmpP0.z > halfD + padZ) tmpP0.z -= ad * 1.92;
          if (tmpP0.z < -halfD - padZ) tmpP0.z += ad * 1.92;
        } else {
          tmpP0.y += Math.sin(t * sp * 0.4 + ph) * 0.35;
          tmpP0.z += Math.cos(t * sp * 0.35 + ph) * 0.18;
        }
        tmpM.compose(tmpP0, tmpQ, tmpS);
        d.mesh.setMatrixAt(i, tmpM);
      }
      d.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  syncFromDevHud({});

  function dispose() {
    for (const ent of bannerTexCache) {
      if (!externalTexturesDontDispose.has(ent.tex)) ent.tex.dispose();
    }
    bannerTexCache.length = 0;
    for (const sp of spriteList) {
      const mp = sp.material.map;
      if (mp && typeof mp.dispose === "function" && !externalTexturesDontDispose.has(mp)) mp.dispose();
      sp.material.dispose();
    }
    spriteList.length = 0;
    scene.remove(root);
    root.traverse((ch) => {
      if (!(ch instanceof THREE.Mesh) && !(ch instanceof THREE.LineSegments) && !(ch instanceof THREE.Line)) return;
      ch.geometry?.dispose();
      const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshBasicMaterial || m instanceof THREE.ShaderMaterial) {
          const map = m.map;
          if (map && typeof map.dispose === "function" && !externalTexturesDontDispose.has(map)) map.dispose();
        }
        /** @type {THREE.Material | undefined} */ (m)?.dispose();
      }
    });
    delete scene.userData._disposeArenaAmbience;
  }

  scene.userData._disposeArenaAmbience = dispose;

  return {
    root,
    groups,
    drift,
    sprites: spriteList,
    dispose,
    syncFromDevHud,
    tick,
  };
}
