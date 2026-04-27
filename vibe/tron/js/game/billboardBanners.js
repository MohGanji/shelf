/**
 * LED-style billboards: optional building façades (levels) + lobby gate boards above arena/garage.
 * Uses MeshBasicMaterial (like gate signs) and crisp canvas art — no emissive double-pass or shadow blur —
 * so chromatic aberration / bloom read as a single legible image.
 */

import * as THREE from "../vendor/three-module.js";
import { sanitizeNeonHex } from "../data/savedata.js";
import {
  findCampaignLevelByCampaignIndex,
  parseCampaignLevelIndex,
} from "../levels/loader.js";
import {
  GARAGE_ATTR_KEYS,
  GARAGE_ATTR_SHORT,
  formatGarageAttrFraction,
  garageAttrScale,
} from "./garagePlayerMetrics.js";

/** Current stat only (no units / max) — gate garage banner. */
function garageBannerCurrentOnly(key, cur) {
  switch (key) {
    case "speed":
      return String(Math.round(cur));
    case "acceleration":
      return cur.toFixed(1);
    case "trailLength":
      return String(Math.round(cur));
    case "nitroBars":
      return String(Math.round(cur));
    case "handling":
      return cur.toFixed(2);
    default:
      return String(cur);
  }
}

const BUILDING_CANVAS_W = 1536;
const BUILDING_CANVAS_H = 640;
/** High-res canvas for gate boards (large world quads + 8× typography). */
const GATE_CANVAS_W = 8192;
const GATE_CANVAS_H = 6144;
/** World-space plane scale vs previous gate banner size. */
const GATE_WORLD_SCALE = 4;
/** Typography / layout scale for gate boards vs building billboards. */
const GATE_UI_SCALE = 8;

const BANNER_COIN_ICON_URL = new URL("../../assets/ui/neon-coin.svg", import.meta.url).href;
const BANNER_CYCLE_PROFILE_URL = new URL("../../assets/models/light-cycle-profile.svg", import.meta.url).href;

/** @type {HTMLImageElement | null} */
let cachedBannerCoinIcon = null;
/** @type {HTMLImageElement | null} */
let cachedBannerCycleProfile = null;
/** Bumped when SVG assets finish loading so gate banners redraw with icons. */
let bannerGateIconAssetVersion = 0;

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement | null>}
 */
function loadBannerImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
}

let bannerGateIconsPromise = null;
function ensureBannerGateIconsLoading() {
  if (bannerGateIconsPromise) return;
  bannerGateIconsPromise = Promise.all([
    loadBannerImage(BANNER_COIN_ICON_URL),
    loadBannerImage(BANNER_CYCLE_PROFILE_URL),
  ]).then(([coin, cycle]) => {
    cachedBannerCoinIcon = coin;
    cachedBannerCycleProfile = cycle;
    bannerGateIconAssetVersion += 1;
    return { coin, cycle };
  });
}

ensureBannerGateIconsLoading();

/**
 * Live stats board above the campaign exit gate (not used in lobby).
 * @param {THREE.Group} gateGroup
 * @param {{ gateWidth: number; archHeight: number; pillarD: number }} dims
 * @returns {LobbyBannerController | null}
 */
export function attachCampaignExitGateBanner(gateGroup, dims) {
  const { gateWidth: gw, archHeight: ah, pillarD } = dims;
  const canvas = document.createElement("canvas");
  canvas.width = GATE_CANVAS_W;
  canvas.height = GATE_CANVAS_H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return null;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const bw = Math.max(6, gw * 2.55) * GATE_WORLD_SCALE;
  const bh = Math.max(2.2, gw * 0.98) * GATE_WORLD_SCALE;
  const geo = new THREE.PlaneGeometry(bw, bh);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, ah + bh * 0.5 + 0.35 * GATE_WORLD_SCALE, pillarD / 2 + 0.1);
  mesh.name = "campaign-exit-gate-banner";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  gateGroup.add(mesh);

  /** @type {LobbyBannerController} */
  const ctrl = {
    kind: /** @type {const} */ ("campaign_exit"),
    placement: /** @type {const} */ ("gate"),
    texture: tex,
    canvas,
    ctx,
    material: mat,
    mesh,
    _fingerprint: "",
    dispose() {
      disposeBanner(mat, geo, tex);
    },
  };
  return ctrl;
}

