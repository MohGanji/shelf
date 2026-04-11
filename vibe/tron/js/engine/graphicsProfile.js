/**
 * Cross-browser performance defaults (P10.2): adaptive pixel ratio, cheaper bloom, HUD minimap cadence.
 * Override with URL: `?perf=low|medium|high` or `?dpr=1` (caps device pixel ratio).
 */

/** @typedef {'high' | 'medium' | 'low'} GraphicsTier */

/** @typedef {{ tier: GraphicsTier; maxPixelRatio: number; bloomResolutionScale: number; minimapMinIntervalMs: number }} GraphicsProfile */

/**
 * Safari desktop (not Chrome/Fx/Edge on iOS/macOS) — post stack + bloom tend to be heavier per pixel.
 */
function isLikelyDesktopSafari() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Opera/.test(ua);
}

/**
 * @returns {GraphicsTier}
 */
function detectTier() {
  if (typeof window === "undefined") return "high";
  const params = new URLSearchParams(window.location.search);
  const perf = params.get("perf");
  if (perf === "low" || perf === "medium" || perf === "high") return perf;

  let score = 0;
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) score += 2;
    if (window.matchMedia("(prefers-reduced-data: reduce)").matches) score += 2;
  } catch {
    /* ignore */
  }
  const mem = /** @type {Navigator & { deviceMemory?: number }} */ (navigator).deviceMemory;
  if (typeof mem === "number" && mem <= 4) score += 2;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4) {
    score += 1;
  }
  if (isLikelyDesktopSafari()) score += 1;

  if (score >= 4) return "low";
  if (score >= 2) return "medium";
  return "high";
}

/** @type {GraphicsProfile | null} */
let cached = null;

/**
 * Single cached profile for the page session.
 * @returns {GraphicsProfile}
 */
export function getGraphicsProfile() {
  if (cached) return cached;

  const tier = detectTier();
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const dprParam = params?.get("dpr");
  const forcedDpr =
    dprParam != null && dprParam !== "" ? Number.parseFloat(dprParam) : Number.NaN;

  const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  /** @type {{ maxPixelRatio: number; bloomResolutionScale: number; minimapMinIntervalMs: number }} */
  const byTier =
    tier === "low"
      ? { maxPixelRatio: 1, bloomResolutionScale: 0.5, minimapMinIntervalMs: 80 }
      : tier === "medium"
        ? { maxPixelRatio: 1.5, bloomResolutionScale: 0.65, minimapMinIntervalMs: 50 }
        : { maxPixelRatio: 2, bloomResolutionScale: 1, minimapMinIntervalMs: 0 };

  let maxPixelRatio = byTier.maxPixelRatio;
  if (Number.isFinite(forcedDpr) && forcedDpr > 0) {
    maxPixelRatio = Math.min(maxPixelRatio, forcedDpr);
  } else {
    maxPixelRatio = Math.min(rawDpr, maxPixelRatio);
  }

  cached = {
    tier,
    maxPixelRatio,
    bloomResolutionScale: byTier.bloomResolutionScale,
    minimapMinIntervalMs: byTier.minimapMinIntervalMs,
  };
  return cached;
}
