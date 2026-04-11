/**
 * Campaign levels (manifest + fetch + validate) and WIP levels (localStorage).
 * Invalid campaign entries are skipped with `console.warn` (plan § P5.2).
 * @module levels/loader
 */

import { BUNDLED_CAMPAIGN_LEVEL_FILENAMES } from "./defaults.js";
import { LOBBY_LEVEL_ID, validateLevel } from "./schema.js";

/** Per-level WIP key helpers (alternate prefix vs consolidated `WIP_STORAGE_KEY` store). */
export { getWipLevelKeyPrefix, wipLevelStorageKey } from "./editor.js";

/** WIP blob version — bump if storage shape changes. */
export const WIP_STORAGE_VERSION = 1;

/** Single localStorage key for editor WIP levels (id → JSON + stable order). */
export const WIP_STORAGE_KEY = "tron-light-cycles-wip-levels-v1";

/** Fetch campaign files relative to `index.html` by default. */
export const DEFAULT_CAMPAIGN_BASE = "./levels/";

/**
 * Warn when `manifest.json` order/names drift from `defaults.js` (bundled campaign contract).
 * @param {unknown} rawManifest
 */
function warnIfBundledManifestDrift(rawManifest) {
  if (!Array.isArray(rawManifest)) return;
  const bundled = BUNDLED_CAMPAIGN_LEVEL_FILENAMES;
  if (rawManifest.length !== bundled.length) {
    console.warn(
      `[loader] manifest.json lists ${rawManifest.length} file(s); bundled default expects ${bundled.length} (see levels/defaults.js)`,
    );
    return;
  }
  for (let i = 0; i < bundled.length; i++) {
    const got = String(rawManifest[i] ?? "").trim();
    if (got !== bundled[i]) {
      console.warn(
        `[loader] manifest.json drift at [${i}]: expected "${bundled[i]}", got "${got}" (see levels/defaults.js)`,
      );
      return;
    }
  }
}

/**
 * @typedef {object} CampaignLoadOptions
 * @property {string} [campaignBase] — URL prefix, e.g. `./levels/`
 * @property {AbortSignal} [signal]
 */

/**
 * @param {string} base
 */
