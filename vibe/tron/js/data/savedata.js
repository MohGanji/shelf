import { mergeDevHud } from "../config.js";
import { normalizeCosmeticListEntry, normalizePlayerNeonColor } from "../game/neonCosmetic.js";

/** @type {const} */
export const PLAYER_SAVE_KEY = "tron-light-cycles-save-v1";

const SAVE_KEY = PLAYER_SAVE_KEY;

const DEFAULT_NEON_HEX = "#00ffff";

/**
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string} `#rrggbb` lowercase
 */
export function sanitizeNeonHex(raw, fallback = DEFAULT_NEON_HEX) {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  const h = s.startsWith("#") ? s.slice(1) : s;
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return fallback;
  return `#${full.toLowerCase()}`;
}

/**
 * @typedef {object} PlayerSave
 * @property {number} version
 * @property {object} player
 * @property {string} player.cycleColor
 * @property {string} player.trailColor — always kept equal to `cycleColor` (persist + load).
 * @property {object} player.attributes
 * @property {number} player.attributes.speed
 * @property {number} player.attributes.acceleration
 * @property {number} player.attributes.trailLength
 * @property {number} player.attributes.nitroBars
 * @property {number} player.attributes.handling
 * @property {object} progress
 * @property {number} progress.currentLevel — next campaign level index (1 = first arena after lobby)
 * @property {number[]} progress.completedLevels — level IDs cleared (0 = lobby, always present)
 * @property {number} progress.coins
 * @property {number} progress.totalCoinsEarned
 * @property {Record<string, { coins: number; clearedAt: number }>} progress.dailyClears — YMD → one completion record (for calendar / streak UI)
 * @property {object} flags
 * @property {boolean} flags.seenGarage — first garage tunnel; beacon UX
 * @property {object} cosmetics
 * @property {string[]} cosmetics.ownedCycleColors
 * @property {string[]} cosmetics.ownedTrailColors
 * @property {object} settings
 * @property {number} settings.masterVolume
 * @property {number} settings.musicVolume
 * @property {number} settings.sfxVolume
 * @property {number} settings.ambientVolume
 * @property {"clean"|"retro"} [settings.visualPreset] — persisted post look; default clean
 * @property {Record<string, number|boolean>} devHud — stored as defaults; Advanced tuning (Dev HUD) is session-only
 * @property {boolean} controlsShown — first-time controls overlay dismissed
 * @property {boolean} tutorialCleared — first-run combat tutorial finished (exit to lobby)
 */

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
      dailyClears: /** @type {Record<string, { coins: number; clearedAt: number }>} */ ({}),
    },
    flags: {
      seenGarage: false,
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
      visualPreset: "clean",
    },
    devHud: mergeDevHud({}),
    controlsShown: false,
    tutorialCleared: false,
  };
}

/**
 * Ensure completedLevels always includes lobby (0) and is sorted unique.
 * @param {unknown} v
 * @returns {number[]}
 */
function normalizeCompletedLevels(v) {
  const base = createDefaultSave().progress.completedLevels;
  if (!Array.isArray(v)) return [...base];
  const nums = v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const set = new Set(nums);
  set.add(0);
  return [...set].sort((a, b) => a - b);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} v
 * @param {Record<string, { coins: number; clearedAt: number }>} fallback
 */
function normalizeDailyClears(v, fallback) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ...fallback };
  /** @type {Record<string, { coins: number; clearedAt: number }>} */
  const out = {};
  for (const [k, raw] of Object.entries(v)) {
    if (typeof k !== "string" || !YMD_RE.test(k)) continue;
    if (!raw || typeof raw !== "object") continue;
    const c = /** @type {Record<string, unknown>} */ (raw);
    const coins = typeof c.coins === "number" && Number.isFinite(c.coins) ? Math.max(0, Math.floor(c.coins)) : 0;
    const clearedAt = typeof c.clearedAt === "number" && Number.isFinite(c.clearedAt) ? c.clearedAt : Date.now();
    out[k] = { coins, clearedAt };
  }
  return out;
}

/**
 * Deep-merge a loaded object onto the default save shape (plan § Player Save Data Schema).
 * @param {unknown} raw
 * @returns {PlayerSave}
 */