/**
 * @typedef {object} CampaignExitBannerSnapshot
 * @property {number} remaining — enemies still alive
 * @property {number} total — enemies placed in level
 * @property {boolean} complete — exit gate unlocked (all cleared or zero-enemy level)
 * @property {number} coinGained — NEON to display when complete (base + time bonus if applicable)
 * @property {"normal" | "tutorial" | "daily"} [exitUiMode]
 */

/**
 * @param {LobbyBannerController[] | undefined} controllers
 * @param {CampaignExitBannerSnapshot} snap
 */
export function tickCampaignExitBanners(controllers, snap) {
  if (!controllers || controllers.length === 0) return;
  const { remaining, total, complete, coinGained } = snap;
  const uim = snap.exitUiMode || "normal";
  /** Bump `tb` when tutorial exit copy/layout changes so canvases redraw (fingerprint ignores literal strings). */
  const fp = `x:${remaining}|${total}|${complete ? 1 : 0}|${coinGained}|i${bannerGateIconAssetVersion}|m:${uim}|tb:v4`;
  for (const c of controllers) {
    if (c.kind !== "campaign_exit") continue;
    if (fp === c._fingerprint) continue;
    c._fingerprint = fp;
    redrawCampaignExitBanner(c, snap);
    c.texture.needsUpdate = true;
  }
}

/**
 * @param {LobbyBannerController} c
 * @param {CampaignExitBannerSnapshot} snap
 */
