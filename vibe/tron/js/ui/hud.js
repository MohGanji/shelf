/**
 * In-game HUD (plan `ui/hud.js`) — speed, nitro, trail, timer, equip, minimap. Wired in H1.
 */

import { Box, Vec3 } from "../vendor/cannon-es-module.js";

/**
 * @typedef {{ dispose(): void }} HudController
 */

/**
 * @typedef {object} MinimapTrailSource
 * @property {string} color — CSS `#rrggbb`
 * @property {() => { ax: number; az: number; bx: number; bz: number }[]} getSegments
 */

/**
 * @typedef {object} MinimapFrame
 * @property {number} arenaWidth
 * @property {number} arenaDepth
 * @property {number} playerX
 * @property {number} playerZ
 * @property {string} playerColor
 * @property {{ x: number; z: number; color: string }[]} enemies
 * @property {MinimapTrailSource[]} trailSources
 * @property {import("cannon-es").Body[] | undefined} barrierBodies
 * @property {{ x0: number; x1: number; z0: number; z1: number; role: string; open: boolean }[]} [gates]
 * @property {{ x0: number; x1: number; z0: number; z1: number; color: string }[]} [boostPadRects] — world XZ AABBs, filled
 * @property {{ x: number; z: number; kind?: 'pickup' | 'portal' }[]} itemPoints — power-ups vs portals (distinct glyphs)
 */

const TMP = new Vec3();
const TMP2 = new Vec3();

/**
 * Rotated XZ corners for a static cannon box.
 * @param {import("cannon-es").Body} body
 * @returns {{ x: number; z: number }[] | null}
 */
export function barrierCornersXZ(body) {
  const minimapCorners = body.userData?.minimapCornersXZ;
  if (Array.isArray(minimapCorners) && minimapCorners.length >= 3) {
    const out = [];
    for (const p of minimapCorners) {
      if (!p || typeof p.x !== "number" || typeof p.z !== "number") return null;
      out.push({ x: p.x, z: p.z });
    }
    return out;
  }
  const sh = body.shapes[0];
  if (!(sh instanceof Box)) return null;
  const he = sh.halfExtents;
  const q = body.quaternion;
  const o = body.position;
  const localCorners = [
    [-he.x, -he.z],
    [he.x, -he.z],
    [he.x, he.z],
    [-he.x, he.z],
  ];
  const corners = [];
  for (const [lx, lz] of localCorners) {
    TMP.set(lx, 0, lz);
    q.vmult(TMP, TMP2);
    corners.push({ x: o.x + TMP2.x, z: o.z + TMP2.z });
  }
  return corners;
}

/**
 * Axis-aligned footprint on XZ for a static cannon box (handles rotation).
 * @param {import("cannon-es").Body} body
 * @returns {{ minX: number; maxX: number; minZ: number; maxZ: number } | null}
 */
