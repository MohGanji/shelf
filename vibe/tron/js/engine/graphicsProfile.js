/**
 * Cross-browser performance defaults (P10.2): adaptive pixel ratio, cheaper bloom, HUD minimap cadence.
 * Override with URL: `?perf=low|medium|high` or `?dpr=1` (caps device pixel ratio).
 * Optional: `?aa=smaa` on **medium** / **high** restores SMAA (costly; default is FXAA for smoother FPS).
 * Debug: `?fps=1` shows a lightweight fps / frame-ms overlay (session-only).
 * Default (no `?perf=`): **medium** tier — same as `perf=medium`; **high** is only used when `?perf=high` is set.
 * Default DPR (no `?dpr=`): capped like **`dpr=1`** for smoother FPS; set `?dpr=` to allow higher internal resolution.
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
 *   reflectorResolutionScale: number;
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

  /** No auto-`high`: default experience stays **medium** (`?perf=high` opt-in). */
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
  const dprParamRaw = params?.get("dpr");
  const explicitDpr = dprParamRaw != null && String(dprParamRaw).trim() !== "";
  const forcedDpr = explicitDpr ? Number.parseFloat(String(dprParamRaw)) : Number.NaN;

  const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const aaParam = params?.get("aa");

  /** @type {{ maxPixelRatio: number; bloomResolutionScale: number; minimapMinIntervalMs: number; minimapResolutionScale: number; arenaFloorDetail: 'off' | 'basic' | 'rich'; postFilmStrength: number; pickupVisualDetail: boolean; portalVisualDetail: boolean; postAntialias: 'off' | 'fxaa' | 'smaa'; reflectorResolutionScale: number }} */
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
          reflectorResolutionScale: 0.52,
        }
      : tier === "high"
        ? {
            maxPixelRatio: 1.58,
            bloomResolutionScale: 0.76,
            minimapMinIntervalMs: 40,
            minimapResolutionScale: 2,
            arenaFloorDetail: "basic",
            postFilmStrength: 0.06,
            pickupVisualDetail: true,
            portalVisualDetail: true,
            postAntialias: "fxaa",
            reflectorResolutionScale: 0.68,
          }
        : {
            maxPixelRatio: 1.38,
            bloomResolutionScale: 0.64,
            minimapMinIntervalMs: 50,
            minimapResolutionScale: 2,
            arenaFloorDetail: "basic",
            postFilmStrength: 0.08,
            pickupVisualDetail: true,
            portalVisualDetail: false,
            postAntialias: "fxaa",
            reflectorResolutionScale: 0.62,
          };

  let maxPixelRatio = byTier.maxPixelRatio;
  if (Number.isFinite(forcedDpr) && forcedDpr > 0) {
    maxPixelRatio = Math.min(maxPixelRatio, forcedDpr);
  } else {
    /** Default matches `?dpr=1`: cap internal res; use `?dpr=` to unlock higher. */
    maxPixelRatio = Math.min(maxPixelRatio, 1);
  }
  maxPixelRatio = Math.min(rawDpr, maxPixelRatio);

  let postAntialias = byTier.postAntialias;
  if ((tier === "medium" || tier === "high") && aaParam === "smaa") {
    postAntialias = "smaa";
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
    postAntialias,
    reflectorResolutionScale: byTier.reflectorResolutionScale,
  };
  return cached;
}

/**
 * Huge arenas: shift **high** and **medium** toward lower fill + cheaper post while keeping `tier` unchanged.
 *
 * @param {GraphicsProfile | null | undefined} profile
 * @param {number} [arenaWidth]
 * @param {number} [arenaDepth]
 * @returns {GraphicsProfile | null | undefined}
 */
export function applyLargeArenaGraphicsOverrides(profile, arenaWidth, arenaDepth) {
  if (!profile || (profile.tier !== "high" && profile.tier !== "medium")) return profile;
  const w = typeof arenaWidth === "number" ? arenaWidth : Number.NaN;
  const d = typeof arenaDepth === "number" ? arenaDepth : Number.NaN;
  if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) return profile;

  const maxSpan = Math.max(w, d);
  const footprint = w * d;
  const heavyArena = maxSpan >= 380 || footprint >= 140000;
  if (!heavyArena) return profile;

  if (profile.tier === "high") {
    return {
      ...profile,
      postAntialias: "fxaa",
      bloomResolutionScale: Math.min(profile.bloomResolutionScale, 0.68),
      maxPixelRatio: Math.min(profile.maxPixelRatio, 1.35),
      arenaFloorDetail: profile.arenaFloorDetail === "rich" ? "basic" : profile.arenaFloorDetail,
      reflectorResolutionScale: Math.min(profile.reflectorResolutionScale, 0.62),
    };
  }

  return {
    ...profile,
    bloomResolutionScale: Math.min(profile.bloomResolutionScale, 0.58),
    maxPixelRatio: Math.min(profile.maxPixelRatio, 1.25),
    reflectorResolutionScale: Math.min(profile.reflectorResolutionScale, 0.55),
  };
}