function redrawCampaignExitBanner(c, snap) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = GATE_UI_SCALE;
  const { remaining, total, complete, coinGained } = snap;
  const uim = snap.exitUiMode || "normal";
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);

  if (uim === "tutorial") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fz = 64 * g;
    const sw = Math.max(3, 3.2 * g);
    if (!complete) {
      ctx.font = `600 ${fz}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        "OUTRIDE YOUR RIVAL",
        cw / 2,
        ch * 0.42,
        "rgba(0, 238, 255, 0.95)",
        sw,
      );
      ctx.font = `600 ${fz * 0.84}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        "AVOID TRAILS",
        cw / 2,
        ch * 0.58,
        "rgba(200, 230, 250, 0.92)",
        Math.max(2.6, 3 * g),
      );
    } else {
      ctx.font = `700 ${fz * 1.05}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        "EXIT TO LOBBY",
        cw / 2,
        ch * 0.5,
        "rgba(130, 255, 210, 0.98)",
        sw,
      );
    }
    return;
  }

  if (uim === "daily") {
    if (!complete) {
      const fzMain = 96 * g;
      const swMain = Math.max(5, 5 * g);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fzMain}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        `${remaining} / ${total}`,
        cw / 2,
        ch * 0.38,
        "rgba(0, 238, 255, 0.98)",
        swMain,
      );
      ctx.font = `600 ${fzMain * 0.7}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        "DAILY — CLEAR FOR NEON",
        cw / 2,
        ch * 0.55,
        "rgba(200, 235, 255, 0.95)",
        Math.max(3, 3 * g),
      );
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fzC = 76 * g;
      ctx.font = `700 ${fzC}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(
        ctx,
        "DAILY COMPLETE",
        cw / 2,
        ch * 0.36,
        "rgba(130, 255, 210, 0.98)",
        Math.max(4, 4.2 * g),
      );
      ctx.font = `500 ${50 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      strokeThenFillText(ctx, "COIN GAINED:", cw / 2, ch * 0.5, "rgba(190, 220, 240, 0.92)", Math.max(3, 3 * g));
      const coinLabel = String(Math.max(0, Math.floor(coinGained)));
      const yCoin = ch * 0.66;
      const coinImg = cachedBannerCoinIcon;
      const iconSize = 64 * g;
      ctx.font = `700 ${72 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
      const tw = ctx.measureText(coinLabel).width;
      const gap = 16 * g;
      const totalW = (coinImg ? iconSize + gap : 0) + tw;
      let xLeft = cw / 2 - totalW / 2;
      if (coinImg) {
        ctx.drawImage(coinImg, xLeft, yCoin - iconSize / 2, iconSize, iconSize);
        xLeft += iconSize + gap;
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      strokeThenFillText(
        ctx,
        coinLabel,
        xLeft,
        yCoin,
        "rgba(255, 230, 120, 0.98)",
        Math.max(4, 4 * g),
      );
    }
    return;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fzMain = 96 * g;
  const swMain = Math.max(5, 5 * g);
  /** Slightly smaller than enemy-progress lines so coin block has room. */
  const fzLevelComplete = 76 * g;
  const swLevelComplete = Math.max(4, 4.2 * g);
  const fzSub = 40 * g;
  const swSub = Math.max(3, Math.round(3 * g * 1.4));
  const fzCoin = 72 * g;
  const swCoin = Math.max(4, 4 * g);

  if (!complete && total > 0) {
    ctx.font = `700 ${fzMain}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(
      ctx,
      `${remaining} / ${total}`,
      cw / 2,
      ch * 0.38,
      "rgba(0, 238, 255, 0.98)",
      swMain,
    );
    ctx.font = `600 ${fzMain * 0.72}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, "ENEMIES ALIVE", cw / 2, ch * 0.52, "rgba(200, 235, 255, 0.95)", swSub);
    return;
  }

  ctx.font = `700 ${fzLevelComplete}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(
    ctx,
    "LEVEL COMPLETE",
    cw / 2,
    ch * 0.34,
    "rgba(130, 255, 210, 0.98)",
    swLevelComplete,
  );

  ctx.font = `500 ${fzSub}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(ctx, "COIN GAINED:", cw / 2, ch * 0.5, "rgba(190, 220, 240, 0.92)", swSub);

  const coinLabel = String(Math.max(0, Math.floor(coinGained)));
  const yCoin = ch * 0.66;
  const coinImg = cachedBannerCoinIcon;
  const iconSize = 64 * g;
  ctx.font = `700 ${fzCoin}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  const tw = ctx.measureText(coinLabel).width;
  const gap = 16 * g;
  const totalW = (coinImg ? iconSize + gap : 0) + tw;
  let xLeft = cw / 2 - totalW / 2;
  if (coinImg) {
    ctx.drawImage(coinImg, xLeft, yCoin - iconSize / 2, iconSize, iconSize);
    xLeft += iconSize + gap;
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  strokeThenFillText(ctx, coinLabel, xLeft, yCoin, "rgba(255, 230, 120, 0.98)", swCoin);
}

/**
 * Side-profile cycle silhouette tinted with player neon (SVG is dark grey).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} dx
 * @param {number} dy
 * @param {number} dw
 * @param {number} dh
 * @param {string} tintHex
 */
function drawTintedCycleProfile(ctx, img, dx, dy, dw, dh, tintHex) {
  ctx.save();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = tintHex;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} fillStyle
 * @param {number} [strokeWidth]
 */
function strokeThenFillText(ctx, text, x, y, fillStyle, strokeWidth = 3) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
  ctx.lineWidth = strokeWidth;
  ctx.fillStyle = fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cw
 * @param {number} ch
 */
/**
 * @param {number} [uiScale] — use {@link GATE_UI_SCALE} for gate boards (thicker frame stroke)
 */
function drawBillboardFrameCrisp(ctx, cw, ch, uiScale = 1) {
  const m = Math.max(10, Math.round(10 * uiScale));
  const lw = Math.max(4, Math.round(4 * Math.min(uiScale, 2.5)));
  ctx.fillStyle = "rgba(4, 10, 18, 0.97)";
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "rgba(0, 200, 220, 0.65)";
  ctx.lineWidth = lw;
  ctx.strokeRect(m, m, cw - m * 2, ch - m * 2);
}

/**
 * @param {Record<string, unknown>[]} validLevels
 */
function getCampaignArenaStats(validLevels) {
  let arenaCount = 0;
  let maxCampaignIndex = 0;
  for (const L of validLevels) {
    if (!L || typeof L !== "object") continue;
    const idx = parseCampaignLevelIndex(/** @type {Record<string, unknown>} */ (L));
    if (Number.isFinite(idx) && idx >= 1) {
      arenaCount += 1;
      maxCampaignIndex = Math.max(maxCampaignIndex, idx);
    }
  }
  return { arenaCount, maxCampaignIndex };
}

/**
 * @param {THREE.MeshBasicMaterial | THREE.MeshStandardMaterial} mat
 * @param {THREE.BufferGeometry} geo
 */
function disposeBanner(mat, geo, tex) {
  tex.dispose();
  mat.dispose();
  geo.dispose();
}

/**
 * @param {THREE.Group} barrierGroup
 * @param {{ x: number; z: number; width?: number; depth?: number; rotation?: number; banner?: { kind: string } }} b
 * @param {number} w
 * @param {number} d
 * @param {number} tallH
 * @param {ReturnType<import('../config.js').getArenaPlaytestConfig>} playCfg
 * @returns {LobbyBannerController | null}
 */
export function attachBuildingBannerPlane(barrierGroup, b, w, d, tallH, playCfg) {
  void playCfg;
  const kindRaw = b.banner?.kind;
  if (kindRaw !== "lobby_progress" && kindRaw !== "lobby_garage") return null;

  const kind = /** @type {"lobby_progress" | "lobby_garage"} */ (kindRaw);
  const rotY = b.rotation ?? 0;
  const ax = Math.cos(rotY);
  const az = Math.sin(rotY);
  const axisX = new THREE.Vector3(ax, 0, az);
  const axisZ = new THREE.Vector3(-az, 0, ax);
  const halfW = w * 0.5;
  const halfD = d * 0.5;

  const toOrigin = new THREE.Vector3(-b.x, 0, -b.z);
  if (toOrigin.lengthSq() < 1e-6) toOrigin.set(0, 0, 1);
  toOrigin.normalize();

  const n = toOrigin;
  const extent = halfW * Math.abs(axisX.dot(n)) + halfD * Math.abs(axisZ.dot(n));
  const eps = 0.07;
  const midY = tallH * 0.62;
  const center = new THREE.Vector3(b.x, midY, b.z);
  const planePos = center.clone().add(n.clone().multiplyScalar(extent + eps));

  const pw = Math.max(2.5, w * 0.86);
  const ph = Math.max(1.2, tallH * 0.42);
  const geo = new THREE.PlaneGeometry(pw, ph);

  const canvas = document.createElement("canvas");
  canvas.width = BUILDING_CANVAS_W;
  canvas.height = BUILDING_CANVAS_H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return null;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(planePos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  mesh.name = `building-banner:${kind}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  barrierGroup.add(mesh);

  /** @type {LobbyBannerController} */
  const ctrl = {
    kind,
    placement: /** @type {const} */ ("building"),
    texture: tex,
    canvas,
    ctx,
    material: mat,
    mesh,
    _fingerprint: "",
    dispose() {
      disposeBanner(mat, geo, tex);
    },
  };
  return ctrl;
}

/** Static gate board copy — bump if multiplayer banner art changes. */
const FINGERPRINT_LOBBY_MULTIPLAYER = "lobby_multiplayer:v2";
const FINGERPRINT_LOBBY_VIBEJAM = "lobby_vibejam:v1";

/**
 * Big board above a lobby gate (arena / garage / multiplayer placeholder).
 * @param {THREE.Group} gateGroup
 * @param {{ gateWidth: number; archHeight: number; pillarD: number }} dims
 * @param {"lobby_progress"|"lobby_garage"|"lobby_multiplayer"|"lobby_vibejam"|"lobby_daily"} bannerKind
 * @param {"north"|"south"|"east"|"west"|undefined} [wallEdge] — east/west gates need a Y flip so the plane faces into the arena (otherwise text is mirrored)
 * @returns {LobbyBannerController | null}
 */
export function attachLobbyGateBannerBoard(gateGroup, dims, bannerKind, wallEdge) {
  const { gateWidth: gw, archHeight: ah, pillarD } = dims;
  const canvas = document.createElement("canvas");
  canvas.width = GATE_CANVAS_W;
  canvas.height = GATE_CANVAS_H;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  if (!ctx) return null;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const bw = Math.max(6, gw * 2.55) * GATE_WORLD_SCALE;
  const bh = Math.max(2.2, gw * 0.98) * GATE_WORLD_SCALE;
  const geo = new THREE.PlaneGeometry(bw, bh);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, ah + bh * 0.5 + 0.35 * GATE_WORLD_SCALE, pillarD / 2 + 0.1);
  if (wallEdge === "east" || wallEdge === "west") {
    /* East/west gates: banner plane faces into lobby; multiplayer west gate parent is flipped π (gates.js). */
    mesh.rotation.y =
      bannerKind === "lobby_multiplayer" && wallEdge === "west" ? 0 : Math.PI;
  }
  mesh.name = `lobby-gate-banner:${bannerKind}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  gateGroup.add(mesh);

  /** @type {LobbyBannerController} */
  const ctrl = {
    kind: bannerKind,
    placement: /** @type {const} */ ("gate"),
    texture: tex,
    canvas,
    ctx,
    material: mat,
    mesh,
    _fingerprint: "",
    dispose() {
      disposeBanner(mat, geo, tex);
    },
  };
  if (bannerKind === "lobby_multiplayer") {
    redrawMultiplayerComingSoonBanner(ctrl);
    ctrl._fingerprint = FINGERPRINT_LOBBY_MULTIPLAYER;
    tex.needsUpdate = true;
  } else if (bannerKind === "lobby_vibejam") {
    redrawVibeJamPortalBanner(ctrl);
    ctrl._fingerprint = FINGERPRINT_LOBBY_VIBEJAM;
    tex.needsUpdate = true;
  } else if (bannerKind === "lobby_daily") {
    redrawDailyLobbyBanner(ctrl, { state: "no_map", displayName: "", ymd: "" });
    ctrl._fingerprint = "";
    tex.needsUpdate = true;
  }
  return ctrl;
}

/**
 * @param {LobbyBannerController} c
 * @param {{ state: "no_map" | "play" | "cleared"; displayName: string; ymd: string }} snap
 */
export function redrawDailyLobbyBanner(c, snap) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = GATE_UI_SCALE;
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fz = 80 * g;
  const sw = Math.max(4, 4.2 * g);
  const fzSub = 50 * g;
  ctx.font = `700 ${fz}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(ctx, "DAILY ARENA", cw / 2, ch * 0.3, "rgba(130, 255, 210, 0.98)", sw);
  if (snap.state === "no_map") {
    ctx.font = `600 ${fzSub}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(
      ctx,
      "NO ARENAS TODAY",
      cw / 2,
      ch * 0.5,
      "rgba(200, 235, 255, 0.95)",
      Math.max(3, 3 * g),
    );
    ctx.font = `500 ${fzSub * 0.75}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, "Come back tomorrow", cw / 2, ch * 0.7, "rgba(180, 200, 220, 0.88)", Math.max(2, 2.5 * g));
  } else if (snap.state === "play") {
    const line = snap.displayName || "Challenge";
    ctx.font = `600 ${Math.min(fzSub * 1.1, 120 * g)}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, line, cw / 2, ch * 0.52, "rgba(0, 238, 255, 0.95)", Math.max(3, 3 * g));
  } else {
    ctx.font = `500 ${fzSub * 0.88}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(
      ctx,
      "Come back tomorrow",
      cw / 2,
      ch * 0.58,
      "rgba(200, 220, 240, 0.92)",
      Math.max(2, 2.5 * g),
    );
  }
}

/**
 * @param {LobbyBannerController} c
 */
function redrawVibeJamPortalBanner(c) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = GATE_UI_SCALE;
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fz = 96 * g;
  const sw = Math.max(5, 5 * g);
  ctx.font = `700 ${fz}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(ctx, "VIBE JAM", cw / 2, ch * 0.4, "rgba(130, 255, 210, 0.98)", sw);
  const fz2 = 72 * g;
  ctx.font = `700 ${fz2}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(ctx, "PORTAL", cw / 2, ch * 0.62, "rgba(200, 235, 255, 0.96)", Math.max(4, 4 * g));
}

/**
 * @param {LobbyBannerController} c
 */
function redrawMultiplayerComingSoonBanner(c) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = GATE_UI_SCALE;
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  /** Smaller than arena banner — avoids clipping behind stadium rim geometry at shallow angles. */
  const fz = 72 * g;
  const sw = Math.max(4, 4 * g);
  ctx.font = `700 ${fz}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(
    ctx,
    "COMING SOON",
    cw / 2,
    ch * 0.48,
    "rgba(200, 235, 255, 0.98)",
    sw,
  );
}