export function barrierFootprintXZ(body) {
  const corners = barrierCornersXZ(body);
  if (!corners) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * P9.4 — corner minimap: arena aspect, trails as lines, barriers as filled polys, boost pads as filled neon rects, pickups/portals as glyphs (no text legend).
 * @param {HTMLCanvasElement | null} canvas
 * @param {{ internalScale?: number }} [opts] — multiply backing-store resolution (non-low graphics profile)
 * @returns {{ draw: (frame: MinimapFrame) => void; dispose: () => void }}
 */
export function createArenaMinimapRenderer(canvas, opts = {}) {
  if (!canvas) {
    return {
      draw() {},
      dispose() {},
    };
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      draw() {},
      dispose() {},
    };
  }

  const internalScale =
    typeof opts.internalScale === "number" && Number.isFinite(opts.internalScale)
      ? Math.max(1, Math.min(2, opts.internalScale))
      : 1;

  let lastAw = 0;
  let lastAd = 0;
  let lastCssW = 0;
  let lastCssH = 0;
  let lastDpr = 0;

  return {
    /**
     * @param {MinimapFrame} frame
     */
    draw(frame) {
      const { arenaWidth, arenaDepth } = frame;
      if (!Number.isFinite(arenaWidth) || !Number.isFinite(arenaDepth) || arenaWidth <= 0 || arenaDepth <= 0) {
        return;
      }

      const dpr =
        typeof window !== "undefined"
          ? Math.min(2, (window.devicePixelRatio || 1) * internalScale)
          : internalScale;
      const cssW = arenaWidth >= arenaDepth ? 152 : Math.round(152 * (arenaWidth / arenaDepth));
      const cssH = arenaDepth > arenaWidth ? 152 : Math.round(152 * (arenaDepth / arenaWidth));
      if (lastAw !== arenaWidth || lastAd !== arenaDepth) {
        lastAw = arenaWidth;
        lastAd = arenaDepth;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }
      if (cssW !== lastCssW || cssH !== lastCssH || dpr !== lastDpr) {
        lastCssW = cssW;
        lastCssH = cssH;
        lastDpr = dpr;
        canvas.width = Math.max(32, Math.floor(cssW * dpr));
        canvas.height = Math.max(32, Math.floor(cssH * dpr));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const halfW = arenaWidth / 2;
      const halfD = arenaDepth / 2;
      const cw = cssW;
      const ch = cssH;

      /**
       * World XZ → canvas; +Z is top (north-up). Mirror X so live movement matches
       * the chase-camera steering feel: a left turn moves left on the minimap.
       * @param {number} wx
       * @param {number} wz
       */
      function toCanvas(wx, wz) {
        const u = cw - ((wx + halfW) / arenaWidth) * cw;
        const v = ch - ((wz + halfD) / arenaDepth) * ch;
        return [u, v];
      }

      ctx.fillStyle = "rgba(6, 14, 24, 0.92)";
      ctx.fillRect(0, 0, cw, ch);

      ctx.strokeStyle = "rgba(0, 220, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1);

      const barriers = frame.barrierBodies;
      if (barriers && barriers.length > 0) {
        ctx.fillStyle = "rgba(200, 210, 220, 0.42)";
        for (const b of barriers) {
          if (!b || b.mass !== 0) continue;
          const corners = barrierCornersXZ(b);
          if (!corners) continue;
          const pts = corners.map((c) => toCanvas(c.x, c.z));
          const minX = Math.min(...pts.map((p) => p[0]));
          const maxX = Math.max(...pts.map((p) => p[0]));
          const minY = Math.min(...pts.map((p) => p[1]));
          const maxY = Math.max(...pts.map((p) => p[1]));
          if (maxX - minX < 0.5 && maxY - minY < 0.5) continue;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0], pts[i][1]);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      const boostPads = frame.boostPadRects;
      if (boostPads && boostPads.length > 0) {
        for (const bp of boostPads) {
          const uvs = [
            toCanvas(bp.x0, bp.z0),
            toCanvas(bp.x1, bp.z0),
            toCanvas(bp.x0, bp.z1),
            toCanvas(bp.x1, bp.z1),
          ];
          const us = uvs.map((p) => p[0]);
          const vs = uvs.map((p) => p[1]);
          const minU = Math.min(...us);
          const maxU = Math.max(...us);
          const minV = Math.min(...vs);
          const maxV = Math.max(...vs);
          const w = maxU - minU;
          const h = maxV - minV;
          if (w < 0.3 || h < 0.3) continue;
          const col = typeof bp.color === "string" && /^#([0-9a-fA-F]{6})$/.test(bp.color) ? bp.color : "#55eeff";
          const r = parseInt(col.slice(1, 3), 16);
          const g = parseInt(col.slice(3, 5), 16);
          const b = parseInt(col.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r},${g},${b},0.32)`;
          ctx.fillRect(minU, minV, w, h);
          ctx.strokeStyle = `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 50)},${Math.min(255, b + 40)},0.55)`;
          ctx.lineWidth = 1;
          ctx.strokeRect(minU + 0.5, minV + 0.5, w - 1, h - 1);
        }
      }

      if (frame.gates) {
        ctx.lineWidth = 2;
        for (const g of frame.gates) {
          const [cx0, cy0] = toCanvas(g.x0, g.z0);
          const [cx1, cy1] = toCanvas(g.x1, g.z1);
          ctx.strokeStyle = g.open ? "rgba(0, 255, 200, 0.9)" : "rgba(255, 60, 60, 0.8)";
          ctx.beginPath();
          ctx.moveTo(cx0, cy0);
          ctx.lineTo(cx1, cy1);
          ctx.stroke();
        }
      }

      for (const src of frame.trailSources) {
        const segs = src.getSegments();
        if (segs.length === 0) continue;
        ctx.strokeStyle = src.color;
        ctx.lineWidth = 1.25;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        for (const s of segs) {
          const [a0, a1] = toCanvas(s.ax, s.az);
          const [b0, b1] = toCanvas(s.bx, s.bz);
          ctx.moveTo(a0, a1);
          ctx.lineTo(b0, b1);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.lineWidth = 1;
      for (const p of frame.itemPoints ?? []) {
        const [cx, cy] = toCanvas(p.x, p.z);
        const kind = p.kind === "portal" ? "portal" : "pickup";
        if (kind === "portal") {
          ctx.strokeStyle = "rgba(255, 100, 255, 0.88)";
          ctx.beginPath();
          ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(255, 180, 255, 0.45)";
          ctx.beginPath();
          ctx.arc(cx, cy, 2.1, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const s = 2.85;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = "rgba(120, 255, 220, 0.88)";
          ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
          ctx.strokeStyle = "rgba(200, 255, 250, 0.55)";
          ctx.strokeRect(-s * 0.5, -s * 0.5, s, s);
          ctx.restore();
        }
      }

      function drawDot(wx, wz, fill, radius = 3) {
        const [cx, cy] = toCanvas(wx, wz);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const e of frame.enemies) {
        drawDot(e.x, e.z, e.color || "#ff6600", 2.8);
      }

      drawDot(frame.playerX, frame.playerZ, frame.playerColor || "#00ffff", 3.2);
    },
    dispose() {},
  };
}

/**
 * Placeholder mount for extended HUD controllers (kept for imports that expect this symbol).
 * @returns {HudController}
 */
export function createHudController() {
  return {
    dispose() {},
  };
}
