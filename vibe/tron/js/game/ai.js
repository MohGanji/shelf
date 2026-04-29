/**
 * Enemy AI public surface — implementation lives in {@link ./enemyAi/index.js}.
 */

export {
  AI_SPEED_TUNE_REF,
  INTELLIGENCE_EASY_MAX,
  INTELLIGENCE_MEDIUM_MAX,
  intelligenceTier,
  computeEnemyCycleKeys,
  computePeerSeparationSteer,
  hasDangerousTrailAhead,
  raycastSolidClearanceXZ,
} from "./enemyAi/index.js";