/**
 * @param {LobbyBannerController} c
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {Record<string, unknown>[]} validLevels
 */
function redrawProgressBanner(c, save, validLevels) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = c.placement === "gate" ? GATE_UI_SCALE : 1;
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);

  const cur = Math.max(1, Math.floor(save.progress.currentLevel));
  const { maxCampaignIndex } = getCampaignArenaStats(validLevels);
  const complete = cur > maxCampaignIndex && maxCampaignIndex > 0;
  const next = !complete ? findCampaignLevelByCampaignIndex(validLevels, cur) : null;
  const nextName =
    next && typeof next.name === "string" && next.name.trim()
      ? next.name.trim()
      : complete
        ? "ALL ARENAS CLEARED"
        : "—";

  const y1 = 130 * g;
  const y2 = 300 * g;
  const y3 = 500 * g;
  const fzTitle = 56 * g;
  const fzMid = 108 * g;
  /** Next-level name — larger on gate boards. */
  const fzSub = 42 * g * (c.placement === "gate" ? 1.7 : 1);
  const swTitle = Math.max(4, 4 * g);
  const swMid = Math.max(5, 5 * g);
  const swSub = Math.max(3, Math.round(3 * g * (c.placement === "gate" ? 1.4 : 1)));

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${fzTitle}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  strokeThenFillText(ctx, "ARENA", cw / 2, y1, "rgba(200, 248, 255, 0.98)", swTitle);

  ctx.font = `700 ${fzMid}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
  const mid = complete ? "COMPLETE" : `${cur} of ${Math.max(1, maxCampaignIndex)}`;
  strokeThenFillText(
    ctx,
    mid,
    cw / 2,
    y2,
    complete ? "rgba(130, 255, 210, 0.98)" : "rgba(0, 238, 255, 0.98)",
    swMid,
  );

  if (!complete) {
    ctx.font = `500 ${fzSub}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    const sub = nextName;
    strokeThenFillText(ctx, sub, cw / 2, y3, "rgba(190, 225, 240, 0.95)", swSub);
  }
}

