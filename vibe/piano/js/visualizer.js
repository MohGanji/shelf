import { WHITE_KEYS, BLACK_KEYS, isBlack, MIDI_TO_LABEL } from "./keyboard.js";

const COLORS = {
  bg: "#070b12",
  lane: "rgba(255,255,255,0.025)",
  hitline: "rgba(140,190,255,0.35)",
  whiteNote: "#3fa9ff",
  blackNote: "#2fe6a0",
  hitNote: "rgba(255,255,255,0.9)",
  missNote: "rgba(255,80,80,0.45)",
};

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.lookahead = 3.2; // seconds of travel from top to hitline
    this.dpr = 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.w = rect.width;
    this.h = rect.height;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.layout();
  }

  layout() {
    this.pianoH = Math.min(this.h * 0.26, 180);
    this.hitY = this.h - this.pianoH;
    this.pps = this.hitY / this.lookahead;

    const whiteW = this.w / WHITE_KEYS.length;
    this.keyRects = new Map();
    WHITE_KEYS.forEach((k, i) => {
      this.keyRects.set(k.m, {
        x: i * whiteW, y: this.hitY, w: whiteW, h: this.pianoH, black: false,
      });
    });
    const blackW = whiteW * 0.58;
    for (const k of BLACK_KEYS) {
      // a black key sits on the boundary after its lower white neighbour
      const below = this.keyRects.get(k.m - 1);
      this.keyRects.set(k.m, {
        x: below.x + below.w - blackW / 2, y: this.hitY,
        w: blackW, h: this.pianoH * 0.62, black: true,
      });
    }
  }

  keyAt(x, y) {
    for (const k of BLACK_KEYS) {
      const r = this.keyRects.get(k.m);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k.m;
    }
    for (const k of WHITE_KEYS) {
      const r = this.keyRects.get(k.m);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return k.m;
    }
    return null;
  }

  draw(state) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // faint lane stripes on white-key columns (every other)
    WHITE_KEYS.forEach((k, i) => {
      if (i % 2 === 0) return;
      const r = this.keyRects.get(k.m);
      ctx.fillStyle = COLORS.lane;
      ctx.fillRect(r.x, 0, r.w, this.hitY);
    });

    this.drawNotes(state);
    this.drawHitline();
    this.drawPiano(state);
    this.drawFloaters(state);
  }

  drawNotes(state) {
    const { ctx } = this;
    const t = state.time;
    for (const n of state.notes) {
      const yBottom = this.hitY - (n.start - t) * this.pps;
      const height = Math.max(n.dur * this.pps, 8);
      const yTop = yBottom - height;
      if (yBottom < -10 || yTop > this.hitY + 4) continue;

      const r = this.keyRects.get(n.m);
      if (!r) continue;
      const pad = r.black ? 2 : 7;
      const x = r.x + pad;
      const w = r.w - pad * 2;

      const ns = state.noteState ? state.noteState.get(n.id) : null;
      const sounding = t >= n.start && t <= n.start + n.dur;
      let color = r.black ? COLORS.blackNote : COLORS.whiteNote;
      let alpha = 0.92;
      if (ns) {
        if (ns.status === "hit") { color = r.black ? "#9affd9" : "#a8d8ff"; alpha = 0.55; }
        else if (ns.status === "miss") { color = COLORS.missNote; alpha = 0.8; }
      }

      // inset top and bottom a touch so back-to-back repeats of the same
      // note read as separate bars
      const passedLine = yBottom > this.hitY;
      const top = yTop + 2;
      const clipBottom = Math.min(yBottom - (passedLine ? 0 : 2), this.hitY);
      const h = clipBottom - top;
      if (h <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = sounding ? 22 : 10;
      if (ns || h < 12) {
        ctx.fillStyle = color;
      } else {
        // brighter leading (bottom) edge gives the bar a sense of direction
        const grad = ctx.createLinearGradient(0, top, 0, clipBottom);
        grad.addColorStop(0, color);
        grad.addColorStop(0.75, color);
        grad.addColorStop(1, r.black ? "#9cffd9" : "#a5dcff");
        ctx.fillStyle = grad;
      }
      const radius = r.black ? 5 : 7;
      roundRect(ctx, x, top, w, h, radius);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, top, w, h, radius);
      ctx.stroke();
      ctx.restore();

      // key letter on the note so you know what to press
      if (state.showLabels && h > 16) {
        ctx.fillStyle = "rgba(5,10,18,0.85)";
        ctx.font = `600 ${r.black ? 11 : 13}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(MIDI_TO_LABEL.get(n.m), x + w / 2, Math.min(clipBottom - 11, yTop + h - 11));
      }
    }
  }

  drawHitline() {
    const { ctx } = this;
    ctx.strokeStyle = COLORS.hitline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, this.hitY - 0.5);
    ctx.lineTo(this.w, this.hitY - 0.5);
    ctx.stroke();
  }

  drawPiano(state) {
    const { ctx } = this;
    const pressed = state.pressed || new Set();
    const lit = state.lit || new Set();

    for (const k of WHITE_KEYS) {
      const r = this.keyRects.get(k.m);
      const on = pressed.has(k.m) || lit.has(k.m);
      ctx.fillStyle = on ? "#bfe3ff" : "#e8eaee";
      roundRect(ctx, r.x + 1, r.y, r.w - 2, r.h - 2, 5, true);
      ctx.fill();
      if (on) {
        ctx.save();
        ctx.shadowColor = COLORS.whiteNote;
        ctx.shadowBlur = 24;
        ctx.fillStyle = "rgba(63,169,255,0.45)";
        roundRect(ctx, r.x + 1, r.y, r.w - 2, r.h - 2, 5, true);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "rgba(20,30,45,0.55)";
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(k.label, r.x + r.w / 2, r.y + r.h - 12);
    }

    for (const k of BLACK_KEYS) {
      const r = this.keyRects.get(k.m);
      const on = pressed.has(k.m) || lit.has(k.m);
      ctx.fillStyle = on ? "#1f7a5c" : "#14181f";
      roundRect(ctx, r.x, r.y, r.w, r.h, 4, true);
      ctx.fill();
      if (on) {
        ctx.save();
        ctx.shadowColor = COLORS.blackNote;
        ctx.shadowBlur = 20;
        ctx.fillStyle = "rgba(47,230,160,0.5)";
        roundRect(ctx, r.x, r.y, r.w, r.h, 4, true);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "600 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(k.label, r.x + r.w / 2, r.y + r.h - 9);
    }
  }

  drawFloaters(state) {
    if (!state.floaters) return;
    const { ctx } = this;
    const now = state.time;
    for (const f of state.floaters) {
      const age = now - f.at;
      if (age < 0 || age > 0.8) continue;
      const a = 1 - age / 0.8;
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = "700 15px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, this.hitY - 26 - age * 44);
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(ctx, x, y, w, h, r, bottomOnly = false) {
  ctx.beginPath();
  if (bottomOnly) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.closePath();
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