export function normalizePlayerSave(raw) {
  const d = createDefaultSave();
  if (!raw || typeof raw !== "object") return d;

  const o = /** @type {Record<string, unknown>} */ (raw);
  const playerIn = o.player && typeof o.player === "object" ? /** @type {Record<string, unknown>} */ (o.player) : {};
  const attrIn =
    playerIn.attributes && typeof playerIn.attributes === "object"
      ? /** @type {Record<string, unknown>} */ (playerIn.attributes)
      : {};

  const progressIn = o.progress && typeof o.progress === "object" ? /** @type {Record<string, unknown>} */ (o.progress) : {};
  const flagsIn = o.flags && typeof o.flags === "object" ? /** @type {Record<string, unknown>} */ (o.flags) : null;
  const cosmeticsIn = o.cosmetics && typeof o.cosmetics === "object" ? /** @type {Record<string, unknown>} */ (o.cosmetics) : {};
  const settingsIn = o.settings && typeof o.settings === "object" ? /** @type {Record<string, unknown>} */ (o.settings) : {};

  const version = typeof o.version === "number" && Number.isFinite(o.version) ? o.version : d.version;

  const currentLevelRaw = progressIn.currentLevel;
  const currentLevel =
    typeof currentLevelRaw === "number" && Number.isFinite(currentLevelRaw) ? Math.max(1, Math.floor(currentLevelRaw)) : d.progress.currentLevel;

  const coins = typeof progressIn.coins === "number" && Number.isFinite(progressIn.coins) ? Math.max(0, progressIn.coins) : d.progress.coins;
  const totalCoinsEarned =
    typeof progressIn.totalCoinsEarned === "number" && Number.isFinite(progressIn.totalCoinsEarned)
      ? Math.max(0, progressIn.totalCoinsEarned)
      : d.progress.totalCoinsEarned;

  const dailyClears = normalizeDailyClears(progressIn.dailyClears, d.progress.dailyClears);

  const ownedCycle =
    Array.isArray(cosmeticsIn.ownedCycleColors) && cosmeticsIn.ownedCycleColors.length > 0
      ? cosmeticsIn.ownedCycleColors.map(String)
      : d.cosmetics.ownedCycleColors;
  const ownedTrail =
    Array.isArray(cosmeticsIn.ownedTrailColors) && cosmeticsIn.ownedTrailColors.length > 0
      ? cosmeticsIn.ownedTrailColors.map(String)
      : d.cosmetics.ownedTrailColors;

  const vol = (x, fallback) =>
    typeof x === "number" && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : fallback;

  const visualPresetRaw = settingsIn.visualPreset;
  const visualPreset =
    visualPresetRaw === "retro" || visualPresetRaw === "clean"
      ? visualPresetRaw
      : d.settings.visualPreset;

  /** Migration: pre-tutorial saves have no `tutorialCleared` — do not block returning players. */
  let tutorialCleared = Boolean(o.tutorialCleared);
  if (o.tutorialCleared === undefined) tutorialCleared = true;

  /** Migration: if no flags, assume long-time player has "seen" garage (avoid nag). */
  let seenGarage = Boolean(flagsIn?.seenGarage);
  if (!flagsIn) seenGarage = true;

  /** @type {PlayerSave} */
  const out = {
    version,
    player: {
      cycleColor: normalizePlayerNeonColor(
        typeof playerIn.cycleColor === "string" ? playerIn.cycleColor : d.player.cycleColor,
        d.player.cycleColor,
      ),
      trailColor: normalizePlayerNeonColor(
        typeof playerIn.trailColor === "string" ? playerIn.trailColor : d.player.trailColor,
        d.player.trailColor,
      ),
      attributes: {
        speed: typeof attrIn.speed === "number" && Number.isFinite(attrIn.speed) ? clampAttr(attrIn.speed) : d.player.attributes.speed,
        acceleration:
          typeof attrIn.acceleration === "number" && Number.isFinite(attrIn.acceleration)
            ? clampAttr(attrIn.acceleration)
            : d.player.attributes.acceleration,
        trailLength:
          typeof attrIn.trailLength === "number" && Number.isFinite(attrIn.trailLength)
            ? clampAttr(attrIn.trailLength)
            : d.player.attributes.trailLength,
        nitroBars:
          typeof attrIn.nitroBars === "number" && Number.isFinite(attrIn.nitroBars) ? clampAttr(attrIn.nitroBars) : d.player.attributes.nitroBars,
        handling:
          typeof attrIn.handling === "number" && Number.isFinite(attrIn.handling) ? clampAttr(attrIn.handling) : d.player.attributes.handling,
      },
    },
    progress: {
      currentLevel,
      completedLevels: normalizeCompletedLevels(progressIn.completedLevels),
      coins,
      totalCoinsEarned,
      dailyClears,
    },
    flags: {
      seenGarage,
    },
    cosmetics: {
      ownedCycleColors: ownedCycle,
      ownedTrailColors: ownedTrail,
    },
    settings: {
      masterVolume: vol(settingsIn.masterVolume, d.settings.masterVolume),
      musicVolume: vol(settingsIn.musicVolume, d.settings.musicVolume),
      sfxVolume: vol(settingsIn.sfxVolume, d.settings.sfxVolume),
      ambientVolume: vol(settingsIn.ambientVolume, d.settings.ambientVolume),
      visualPreset,
    },
    // Never apply `o.devHud` from disk (old or new saves). Dev HUD is session-only; this strips legacy persisted tuning on every load.
    devHud: mergeDevHud({}),
    controlsShown: Boolean(o.controlsShown),
    tutorialCleared,
  };
  clampProgressToLinearIntegrity(out);
  syncTrailColorToCycle(out);
  return out;
}