/**
 * @param {LobbyBannerController} c
 * @param {import("../data/savedata.js").PlayerSave} save
 */
function redrawGarageBanner(c, save) {
  const { ctx, canvas } = c;
  const cw = canvas.width;
  const ch = canvas.height;
  const g = c.placement === "gate" ? GATE_UI_SCALE : 1;
  const gateBoard = c.placement === "gate";
  const gatePad = 48 * g;
  const gateSwatch = 72 * g;
  ctx.clearRect(0, 0, cw, ch);
  drawBillboardFrameCrisp(ctx, cw, ch, g);

  if (gateBoard) {
    const hex = sanitizeNeonHex(save.player.cycleColor);
    const coins = save.progress.coins;
    const margin = gatePad;
    const sw = gateSwatch;
    const iconGap = 14 * g;
    const cycleProf = cachedBannerCycleProfile;
    const cycleAspect = 240 / 72;
    let swatchX = margin;
    if (cycleProf) {
      const cycleDh = sw;
      const cycleDw = cycleDh * cycleAspect;
      drawTintedCycleProfile(ctx, cycleProf, margin, margin, cycleDw, cycleDh, hex);
      swatchX = margin + cycleDw + iconGap;
    }
    ctx.fillStyle = hex;
    ctx.fillRect(swatchX, margin, sw, sw);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(3, 3 * g);
    ctx.strokeRect(swatchX, margin, sw, sw);

    const coinLabel = String(coins);
    const textY = margin + sw * 0.5;
    const rightX = cw - margin;
    const swStroke = Math.max(4, 4 * g);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${46 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    const coinTw = ctx.measureText(coinLabel).width;
    const coinImg = cachedBannerCoinIcon;
    const coinIconSize = sw * 0.92;
    if (coinImg) {
      const textLeft = rightX - coinTw - swStroke * 2;
      const iconLeft = textLeft - iconGap - coinIconSize;
      ctx.drawImage(coinImg, iconLeft, textY - coinIconSize / 2, coinIconSize, coinIconSize);
    }
    strokeThenFillText(ctx, coinLabel, rightX, textY, "rgba(255, 230, 120, 0.98)", swStroke);
  }

  if (!gateBoard) {
    const hex = sanitizeNeonHex(save.player.cycleColor);
    const coins = save.progress.coins;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${52 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, "GARAGE", cw / 2, 72 * g, "rgba(200, 248, 255, 0.98)", Math.max(4, 4 * g));

    const swatch = 64 * g;
    const sx = cw / 2 - 200 * g;
    const sy = 165 * g;
    ctx.fillStyle = hex;
    ctx.fillRect(sx, sy - swatch / 2, swatch, swatch);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = Math.max(3, 3 * g);
    ctx.strokeRect(sx, sy - swatch / 2, swatch, swatch);

    ctx.textAlign = "left";
    ctx.font = `600 ${38 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, hex.toUpperCase(), sx + swatch + 24 * g, sy, "rgba(230, 245, 255, 0.96)", Math.max(3, 3 * g));

    ctx.textAlign = "center";
    ctx.font = `700 ${46 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, `NEON  ${coins}`, cw / 2, 248 * g, "rgba(255, 230, 120, 0.98)", Math.max(4, 4 * g));
  }

  const rowTop = gateBoard ? gatePad + gateSwatch + 36 * g : 310 * g;
  const rowPad = 36 * g;
  const rowH = Math.floor((ch - rowTop - rowPad) / GARAGE_ATTR_KEYS.length);
  let y = rowTop + rowH * 0.52;

  const labelX = 56 * g;
  const barX = 200 * g;
  const fracPad = 48 * g;
  const barWRight = gateBoard ? 200 * g : 280 * g;

  for (const key of GARAGE_ATTR_KEYS) {
    const { cur, max } = garageAttrScale(key, save);
    const curPct = Math.min(100, Math.max(0, (cur / max) * 100));
    const label = GARAGE_ATTR_SHORT[/** @type {keyof typeof GARAGE_ATTR_SHORT} */ (key)];
    const frac = gateBoard ? garageBannerCurrentOnly(key, cur) : formatGarageAttrFraction(key, cur, max);

    const barW = cw - barX - barWRight;
    const barH = Math.max(14 * g, rowH - 18 * g);
    const barY = y - barH / 2;

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${30 * g}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, label, labelX, y, "rgba(200, 230, 245, 0.94)", Math.max(2, 2 * g));

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = Math.max(2, 2 * g);
    ctx.strokeRect(barX, barY, barW, barH);

    const fillW = (barW * curPct) / 100;
    ctx.fillStyle = "#2b2b36";
    ctx.fillRect(barX, barY, fillW, barH);
    ctx.strokeStyle = "rgba(0, 232, 255, 0.35)";
    if (fillW > 1) {
      ctx.beginPath();
      ctx.rect(barX, barY, fillW, barH);
      ctx.stroke();
    }

    ctx.textAlign = "right";
    const fzVal = gateBoard ? 34 * g : 26 * g;
    ctx.font = `500 ${fzVal}px "Orbitron", "Segoe UI", system-ui, sans-serif`;
    strokeThenFillText(ctx, frac, cw - fracPad, y, "rgba(180, 215, 235, 0.9)", Math.max(2, 2 * g));

    y += rowH;
  }
}

