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
 * @property {{ x: number; z: number }[]} itemPoints — power-ups, boost pads, portals (hollow circles)
 */

const TMP = new Vec3();
const TMP2 = new Vec3();

/**
 * Axis-aligned footprint on XZ for a static cannon box (handles rotation).
 * @param {import("cannon-es").Body} body
 * @returns {{ minX: number; maxX: number; minZ: number; maxZ: number } | null}
 */
export function barrierFootprintXZ(body) {
  const sh = body.shapes[0];
  if (!(sh instanceof Box)) return null;
  const he = sh.halfExtents;
  const q = body.quaternion;
  const o = body.position;
  const corners = [
    [-he.x, -he.z],
    [he.x, -he.z],
    [he.x, he.z],
    [-he.x, he.z],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    TMP.set(lx, 0, lz);
    q.vmult(TMP, TMP2);
    const wx = o.x + TMP2.x;
    const wz = o.z + TMP2.z;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * P9.4 — corner minimap: arena aspect, trails as colored lines, barriers as squares, items as hollow circles.
 * @param {HTMLCanvasElement | null} canvas
 * @returns {{ draw: (frame: MinimapFrame) => void; dispose: () => void }}
 */
export function createArenaMinimapRenderer(canvas) {
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

      const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
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
       * World XZ → canvas; +Z is top (north-up). Mirror horizontal so east/west match the chase camera
       * (otherwise left/right on the minimap feel inverted vs the 3D view).
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
          const fp = barrierFootprintXZ(b);
          if (!fp) continue;
          const [x0, y0] = toCanvas(fp.minX, fp.minZ);
          const [x1, y1] = toCanvas(fp.maxX, fp.maxZ);
          const left = Math.min(x0, x1);
          const top = Math.min(y0, y1);
          const w = Math.abs(x1 - x0);
          const h = Math.abs(y1 - y0);
          if (w < 0.5 && h < 0.5) continue;
          ctx.fillRect(left, top, Math.max(w, 1), Math.max(h, 1));
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

      ctx.strokeStyle = "rgba(160, 255, 240, 0.75)";
      ctx.lineWidth = 1;
      for (const p of frame.itemPoints) {
        const [cx, cy] = toCanvas(p.x, p.z);
        ctx.beginPath();
        ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
        ctx.stroke();
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
