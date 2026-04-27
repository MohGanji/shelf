/**
 * Player attribute scales for garage UI and 3D lobby banners (same math as DOM garage).
 */

import { createRuntimeFromPlayerSave, getArenaPlaytestConfig } from "../config.js";
import { clampAttributeLevel } from "./attributes.js";

/** @type {readonly (keyof import("../data/savedata.js").PlayerSave["player"]["attributes"])[]} */
export const GARAGE_ATTR_KEYS = ["speed", "acceleration", "trailLength", "nitroBars", "handling"];

export const GARAGE_ATTR_TITLES = {
  speed: "Speed",
  acceleration: "Acceleration",
  trailLength: "Trail length",
  nitroBars: "Nitro bars",
  handling: "Handling",
};

/** Short labels for compact 3D banners. */
export const GARAGE_ATTR_SHORT = {
  speed: "SPD",
  acceleration: "ACC",
  trailLength: "TRL",
  nitroBars: "NIT",
  handling: "HND",
};

/**
 * @param {import("../data/savedata.js").PlayerSave["player"]["attributes"]} attrs
 * @param {import("../data/savedata.js").PlayerSave} save
 */
function playtestForGarage(attrs, save) {
  const runtime = createRuntimeFromPlayerSave(save);
  return getArenaPlaytestConfig(runtime, attrs, {});
}

/**
 * @param {string} key
 * @param {ReturnType<typeof getArenaPlaytestConfig>} play
 */
function readGarageMetric(key, play) {
  switch (key) {
    case "speed":
      return play.maxMoveSpeed;
    case "acceleration":
      return play.acceleration;
    case "handling":
      return play.baseTurnRate;
    case "nitroBars":
      return play.nitroBarCount;
    case "trailLength":
      return play.trailMaxSegments;
    default:
      return 0;
  }
}

/**
 * @param {string} key
 * @param {import("../data/savedata.js").PlayerSave} save
 */
export function garageAttrScale(key, save) {
  const base = save.player.attributes;
  const playCur = playtestForGarage(base, save);
  const attrsMaxOne = { ...base, [key]: 10 };
  const playCap = playtestForGarage(attrsMaxOne, save);
  const cur = readGarageMetric(key, playCur);
  const max = Math.max(readGarageMetric(key, playCap), 1e-9);
  return { cur, max };
}

/**
 * @param {string} key
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {number} level
 */
export function garageMetricAtAttributeLevel(key, save, level) {
  const attrs = { ...save.player.attributes, [key]: clampAttributeLevel(level) };
  return readGarageMetric(key, playtestForGarage(attrs, save));
}

/**
 * @param {string} key
 * @param {number} cur
 * @param {number} max
 */
export function formatGarageAttrFraction(key, cur, max) {
  switch (key) {
    case "speed":
      return `${Math.round(cur)} / ${Math.round(max)} u/s`;
    case "acceleration":
      return `${cur.toFixed(1)} / ${max.toFixed(1)} u/s²`;
    case "trailLength":
      return `${Math.round(cur)} / ${Math.round(max)} seg`;
    case "nitroBars":
      return `${cur} / ${max}`;
    case "handling":
      return `${cur.toFixed(2)} / ${max.toFixed(2)} rad/s`;
    default:
      return `${cur} / ${max}`;
  }
}
