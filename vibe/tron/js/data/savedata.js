import { DEFAULT_DEV_HUD } from "../config.js";

const SAVE_KEY = "tron-light-cycles-save-v1";

/**
 * @typedef {object} PlayerSave
 * @property {number} version
 * @property {object} player
 * @property {object} progress
 * @property {object} cosmetics
 * @property {object} settings
 * @property {Record<string, number|boolean>} devHud
 * @property {boolean} controlsShown
 */

/** @returns {PlayerSave | null} */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/** @param {PlayerSave} data */
export function saveToStorage(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/** @returns {PlayerSave} */
export function createDefaultSave() {
  return {
    version: 1,
    player: {
      cycleColor: "#00FFFF",
      trailColor: "#00FFFF",
      attributes: {
        speed: 1,
        acceleration: 1,
        trailLength: 1,
        nitroBars: 1,
        handling: 1,
      },
    },
    progress: {
      currentLevel: 1,
      completedLevels: [0],
      coins: 0,
      totalCoinsEarned: 0,
    },
    cosmetics: {
      ownedCycleColors: ["#00FFFF"],
      ownedTrailColors: ["#00FFFF"],
    },
    settings: {
      masterVolume: 1.0,
      musicVolume: 0.7,
      sfxVolume: 1.0,
      ambientVolume: 0.5,
    },
    devHud: { ...DEFAULT_DEV_HUD },
    controlsShown: false,
  };
}

/**
 * Load existing save or create defaults (persisted on first run).
 * @returns {PlayerSave}
 */
export function loadOrCreateSave() {
  const existing = loadSave();
  if (existing) return existing;
  const created = createDefaultSave();
  saveToStorage(created);
  return created;
}
