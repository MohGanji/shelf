/**
 * Cross-browser performance defaults (P10.2): adaptive pixel ratio, cheaper bloom, HUD minimap cadence.
 * Override with URL: `?perf=low|medium|high` or `?dpr=1` (caps device pixel ratio).
 * Default tier is **medium**; heuristics may choose **low** on constrained devices or **high** on strong desktops.
 */

/** @typedef {'low' | 'medium' | 'high'} GraphicsTier */

/**
 * @typedef {{
 *   tier: GraphicsTier;
 *   maxPixelRatio: number;
 *   bloomResolutionScale: number;
 *   minimapMinIntervalMs: number;
 *   minimapResolutionScale: number;
 *   arenaFloorDetail: 'off' | 'basic' | 'rich';
 *   postFilmStrength: number;
 *   pickupVisualDetail: boolean;
 *   portalVisualDetail: boolean;
 *   postAntialias: 'off' | 'fxaa' | 'smaa';
 * }} GraphicsProfile
 */

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
  if (typeof window === "undefined") return "medium";
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

  const rawDpr = window.devicePixelRatio || 1;
  const strongDesktop =
    score === 0 &&
    !isLikelyDesktopSafari() &&
    rawDpr >= 1.5 &&
    ((typeof mem === "number" && mem >= 8) ||
      (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency >= 8));

  if (strongDesktop) return "high";
  return "medium";
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

  /** @type {{ maxPixelRatio: number; bloomResolutionScale: number; minimapMinIntervalMs: number; minimapResolutionScale: number; arenaFloorDetail: 'off' | 'basic' | 'rich'; postFilmStrength: number; pickupVisualDetail: boolean; portalVisualDetail: boolean; postAntialias: 'off' | 'fxaa' | 'smaa' }} */
  const byTier =
    tier === "low"
      ? {
          maxPixelRatio: 1,
          bloomResolutionScale: 0.5,
          minimapMinIntervalMs: 80,
          minimapResolutionScale: 1,
          arenaFloorDetail: "off",
          postFilmStrength: 0,
          pickupVisualDetail: false,
          portalVisualDetail: false,
          postAntialias: "off",
        }
      : tier === "high"
        ? {
            maxPixelRatio: 2,
            bloomResolutionScale: 0.92,
            minimapMinIntervalMs: 40,
            minimapResolutionScale: 2,
            arenaFloorDetail: "rich",
            postFilmStrength: 0.06,
            pickupVisualDetail: true,
            portalVisualDetail: true,
            postAntialias: "smaa",
          }
        : {
            maxPixelRatio: 1.5,
            bloomResolutionScale: 0.72,
            minimapMinIntervalMs: 50,
            minimapResolutionScale: 2,
            arenaFloorDetail: "basic",
            postFilmStrength: 0.08,
            pickupVisualDetail: true,
            portalVisualDetail: false,
            postAntialias: "fxaa",
          };

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
    minimapResolutionScale: byTier.minimapResolutionScale,
    arenaFloorDetail: byTier.arenaFloorDetail,
    postFilmStrength: byTier.postFilmStrength,
    pickupVisualDetail: byTier.pickupVisualDetail,
    portalVisualDetail: byTier.portalVisualDetail,
    postAntialias: byTier.postAntialias,
  };
  return cached;
}

/**
 * **High** tier defaults (SMAA, DPR 2, rich floor, large bloom RT) melt on huge arenas — enormous floor
 * fill plus multi-pass post dominates the GPU. For daily 500², 420² campaign rooms, etc., shift toward
 * medium-style post cost while keeping `tier === 'high'` for the session.
 *
 * @param {GraphicsProfile | null | undefined} profile
 * @param {number} [arenaWidth]
 * @param {number} [arenaDepth]
 * @returns {GraphicsProfile | null | undefined}
 */
export function applyLargeArenaGraphicsOverrides(profile, arenaWidth, arenaDepth) {
  if (!profile || profile.tier !== "high") return profile;
  const w = typeof arenaWidth === "number" ? arenaWidth : Number.NaN;
  const d = typeof arenaDepth === "number" ? arenaDepth : Number.NaN;
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return profile;

  const maxSpan = Math.max(w, d);
  const footprint = w * d;
  const heavyArena = maxSpan >= 380 || footprint >= 140000;
  if (!heavyArena) return profile;

  return {
    ...profile,
    postAntialias: "fxaa",
    bloomResolutionScale: Math.min(profile.bloomResolutionScale, 0.68),
    maxPixelRatio: Math.min(profile.maxPixelRatio, 1.35),
    arenaFloorDetail: profile.arenaFloorDetail === "rich" ? "basic" : profile.arenaFloorDetail,
  };
}