/**
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {Record<string, unknown>[]} validLevels
 */
function fingerprintProgress(save, validLevels) {
  const cur = save.progress.currentLevel;
  const { maxCampaignIndex } = getCampaignArenaStats(validLevels);
  const complete = cur > maxCampaignIndex && maxCampaignIndex > 0;
  const next = !complete ? findCampaignLevelByCampaignIndex(validLevels, cur) : null;
  const name = next && typeof next.name === "string" ? next.name : "";
  return `p:${cur}|${maxCampaignIndex}|${complete ? 1 : 0}|${name}`;
}

/**
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {"gate"|"building"} placement
 */
function fingerprintGarage(save, placement) {
  const color = sanitizeNeonHex(save.player.cycleColor);
  const coins = save.progress.coins;
  let s =
    placement === "building"
      ? `${save.player.cycleColor}|${coins}`
      : `${color}|${coins}|i${bannerGateIconAssetVersion}`;
  for (const key of GARAGE_ATTR_KEYS) {
    const { cur, max } = garageAttrScale(key, save);
    s += `|${key}:${cur}:${max}`;
  }
  return s;
}

/**
 * @param {LobbyBannerController[] | undefined} controllers
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {Record<string, unknown>[]} validLevels
 * @param {{ ymd: string; state: "no_map" | "play" | "cleared"; displayName: string } | null | undefined} [dailySnap] — when null/undefined, daily boards are skipped
 */
