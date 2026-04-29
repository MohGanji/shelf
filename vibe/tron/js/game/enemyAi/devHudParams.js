/**
 * Dev HUD percent knobs for AI tuning.
 */

/** @param {unknown} raw @param {number} fallback */
export function percent01(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback / 100;
  return Math.max(0, Math.min(1, n / 100));
}

/** @param {import('../../config.js').DEFAULT_DEV_HUD} devHud */
export function smartAiParams(devHud) {
  const safety = percent01(devHud.aiSafetyPercent, 95);
  const aggression = percent01(devHud.aiAggressionPercent, 90);
  const cutoff = percent01(devHud.aiCutoffPercent, 95);
  const pressure = percent01(devHud.aiPressurePercent, 95);
  const lookahead = percent01(devHud.aiLookaheadPercent, 90);
  const stability = percent01(devHud.aiStabilityPercent, 40);
  return {
    safety,
    aggression,
    cutoff,
    pressure,
    lookahead,
    stability,
    lookaheadTiles: Math.round(5 + lookahead * 17),
    floodBudget: Math.round(90 + lookahead * 420),
    projectionDist: 2.5 + lookahead * 7.5,
  };
}

/** @param {unknown} raw @param {number} def @param {number} min @param {number} max */
export function aiHudNumber(raw, def, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}