function normalizeBase(base) {
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Ordered list of campaign level filenames from `manifest.json`.
 * @param {CampaignLoadOptions} [opts]
 * @returns {Promise<string[]>}
 */
export async function loadCampaignManifest(opts = {}) {
  const base = normalizeBase(opts.campaignBase ?? DEFAULT_CAMPAIGN_BASE);
  const signal = opts.signal;
  try {
    const res = await fetch(`${base}manifest.json`, { signal });
    if (!res.ok) {
      console.warn(`[loader] manifest fetch failed: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn("[loader] manifest.json must be a JSON array of level filenames");
      return [];
    }
    warnIfBundledManifestDrift(data);
    return data.map((x) => String(x).trim()).filter(Boolean);
  } catch (e) {
    console.warn("[loader] manifest load error:", e);
    return [];
  }
}

/**
 * @typedef {object} CampaignEntryOk
 * @property {string} filename
 * @property {true} valid
 * @property {Record<string, unknown>} level
 *
 * @typedef {object} CampaignEntryBad
 * @property {string} filename
 * @property {false} valid
 * @property {string[]} errors
 *
 * @typedef {CampaignEntryOk | CampaignEntryBad} CampaignEntry
 */

/**
 * Loads every manifest entry: fetch JSON, `validateLevel`, collect valid levels in order.
 * @param {CampaignLoadOptions} [opts]
 * @returns {Promise<{ manifest: string[]; entries: CampaignEntry[]; validLevels: Record<string, unknown>[] }>}
 */
export async function loadCampaignLevels(opts = {}) {
  const manifest = await loadCampaignManifest(opts);
  const base = normalizeBase(opts.campaignBase ?? DEFAULT_CAMPAIGN_BASE);
  const signal = opts.signal;

  /** @type {CampaignEntry[]} */
  const entries = [];
  /** @type {Record<string, unknown>[]} */
  const validLevels = [];

  for (const filename of manifest) {
    const url = `${base}${filename.replace(/^\//, "")}`;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        console.warn(`[loader] skipping campaign file ${filename}: HTTP ${res.status}`);
        entries.push({ filename, valid: false, errors: [`HTTP ${res.status}`] });
        continue;
      }
      let json;
      try {
        json = JSON.parse(await res.text());
      } catch (e) {
        console.warn(`[loader] skipping campaign file ${filename}: invalid JSON`, e);
        entries.push({ filename, valid: false, errors: ["Invalid JSON"] });
        continue;
      }
      const v = validateLevel(json);
      if (!v.valid) {
        const first = v.errors[0] ?? "validation failed";
        console.warn(`[loader] invalid campaign level (${filename}): ${first}`);
        entries.push({ filename, valid: false, errors: v.errors });
        continue;
      }
      entries.push({ filename, valid: true, level: json });
      validLevels.push(json);
    } catch (e) {
      console.warn(`[loader] skipping campaign file ${filename}:`, e);
      entries.push({ filename, valid: false, errors: [String(e)] });
    }
  }

  return { manifest, entries, validLevels };
}

/**
 * @typedef {object} WipStore
 * @property {number} version
 * @property {string[]} order
 * @property {Record<string, unknown>} levels
 */

/** @returns {WipStore} */
function emptyWipStore() {
  return { version: WIP_STORAGE_VERSION, order: [], levels: {} };
}

/**
 * Raw WIP storage (editor may persist not-yet-valid levels).
 * @returns {WipStore}
 */
export function loadWipStore() {
  try {
    const raw = localStorage.getItem(WIP_STORAGE_KEY);
    if (!raw) return emptyWipStore();
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return emptyWipStore();
    const order = Array.isArray(data.order) ? data.order.map((x) => String(x)) : [];
    const levels =
      data.levels && typeof data.levels === "object" && !Array.isArray(data.levels)
        ? /** @type {Record<string, unknown>} */ (data.levels)
        : {};
    return {
      version: typeof data.version === "number" ? data.version : WIP_STORAGE_VERSION,
      order,
      levels,
    };
  } catch {
    return emptyWipStore();
  }
}

/** @param {WipStore} store */
function persistWipStore(store) {
  localStorage.setItem(WIP_STORAGE_KEY, JSON.stringify(store));
}

/** @returns {string[]} Stable ids (creation / first-save order). */
export function listWipLevelIds() {
  return [...loadWipStore().order];
}

/**
 * @returns {{ id: string; name: string }[]}
 */
export function listWipLevelsMeta() {
  const store = loadWipStore();
  return store.order.map((id) => {
    const L = store.levels[id];
    const name =
      L && typeof L === "object" && L !== null && typeof L.name === "string" ? L.name : id;
    return { id, name };
  });
}

/**
 * Raw level object from WIP storage (may fail `validateLevel`).
 * @param {string} id
 * @returns {Record<string, unknown> | null}
 */
export function getWipLevel(id) {
  const store = loadWipStore();
  const L = store.levels[id];
  return L && typeof L === "object" && !Array.isArray(L) ? /** @type {Record<string, unknown>} */ (L) : null;
}

/**
 * @param {string} id
 * @returns {{ valid: true; level: Record<string, unknown> } | { valid: false; errors: string[] } | null}
 */
export function getWipLevelValidated(id) {
  const raw = getWipLevel(id);
  if (!raw) return null;
  const v = validateLevel(raw);
  return v.valid ? { valid: true, level: raw } : { valid: false, errors: v.errors };
}

/**
 * Insert or update a WIP level. Requires `level.id` (non-empty string).
 * @param {Record<string, unknown>} level
 * @returns {string} id
 */
export function upsertWipLevel(level) {
  if (!level || typeof level !== "object" || Array.isArray(level)) {
    throw new Error("upsertWipLevel: level must be a plain object");
  }
  const idRaw = level.id;
  if (typeof idRaw !== "string" || idRaw.trim() === "") {
    throw new Error("upsertWipLevel: level.id must be a non-empty string");
  }
  const id = idRaw.trim();
  const store = loadWipStore();
  if (!store.order.includes(id)) store.order.push(id);
  store.levels[id] = level;
  persistWipStore(store);
  return id;
}

/**
 * @param {string} id
 * @returns {boolean} true if a level was removed
 */
export function removeWipLevel(id) {
  const store = loadWipStore();
  const had = id in store.levels;
  store.order = store.order.filter((x) => x !== id);
  delete store.levels[id];
  persistWipStore(store);
  return had;
}

/**
 * @param {Record<string, unknown>[]} levels
 * @param {string} levelId
 * @returns {Record<string, unknown> | undefined}
 */
export function findCampaignLevelById(levels, levelId) {
  return levels.find((L) => L && typeof L === "object" && L.id === levelId);
}

/**
 * Parse `level-N` index from a validated campaign `id` (`level-3` → 3). Non-matching → NaN.
 * @param {Record<string, unknown>} level
 * @returns {number}
 */
export function parseCampaignLevelIndex(level) {
  const id = level && typeof level.id === "string" ? level.id : "";
  const m = /^level-(\d+)$/.exec(id.trim());
  return m ? Number(m[1]) : Number.NaN;
}

/**
 * Next campaign arena by `level-N` index (1 = first arena after lobby).
 * @param {Record<string, unknown>[]} validLevels
 * @param {number} campaignIndex
 * @returns {Record<string, unknown> | null}
 */
export function findCampaignLevelByCampaignIndex(validLevels, campaignIndex) {
  const idx = Math.floor(campaignIndex);
  if (!Number.isFinite(idx) || idx < 1) return null;
  const found = validLevels.find((L) => parseCampaignLevelIndex(L) === idx);
  return found && typeof found === "object" ? /** @type {Record<string, unknown>} */ (found) : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} level
 * @returns {{ arenaWidth: number; arenaDepth: number } | undefined}
 */
export function extractArenaDimensionsFromLevel(level) {
  if (!level || typeof level !== "object") return undefined;
  const w = level.arenaWidth;
  const d = level.arenaDepth;
  if (typeof w === "number" && Number.isFinite(w) && typeof d === "number" && Number.isFinite(d)) {
    return { arenaWidth: w, arenaDepth: d };
  }
  return undefined;
}

/**
 * Which manifest-loaded level should drive the arena sandbox (dimensions + `scene.userData` metadata).
 * Prefers the entry whose `level-N` index matches `save.progress.currentLevel`, else first non-lobby, else first.
 *
 * @param {Record<string, unknown>[]} validLevels
 * @param {{ progress: { currentLevel: number } }} save
 * @returns {Record<string, unknown> | null}
 */
export function selectPlaytestCampaignLevel(validLevels, save) {
  if (!validLevels.length) return null;
  const target = Math.max(0, Math.floor(save.progress.currentLevel));
  const exact = validLevels.find((L) => parseCampaignLevelIndex(L) === target);
  if (exact) return exact;
  const nonLobby = validLevels.find((L) => L && L.id !== LOBBY_LEVEL_ID);
  if (nonLobby) return nonLobby;
  return validLevels[0] ?? null;
}