export function tickLobbyBannerControllers(controllers, save, validLevels, dailySnap) {
  if (!controllers || controllers.length === 0) return;
  for (const c of controllers) {
    if (c.kind === "campaign_exit") continue;
    if (c.kind === "lobby_daily") {
      if (!dailySnap) continue;
      const fp = `lobby_daily_${dailySnap.ymd}|${dailySnap.state}|${dailySnap.displayName}`;
      if (fp === c._fingerprint) continue;
      c._fingerprint = fp;
      redrawDailyLobbyBanner(c, {
        state: dailySnap.state,
        displayName: dailySnap.displayName,
        ymd: dailySnap.ymd,
      });
      c.texture.needsUpdate = true;
      continue;
    }
    const fp =
      c.kind === "lobby_multiplayer"
        ? FINGERPRINT_LOBBY_MULTIPLAYER
        : c.kind === "lobby_vibejam"
          ? FINGERPRINT_LOBBY_VIBEJAM
          : c.kind === "lobby_progress"
            ? fingerprintProgress(save, validLevels)
            : fingerprintGarage(save, c.placement === "gate" ? "gate" : "building");
    if (fp === c._fingerprint) continue;
    c._fingerprint = fp;
    if (c.kind === "lobby_multiplayer") redrawMultiplayerComingSoonBanner(c);
    else if (c.kind === "lobby_vibejam") redrawVibeJamPortalBanner(c);
    else if (c.kind === "lobby_progress") redrawProgressBanner(c, save, validLevels);
    else redrawGarageBanner(c, save);
    c.texture.needsUpdate = true;
  }
}

/**
 * @typedef {object} LobbyBannerController
 * @property {"lobby_progress"|"lobby_garage"|"lobby_multiplayer"|"lobby_vibejam"|"lobby_daily"|"campaign_exit"} kind
 * @property {"gate"|"building"} placement
 * @property {THREE.CanvasTexture} texture
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {THREE.MeshBasicMaterial|THREE.MeshStandardMaterial} material
 * @property {THREE.Mesh} mesh
 * @property {string} _fingerprint
 * @property {() => void} dispose
 */
