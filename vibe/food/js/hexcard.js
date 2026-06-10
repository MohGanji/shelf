// SVG hex radar (FC player-card style) — supports one or two overlaid stat sets.
import { AXES } from "./score.js";

const TAU = Math.PI * 2;

function vertex(cx, cy, r, i) {
  const a = -TAU / 4 + (i * TAU) / 6; // start at top, clockwise
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function ring(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => vertex(cx, cy, r, i).map((v) => v.toFixed(1)).join(",")).join(" ");
}

function statPoly(cx, cy, r, scores) {
  return AXES.map(({ key }, i) => {
    const v = Math.max(scores[key], 3) / 99; // floor so zero stats still show a sliver
    return vertex(cx, cy, r * v, i).map((n) => n.toFixed(1)).join(",");
  }).join(" ");
}

// scores: primary stat set; scoresB: optional overlay (compare mode)
export function hexSVG(scores, scoresB = null, size = 280) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size / 2 - 44;
  const grid = [0.2, 0.4, 0.6, 0.8, 1]
    .map((f) => `<polygon class="hex-grid" points="${ring(cx, cy, r * f)}"/>`)
    .join("");
  const spokes = AXES.map((_, i) => {
    const [x, y] = vertex(cx, cy, r, i);
    return `<line class="hex-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join("");
  const labels = AXES.map(({ key }, i) => {
    const [x, y] = vertex(cx, cy, r + 26, i);
    const a = scores[key];
    const b = scoresB ? scoresB[key] : null;
    const val = scoresB
      ? `<tspan class="hex-val a">${a}</tspan><tspan class="hex-val-sep"> / </tspan><tspan class="hex-val b">${b}</tspan>`
      : `<tspan class="hex-val a">${a}</tspan>`;
    return `<text class="hex-label" x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${key}</text>
      <text class="hex-value" x="${x.toFixed(1)}" y="${(y + 10).toFixed(1)}" text-anchor="middle">${val}</text>`;
  }).join("");
  const polyB = scoresB ? `<polygon class="hex-stat b" points="${statPoly(cx, cy, r, scoresB)}"/>` : "";
  return `<svg class="hex-radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="nutrition hexagon">
    ${grid}${spokes}
    <polygon class="hex-stat a" points="${statPoly(cx, cy, r, scores)}"/>
    ${polyB}
    ${labels}
  </svg>`;
}

const CAT_ABBR = {
  vegetable: "VEG", fruit: "FRU", "dairy & eggs": "DAI", grains: "GRN",
  legumes: "LEG", "nuts & seeds": "NUT", meat: "MEA", seafood: "SEA",
  "fats & oils": "OIL", prepared: "PRE", beverages: "BEV",
  "herbs & spices": "HRB", sweets: "SWT", product: "PKG", meal: "MEAL", other: "OTH",
};

export function catAbbr(cat) {
  return CAT_ABBR[cat] || "OTH";
}

export function fmt(v, digits = 1) {
  if (v === undefined || v === null || Number.isNaN(v)) return "–";
  return Number(v).toFixed(digits).replace(/\.0$/, "");
}
