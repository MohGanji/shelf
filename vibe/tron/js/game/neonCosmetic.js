import * as THREE from "../vendor/three-module.js";

const DEFAULT_HEX = "#00ffff";

/** Chroma drift — full spectrum, synced across mesh. */
export const EXOTIC_PRISM = "neon:prism";

/** Multi-tone aurora: offset hues on strips / wheels (no true UV gradient). */
export const EXOTIC_AURORA = "neon:aurora";

const ALLOW = new Set([EXOTIC_PRISM, EXOTIC_AURORA]);

/**
 * @param {unknown} s
 * @returns {s is string}
 */
export function isExoticNeonToken(s) {
  return typeof s === "string" && ALLOW.has(s.trim());
}

/**
 * @param {string} raw
 * @param {string} [fallback]
 * @returns {string}
 */
function sanitizeHex6Only(raw, fallback = DEFAULT_HEX) {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  const h = s.startsWith("#") ? s.slice(1) : s;
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return fallback;
  return `#${full.toLowerCase()}`;
}

/**
 * Player cycle / trail cosmetic: exotic id or `#rrggbb`.
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function normalizePlayerNeonColor(raw, fallback = DEFAULT_HEX) {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  if (isExoticNeonToken(t)) return t;
  return sanitizeHex6Only(t, fallback);
}

/**
 * Owned-list entry: preserve exotic ids; normalize hex cosmetics.
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function normalizeCosmeticListEntry(raw, fallback = DEFAULT_HEX) {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  if (isExoticNeonToken(t)) return t;
  return sanitizeHex6Only(t, fallback);
}

/**
 * Representative CSS hex for HUD / minimap (exotic → fixed accent).
 * @param {unknown} raw
 * @returns {string}
 */
export function cosmeticColorToCssHex(raw) {
  const t = normalizePlayerNeonColor(String(raw ?? ""), DEFAULT_HEX);
  if (t === EXOTIC_PRISM) return "#00ffd0";
  if (t === EXOTIC_AURORA) return "#d040ff";
  return t.startsWith("#") ? t : DEFAULT_HEX;
}

/**
 * RGB packed int for particles / legacy call sites.
 * @param {unknown} raw
 * @returns {number}
 */
export function cosmeticColorToRgbInt(raw) {
  const css = cosmeticColorToCssHex(raw);
  const n = parseInt(css.slice(1), 16);
  return Number.isFinite(n) ? n : 0xffffff;
}

const _tmpA = new THREE.Color();
const _tmpB = new THREE.Color();

/**
 * Single emissive sample for trail segments (matches cycle read at `tSec`).
 * @param {string} token
 * @param {number} tSec
 * @param {THREE.Color} target
 */
export function writeExoticTrailEmissive(target, token, tSec) {
  if (token === EXOTIC_PRISM) {
    target.setHSL((tSec * 0.22) % 1, 0.92, 0.54);
    return;
  }
  if (token === EXOTIC_AURORA) {
    const h1 = (tSec * 0.06) % 1;
    const h2 = (h1 + 0.45) % 1;
    _tmpA.setHSL(h1, 0.9, 0.54);
    _tmpB.setHSL(h2, 0.88, 0.52);
    target.lerpColors(_tmpA, _tmpB, 0.5);
    return;
  }
  target.set(DEFAULT_HEX);
}

/**
 * Middle of aurora / prism for cycle `primary` seed and rim.
 * @param {string} token
 * @param {number} tSec
 * @param {THREE.Color} out
 */
export function writeExoticCyclePalettePrimary(out, token, tSec) {
  writeExoticTrailEmissive(out, token, tSec);
}
