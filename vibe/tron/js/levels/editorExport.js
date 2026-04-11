/**
 * P6.7 — Export WIP level to campaign filename + optional manifest append (browser download).
 * @module levels/editorExport
 */

/**
 * Level name → filename slug: lowercase, spaces → hyphens, strip non-alphanumeric, max 30 chars.
 * @param {unknown} name
 * @returns {string}
 */
export function slugifyLevelName(name) {
  const raw = typeof name === "string" ? name : "";
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length > 30) {
    s = s.slice(0, 30).replace(/-+$/g, "");
  }
  return s || "untitled";
}

/**
 * Highest `N` from manifest filenames matching `level-{N}-*.json`.
 * @param {string[]} filenames
 * @returns {number}
 */
export function maxCampaignLevelIndexFromFilenames(filenames) {
  let max = -1;
  for (const f of filenames) {
    const m = /^level-(\d+)-/i.exec(String(f).trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Next campaign index: one above max manifest `level-N`, at least 1 (never `0` — reserved for lobby).
 * @param {string[]} manifestFilenames
 * @returns {number}
 */
export function nextCampaignLevelIndex(manifestFilenames) {
  const max = maxCampaignLevelIndexFromFilenames(manifestFilenames);
  return Math.max(1, max + 1);
}

/**
 * @param {string} levelName
 * @param {number} campaignIndex
 * @returns {string} e.g. `level-4-the-maze.json`
 */
export function buildCampaignExportFilename(levelName, campaignIndex) {
  const slug = slugifyLevelName(levelName);
  return `level-${campaignIndex}-${slug}.json`;
}

/**
 * Deep clone and set `id` to `level-{N}` for campaign drop-in.
 * @param {Record<string, unknown>} level
 * @param {string} campaignId e.g. `level-6`
 * @returns {Record<string, unknown>}
 */
export function buildCampaignLevelJsonForExport(level, campaignId) {
  const out = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(level)));
  out.id = campaignId;
  return out;
}

/**
 * Append filename if missing (idempotent for repeated downloads).
 * @param {string[]} manifest
 * @param {string} newFilename
 * @returns {string[]}
 */
export function appendManifestEntry(manifest, newFilename) {
  const next = [...manifest];
  if (!next.includes(newFilename)) next.push(newFilename);
  return next;
}

/**
 * @param {string} filename
 * @param {string} text
 * @param {string} [mime]
 */
export function triggerDownload(filename, text, mime = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
