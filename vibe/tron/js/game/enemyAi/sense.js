import { hasDangerousTrailAhead } from "./hazards.js";

/**
 * @param {object} ctx
 * @param {number} ctx.px
 * @param {number} ctx.pz
 * @param {number} ctx.heading
 * @param {string} ctx.selfId
 * @param {number} ctx.immunitySegments
 * @param {number} ctx.trailSteps
 * @param {number} ctx.halfWidthTrail
 * @param {Array<{ map: { hasTrailAhead: Function }; ownerId: string; edgeCount: number }>} ctx.trailSources
 */
export function buildTrailSense(ctx) {
  const { px, pz, heading, selfId, immunitySegments, trailSteps, halfWidthTrail, trailSources } = ctx;

  /**
   * @param {number} ang
   * @param {number} [stepsMul=1]
   */
  function trailDangerAt(ang, stepsMul = 1) {
    const steps = Math.max(3, Math.round(trailSteps * stepsMul));
    return hasDangerousTrailAhead({
      x: px,
      z: pz,
      heading: ang,
      selfId,
      immunitySegments,
      steps,
      halfWidth: halfWidthTrail,
      sources: trailSources,
    });
  }

  return { trailDangerAt };
}

/**
 * Heading for discrete steer: -1 = left (A), +1 = right (D), 0 = straight.
 * Matches legacy: cand < 0 → heading + delta.
 * @param {number} heading
 * @param {number} cand
 * @param {number} steerDelta
 */
export function candidateHeading(heading, cand, steerDelta) {
  return heading + (cand < 0 ? steerDelta : cand > 0 ? -steerDelta : 0);
}
