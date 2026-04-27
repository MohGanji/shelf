/**
 * Campaign levels (manifest + fetch + validate) and WIP levels (localStorage).
 * Invalid campaign entries are skipped with `console.warn` (plan § P5.2).
 * @module levels/loader
 */

import { BUNDLED_CAMPAIGN_LEVEL_FILENAMES } from "./defaults.js";
import { LOBBY_LEVEL_ID, validateLevel } from "./schema.js";
import { normalizeLevelForRuntime } from "./footprints.js";

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
        if (filename === "level-0-lobby.json") {
          console.error(`[loader] Lobby file not loaded: ${filename} HTTP ${res.status}`);
        } else {
          console.warn(`[loader] skipping campaign file ${filename}: HTTP ${res.status}`);
        }
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
        const isLobbyFile =
          filename === "level-0-lobby.json" ||
          (json &&
            typeof json === "object" &&
            !Array.isArray(json) &&
            /** @type {Record<string, unknown>} */ (json).id === LOBBY_LEVEL_ID);
        if (isLobbyFile) {
          console.error(
            "[loader] Lobby level failed validation (file omitted from campaign). The game expects this file to load for `level-0` — see errors below.",
            { filename, errors: v.errors },
          );
        } else {
          console.warn(`[loader] invalid campaign level (${filename}): ${first}`);
        }
        entries.push({ filename, valid: false, errors: v.errors });
        continue;
      }
      const runtimeLevel = normalizeLevelForRuntime(/** @type {Record<string, unknown>} */ (json));
      entries.push({ filename, valid: true, level: runtimeLevel });
      validLevels.push(runtimeLevel);
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
  return v.valid ? { valid: true, level: normalizeLevelForRuntime(raw) } : { valid: false, errors: v.errors };
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
 * Prefers the lobby level by default for normal boots.
 *
 * @param {Record<string, unknown>[]} validLevels
 * @param {{ progress: { currentLevel: number } }} save
 * @returns {Record<string, unknown> | null}
 */
export function selectPlaytestCampaignLevel(validLevels, _save) {
  if (!validLevels.length) return null;
  const lobby = validLevels.find((L) => L && L.id === LOBBY_LEVEL_ID);
  if (lobby) return lobby;
  const fallback = validLevels[0] ?? null;
  if (fallback) {
    console.warn(
      "[loader] Lobby (level-0) is not in the validated campaign list — using the first loaded level as a fallback (check earlier [loader] messages if level-0 failed validation or fetch).",
      { fallbackId: typeof fallback.id === "string" ? fallback.id : fallback },
    );
  }
  return fallback;
}

/** First-run tutorial (not in campaign manifest). */
export const TUTORIAL_LEVEL_FILENAME = "level-tutorial.json";

/**
 * `daily-YYYY-MM-DD.json` filenames that ship with the repo (editor “Open level”).
 * Dailies stay out of the linear campaign manifest list.
 * @returns {string[]}
 */
export function getBundledDailyLevelFilenames() {
  const start = new Date(2026, 3, 27);
  const out = [];
  for (let i = 0; i < 31; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push(`daily-${y}-${m}-${day}.json`);
  }
  return out;
}

/**
 * Tutorial + bundled daily files for the level editor picker (optional; avoids duplicating entries already in manifest).
 * @returns {string[]}
 */
export function getEditorSupplementaryFilenames() {
  return [TUTORIAL_LEVEL_FILENAME, ...getBundledDailyLevelFilenames()];
}

/**
 * @param {Date} [d]
 * @returns {string} YYYY-MM-DD in local time
 */
export function getLocalYyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {string} filename — e.g. `level-tutorial.json` or `daily-2026-04-28.json`
 * @param {string} [campaignBase] — default `./levels/`
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function fetchLevelByFilename(filename, campaignBase = DEFAULT_CAMPAIGN_BASE, opts = {}) {
  const base = campaignBase.endsWith("/") ? campaignBase : `${campaignBase}/`;
  const url = `${base}${filename.replace(/^\//, "")}`;
  const signal = opts.signal;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const v = validateLevel(data);
    if (!v.valid) {
      console.warn(`[loader] ${filename} validation failed:`, v.errors);
      return null;
    }
    return normalizeLevelForRuntime(/** @type {Record<string, unknown>} */ (data));
  } catch (e) {
    console.warn(`[loader] ${filename} load error:`, e);
    return null;
  }
}

/**
 * Light probe for `daily-${ymd}.json` (name only for lobby; full load at gate). Missing file ⇒ no daily map today.
 * @param {string} ymd — `YYYY-MM-DD`
 * @param {string} [campaignBase]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{ hasMap: boolean; displayName: string }>}
 */
export async function fetchDailyLobbyMeta(ymd, campaignBase = DEFAULT_CAMPAIGN_BASE, opts = {}) {
  const base = campaignBase.endsWith("/") ? campaignBase : `${campaignBase}/`;
  const key = typeof ymd === "string" ? ymd.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return { hasMap: false, displayName: "" };
  const fn = `daily-${key}.json`;
  const url = `${base}${fn}`;
  const signal = opts.signal;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { hasMap: false, displayName: "" };
    const data = await res.json();
    const v = validateLevel(data);
    if (!v.valid) {
      console.warn(`[loader] ${fn} invalid:`, v.errors);
      return { hasMap: false, displayName: "" };
    }
    const name = typeof data.name === "string" && data.name.trim() !== "" ? data.name.trim() : "Daily Arena";
    return { hasMap: true, displayName: name };
  } catch (e) {
    console.warn(`[loader] daily meta ${ymd} (${fn}):`, e);
    return { hasMap: false, displayName: "" };
  }
}