/**
 * Trail uses the same neon as the cycle; unify cosmetics lists from older saves.
 * @param {PlayerSave} save
 */
function syncTrailColorToCycle(save) {
  if (!save || typeof save !== "object" || !save.player || typeof save.player !== "object") return;
  if (!save.cosmetics || typeof save.cosmetics !== "object") return;

  const cyc = normalizePlayerNeonColor(save.player.cycleColor, createDefaultSave().player.cycleColor);
  save.player.cycleColor = cyc;
  save.player.trailColor = cyc;

  const oc = Array.isArray(save.cosmetics.ownedCycleColors)
    ? save.cosmetics.ownedCycleColors.map((x) => normalizeCosmeticListEntry(String(x)))
    : [];
  const ot = Array.isArray(save.cosmetics.ownedTrailColors)
    ? save.cosmetics.ownedTrailColors.map((x) => normalizeCosmeticListEntry(String(x)))
    : [];
  const union = [...new Set([...oc, ...ot, cyc])];
  save.cosmetics.ownedCycleColors = [...union];
  save.cosmetics.ownedTrailColors = [...union];
}

/** @param {number} n */
function clampAttr(n) {
  return Math.max(1, Math.min(10, Math.floor(n)));
}

/**
 * @returns {PlayerSave | null}
 */
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return normalizePlayerSave(data);
  } catch {
    return null;
  }
}

/** @param {PlayerSave} data */
export function saveToStorage(data) {
  syncTrailColorToCycle(data);
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/**
 * Load existing save or create defaults (persisted on first run).
 * Normalizes shape against current schema and re-writes storage when the canonical form differs.
 * @returns {PlayerSave}
 */
export function loadOrCreateSave() {
  const s = localStorage.getItem(SAVE_KEY);
  if (!s) {
    const created = createDefaultSave();
    saveToStorage(created);
    return created;
  }
  let raw;
  try {
    raw = JSON.parse(s);
  } catch {
    const created = createDefaultSave();
    saveToStorage(created);
    return created;
  }
  const normalized = normalizePlayerSave(raw);
  if (s !== JSON.stringify(normalized)) {
    saveToStorage(normalized);
  }
  return normalized;
}

/**
 * Apply a mutator to the current save and persist. Use for atomic updates.
 * @param {(save: PlayerSave) => void} fn
 * @returns {PlayerSave}
 */
export function readModifyWriteSave(fn) {
  const save = loadOrCreateSave();
  fn(save);
  saveToStorage(save);
  return save;
}

/** @param {PlayerSave} save */
export function persistSave(save) {
  saveToStorage(save);
}

/**
 * @param {PlayerSave} save
 * @param {Partial<import("../config.js").DEFAULT_DEV_HUD>} patch
 * Dev HUD is session-only and not written to localStorage; this is a no-op (API retained).
 */
export function mergeDevHudIntoSave(save, patch) {
  void save;
  void patch;
}

/** @param {PlayerSave} save @param {boolean} shown */
export function setControlsShown(save, shown) {
  save.controlsShown = shown;
}

/** @param {PlayerSave} save @param {boolean} cleared */
export function setTutorialCleared(save, cleared) {
  save.tutorialCleared = !!cleared;
}

/** @param {PlayerSave} save */
export function setFlagSeenGarage(save) {
  if (!save.flags) save.flags = { ...createDefaultSave().flags };
  save.flags.seenGarage = true;
}

/**
 * Daily arena: one clear per YMD, coins from level rewards.
 * @param {PlayerSave} save
 * @param {string} ymd
 * @param {number} coins
 */
export function recordDailyCleared(save, ymd, coins) {
  if (typeof ymd !== "string" || !YMD_RE.test(ymd)) return;
  const n = Math.max(0, Math.floor(coins));
  if (!save.progress.dailyClears) save.progress.dailyClears = {};
  if (save.progress.dailyClears[ymd]) return;
  save.progress.dailyClears[ymd] = { coins: n, clearedAt: Date.now() };
  addCoins(save, n);
}

/**
 * @param {PlayerSave} save
 * @param {string} ymd
 * @returns {boolean}
 */
export function isDailyClearedOn(save, ymd) {
  if (typeof ymd !== "string" || !YMD_RE.test(ymd)) return false;
  return Boolean(save.progress.dailyClears && save.progress.dailyClears[ymd]);
}

/** @param {PlayerSave} save @param {Partial<PlayerSave["settings"]>} partial */
export function patchSettings(save, partial) {
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  if (partial.masterVolume != null && Number.isFinite(partial.masterVolume)) save.settings.masterVolume = clamp01(partial.masterVolume);
  if (partial.musicVolume != null && Number.isFinite(partial.musicVolume)) save.settings.musicVolume = clamp01(partial.musicVolume);
  if (partial.sfxVolume != null && Number.isFinite(partial.sfxVolume)) save.settings.sfxVolume = clamp01(partial.sfxVolume);
  if (partial.ambientVolume != null && Number.isFinite(partial.ambientVolume)) save.settings.ambientVolume = clamp01(partial.ambientVolume);
  if (partial.visualPreset === "clean" || partial.visualPreset === "retro") {
    save.settings.visualPreset = partial.visualPreset;
  }
}

/**
 * Linear campaign: completing level L unlocks the next index (currentLevel tracks furthest gate).
 * @param {PlayerSave} save
 * @param {number} completedLevelId
 */
export function recordLevelComplete(save, completedLevelId) {
  const id = Math.floor(completedLevelId);
  if (!Number.isFinite(id) || id < 0) return;
  const p = save.progress;
  if (!p.completedLevels.includes(id)) {
    p.completedLevels.push(id);
    p.completedLevels.sort((a, b) => a - b);
  }
  p.currentLevel = Math.max(p.currentLevel, id + 1);
}

/**
 * @param {PlayerSave} save
 * @param {number} amount — must be >= 0
 */
export function addCoins(save, amount) {
  const n = Math.max(0, amount);
  save.progress.coins += n;
  save.progress.totalCoinsEarned += n;
}

/**
 * @param {PlayerSave} save
 * @param {number} amount
 */
export function spendCoins(save, amount) {
  const n = Math.max(0, amount);
  save.progress.coins = Math.max(0, save.progress.coins - n);
}

/**
 * @param {PlayerSave} save
 * @param {"cycle"|"trail"} kind
 * @param {string} colorHex
 */
export function unlockCosmeticColor(save, kind, colorHex) {
  void kind;
  const c = normalizeCosmeticListEntry(String(colorHex));
  if (!save.cosmetics.ownedCycleColors.includes(c)) save.cosmetics.ownedCycleColors.push(c);
  if (!save.cosmetics.ownedTrailColors.includes(c)) save.cosmetics.ownedTrailColors.push(c);
}

/**
 * Linear progression: level `id` is playable if all prior campaign indices are completed,
 * or id is 0 (lobby). For id 1+, require id-1 in completedLevels.
 * @param {PlayerSave} save
 * @param {number} levelId
 */
export function isLevelUnlockedLinear(save, levelId) {
  const id = Math.floor(levelId);
  if (!Number.isFinite(id) || id < 0) return false;
  if (id === 0) return true;
  return save.progress.completedLevels.includes(id - 1);
}

/**
 * Clamp `progress.currentLevel` so it never points past the next fair arena
 * (max completed arena index + 1). Repairs corrupted or hand-edited saves (plan § linear progression).
 * @param {PlayerSave} save
 */
export function clampProgressToLinearIntegrity(save) {
  const p = save.progress;
  const arenaDone = p.completedLevels.filter((x) => typeof x === "number" && x >= 1);
  const maxDone = arenaDone.length ? Math.max(...arenaDone) : 0;
  const expectedNext = maxDone + 1;
  if (typeof p.currentLevel !== "number" || !Number.isFinite(p.currentLevel)) {
    p.currentLevel = Math.max(1, expectedNext);
    return;
  }
  if (p.currentLevel > expectedNext) {
    p.currentLevel = Math.max(1, expectedNext);
  }
  if (p.currentLevel < 1) p.currentLevel = 1;
}
