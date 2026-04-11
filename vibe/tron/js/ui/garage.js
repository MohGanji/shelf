/**
 * Garage showroom UI (plan Phase 7). P7.4 adds colors, upgrades, stats panels.
 */

import { WORLD } from "../config.js";
import { loadCampaignManifest, upsertWipLevel } from "../levels/loader.js";
import { persistSave, spendCoins, unlockCosmeticColor } from "../data/savedata.js";
import { clampAttributeLevel } from "../game/attributes.js";
import { nitroBarsFromAttributeLevel } from "../game/nitroSystem.js";
import {
  appendManifestEntry,
  buildCampaignExportFilename,
  buildCampaignLevelJsonForExport,
  nextCampaignLevelIndex,
  triggerDownload,
} from "../levels/editorExport.js";
import { createBlankWipLevel, ensureEditorWipLevel } from "../levels/editorLevel.js";
import { mountEditorOrthographicViewport } from "../levels/editorView.js";
import { mountEditorWorkbench } from "../levels/editorWorkbench.js";
import { mountEditorPalette } from "../levels/editorPalette.js";
import { mountEditorPropertiesPanel } from "../levels/editorPropertiesPanel.js";
import { createEditorHistory } from "../levels/editorHistory.js";
import { LOBBY_LEVEL_ID, MIN_ARENA_SIZE, validateLevel } from "../levels/schema.js";
import { mountGarageShowroom } from "./garageShowroom.js";
import { setEditorPlaytestReturn } from "../sessionEditorPlaytest.js";
import { setSessionBootTarget } from "../sessionBoot.js";

/** Plan § Progression — same curve for every attribute. */
const ATTRIBUTE_UPGRADE_COSTS = [10, 20, 35, 50, 75, 100, 150, 200, 300];

/** Plan § Cosmetics — catalog (cost 0 = default owned). */
const GARAGE_COLOR_CATALOG = [
  { name: "Cyan", hex: "#00FFFF", cost: 0 },
  { name: "Hot Pink", hex: "#FF1493", cost: 50 },
  { name: "Crimson", hex: "#FF0033", cost: 50 },
  { name: "Gold", hex: "#FFD700", cost: 50 },
  { name: "White", hex: "#FFFFFF", cost: 50 },
  { name: "Neon Yellow", hex: "#CCFF00", cost: 50 },
  { name: "Coral", hex: "#FF6B6B", cost: 50 },
  { name: "Ice Blue", hex: "#66CCFF", cost: 50 },
  { name: "Tron Orange", hex: "#FF6600", cost: 50 },
];

/** @type {readonly (keyof import("../data/savedata.js").PlayerSave["player"]["attributes"])[]} */
const GARAGE_ATTR_KEYS = ["speed", "acceleration", "trailLength", "nitroBars", "handling"];

const ATTR_LABELS = {
  speed: "Speed",
  acceleration: "Acceleration",
  trailLength: "Trail length",
  nitroBars: "Nitro bars",
  handling: "Handling",
};

/**
 * @param {string} raw
 */
function normalizeHex(raw) {
  const s = String(raw || "").trim();
  if (!s) return "#00ffff";
  const h = s.startsWith("#") ? s.slice(1) : s;
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#00ffff";
  return `#${full.toLowerCase()}`;
}

/**
 * @param {number} level
 * @param {number} min
 * @param {number} max
 */
function attrScalar(level, min, max) {
  const lv = Math.max(1, Math.min(10, Math.floor(level)));
  return min + ((lv - 1) * (max - min)) / 9;
}

/**
 * @param {string} key
 * @param {number} level
 */
function formatAttrBenefit(key, level) {
  const L = clampAttributeLevel(level);
  switch (key) {
    case "speed":
      return `${Math.round(attrScalar(L, WORLD.defaultTopSpeed, 120))} u/s top speed`;
    case "acceleration":
      return `${attrScalar(L, WORLD.defaultAcceleration, 50).toFixed(1)} u/s² acceleration`;
    case "trailLength":
      return `${Math.round(attrScalar(L, 40, 100))} max trail segments`;
    case "nitroBars":
      return `${nitroBarsFromAttributeLevel(L)} nitro bars`;
    case "handling":
      return `${attrScalar(L, 2.5, 5.0).toFixed(2)} rad/s turn rate`;
    default:
      return "";
  }
}

/**
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {"cycle"|"trail"} kind
 * @param {string} hex
 */
function ownsColor(save, kind, hex) {
  const want = normalizeHex(hex);
  const list = kind === "cycle" ? save.cosmetics.ownedCycleColors : save.cosmetics.ownedTrailColors;
  return list.some((c) => normalizeHex(c) === want);
}

/**
 * @param {HTMLElement} el
 * @param {import("../data/savedata.js").PlayerSave} save
 */
function renderGarageStats(el, save) {
  const coins = save.progress.coins;
  const total = save.progress.totalCoinsEarned;
  const gate = save.progress.currentLevel;
  el.innerHTML = `
    <span class="garage-stats__item"><span class="garage-stats__label">NEON</span><span class="garage-stats__value">${coins}</span></span>
    <span class="garage-stats__item"><span class="garage-stats__label">Total earned</span><span class="garage-stats__value">${total}</span></span>
    <span class="garage-stats__item"><span class="garage-stats__label">Start gate</span><span class="garage-stats__value">Arena ${gate}</span></span>
  `;
}

/**
 * @param {HTMLElement} container
 * @param {"cycle"|"trail"} kind
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {() => void} onChanged
 */
function renderColorSwatches(container, kind, save, onChanged) {
  container.replaceChildren();
  const current =
    kind === "cycle" ? normalizeHex(save.player.cycleColor) : normalizeHex(save.player.trailColor);

  for (const entry of GARAGE_COLOR_CATALOG) {
    const hexNorm = normalizeHex(entry.hex);
    const owned = ownsColor(save, kind, entry.hex);
    const selected = current === hexNorm;
    const canAfford = save.progress.coins >= entry.cost;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "garage-swatch";
    btn.style.backgroundColor = entry.hex;
    if (selected) btn.classList.add("garage-swatch--selected");
    if (!owned) btn.classList.add("garage-swatch--locked");
    btn.title = entry.name;
    btn.setAttribute("aria-label", `${entry.name}${!owned && entry.cost > 0 ? `, unlock ${entry.cost} NEON` : ""}`);

    if (!owned && entry.cost > 0) {
      const tag = document.createElement("span");
      tag.className = "garage-swatch__tag";
      tag.textContent = String(entry.cost);
      btn.appendChild(tag);
    }

    if (!owned && entry.cost > 0 && !canAfford) {
      btn.disabled = true;
    }

    btn.addEventListener("click", () => {
      if (owned) {
        if (kind === "cycle") save.player.cycleColor = hexNorm;
        else save.player.trailColor = hexNorm;
        persistSave(save);
        onChanged();
        return;
      }
      if (entry.cost <= 0) {
        unlockCosmeticColor(save, kind, hexNorm);
        if (kind === "cycle") save.player.cycleColor = hexNorm;
        else save.player.trailColor = hexNorm;
        persistSave(save);
        onChanged();
        return;
      }
      if (save.progress.coins < entry.cost) return;
      spendCoins(save, entry.cost);
      unlockCosmeticColor(save, kind, hexNorm);
      if (kind === "cycle") save.player.cycleColor = hexNorm;
      else save.player.trailColor = hexNorm;
      persistSave(save);
      onChanged();
    });

    container.appendChild(btn);
  }
}

/**
 * @param {HTMLElement} container
 * @param {import("../data/savedata.js").PlayerSave} save
 * @param {() => void} onChanged
 */
function renderAttributeUpgrades(container, save, onChanged) {
  container.replaceChildren();

  for (const key of GARAGE_ATTR_KEYS) {
    const level = clampAttributeLevel(save.player.attributes[key]);
    const card = document.createElement("div");
    card.className = "garage-upgrade-card";

    const title = document.createElement("p");
    title.className = "garage-upgrade-card__title";
    title.textContent = ATTR_LABELS[key];

    const meta = document.createElement("p");
    meta.className = "garage-upgrade-card__meta";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "garage-upgrade-card__btn";

    if (level >= 10) {
      meta.innerHTML = `<strong>Lv ${level}/10</strong> — ${formatAttrBenefit(key, level)}<br/>Maximum level reached.`;
      btn.textContent = "MAX";
      btn.disabled = true;
    } else {
      const cost = ATTRIBUTE_UPGRADE_COSTS[level - 1] ?? 0;
      const nextLv = level + 1;
      meta.innerHTML = `<strong>Lv ${level}/10</strong> — ${formatAttrBenefit(key, level)}<br/>Next (${nextLv}/10): ${formatAttrBenefit(
        key,
        nextLv,
      )} · <strong>${cost}</strong> NEON`;
      btn.textContent = "UPGRADE";
      btn.disabled = save.progress.coins < cost;
      btn.addEventListener("click", () => {
        if (level >= 10 || save.progress.coins < cost) return;
        spendCoins(save, cost);
        save.player.attributes[key] = level + 1;
        persistSave(save);
        onChanged();
      });
    }

    card.append(title, meta, btn);
    container.appendChild(card);
  }
}

/**
 * @typedef {{ dispose(): void }} GarageController
 */

/**
 * @returns {GarageController}
 */
export function createGarageController() {
  return {
    dispose() {},
  };
}

/**
 * P7.2 routing destination — P7.3 Three.js showroom on canvas + top chrome.
 *
 * @param {{
 *   game: { renderer: import("three").WebGLRenderer };
 *   save: import("../data/savedata.js").PlayerSave;
 *   canvas: HTMLCanvasElement;
 *   onReturnToLobby: () => void;
 * }} opts
 * @returns {{ dispose(): void }}
 */
export function mountGarageDestinationScreen(opts) {
  const { game, save, canvas, onReturnToLobby } = opts;
  const root = document.getElementById("garage-destination");
  if (!root) {
    return { dispose() {} };
  }
  root.hidden = false;
  root.classList.remove("tron-destination--hidden");
  if (canvas) canvas.removeAttribute("aria-hidden");

  const showroom = mountGarageShowroom({
    renderer: game.renderer,
    canvas,
    save,
  });

  const statsEl = document.getElementById("garage-stats");
  const cycleSw = document.getElementById("garage-cycle-swatches");
  const trailSw = document.getElementById("garage-trail-swatches");
  const upgradesEl = document.getElementById("garage-upgrades");

  function refreshGarageCommerce() {
    if (statsEl) renderGarageStats(statsEl, save);
    if (cycleSw) renderColorSwatches(cycleSw, "cycle", save, refreshGarageCommerce);
    if (trailSw) renderColorSwatches(trailSw, "trail", save, refreshGarageCommerce);
    if (upgradesEl) renderAttributeUpgrades(upgradesEl, save, refreshGarageCommerce);
    showroom.syncFromSave(save);
  }

  refreshGarageCommerce();

  const onReturn = () => onReturnToLobby();

  const btn = root.querySelector("[data-return-lobby]");
  const onClick = () => onReturn();
  if (btn) btn.addEventListener("click", onClick);

  const onKey = (e) => {
    if (e.key === "Escape") onReturn();
  };
  window.addEventListener("keydown", onKey);

  return {
    dispose() {
      showroom.dispose();
      window.removeEventListener("keydown", onKey);
      if (btn) btn.removeEventListener("click", onClick);
      root.hidden = true;
      root.classList.add("tron-destination--hidden");
    },
  };
}

/**
 * P7.2 Architect / level editor entry — P6.2 palette + P6.1 viewport + P6.3 workbench.
 *
 * @param {{
 *   game: { renderer: import("three").WebGLRenderer };
 *   onReturnToLobby: () => void;
 *   initialWipLevelId?: string;
 * }} opts
 * @returns {{ dispose(): void }}
 */
export function mountEditorDestinationScreen(opts) {
  const root = document.getElementById("editor-destination");
  const paletteRoot = document.getElementById("editor-palette-root");
  const propsRoot = document.getElementById("editor-properties-root");
  const newLevelDialog = /** @type {HTMLDialogElement | null} */ (
    document.getElementById("editor-new-level-dialog")
  );
  const newLevelForm = document.getElementById("editor-new-level-form");
  const newLevelErr = document.getElementById("editor-new-level-error");
  if (!root || !opts.game?.renderer) {
    return { dispose() {} };
  }
  root.hidden = false;
  root.classList.remove("tron-destination--hidden");
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById("game-canvas"));
  if (!canvas || !opts.game?.renderer) {
    return { dispose() {} };
  }
  /* P6.1 — orthographic grid renders on the canvas; keep it in the accessibility tree. */
  canvas.removeAttribute("aria-hidden");

  /**
   * P6.5 — viewport + workbench + UI for one WIP level; dispose fully before remounting (arena size is immutable per level).
   * @param {Record<string, unknown>} level
   */
  function mountEditorSession(level) {
    const aw = typeof level.arenaWidth === "number" ? level.arenaWidth : 80;
    const ad = typeof level.arenaDepth === "number" ? level.arenaDepth : 80;

    const viewport = mountEditorOrthographicViewport({
      renderer: opts.game.renderer,
      canvas,
      arenaWidth: aw,
      arenaDepth: ad,
    });

    /** P6.2 — floor-object palette (selection feeds P6.3 placement). */
    let paletteCtl = { getSelection: () => null, dispose() {} };
    if (paletteRoot) {
      paletteRoot.hidden = false;
      paletteRoot.classList.remove("tron-destination--hidden");
      paletteCtl = mountEditorPalette(paletteRoot);
    }

    /** P6.6 — undo/redo snapshots (place/move/delete/properties). */
    const history = createEditorHistory(level);

    /** P6.4 — properties panel (synced to workbench selection). */
    const editorUi = { syncProps: () => {} };
    let propsCtl = { sync: () => {}, dispose() {} };

    const workbench = mountEditorWorkbench({
      viewport,
      getPaletteSelection: () => paletteCtl.getSelection(),
      level,
      onPersist: (L) => upsertWipLevel(L),
      onSelectionChange: () => editorUi.syncProps(),
      beforeMutation: () => history.beforeMutation(),
    });

    function afterHistoryRestore() {
      upsertWipLevel(level);
      workbench.clearSelection();
      workbench.refresh();
      propsCtl.sync();
    }

    if (propsRoot) {
      propsRoot.hidden = false;
      propsRoot.classList.remove("tron-destination--hidden");
      propsCtl = mountEditorPropertiesPanel(propsRoot, {
        level,
        getSelection: () => workbench.getSelection(),
        onApply: () => workbench.refresh(),
        beforeMutation: () => history.beforeMutation(),
      });
      editorUi.syncProps = () => propsCtl.sync();
      propsCtl.sync();
    }

    return { level, viewport, workbench, paletteCtl, propsCtl, history, afterHistoryRestore };
  }

  /**
   * @param {{
   *   propsCtl: { dispose(): void };
   *   workbench: { dispose(): void };
   *   viewport: { dispose(): void };
   *   paletteCtl: { dispose(): void };
   * }} s
   */
  function disposeEditorSession(s) {
    s.propsCtl.dispose();
    s.workbench.dispose();
    s.viewport.dispose();
    s.paletteCtl.dispose();
  }

  let session = mountEditorSession(ensureEditorWipLevel(opts.initialWipLevelId));

  const exportErrEl = document.getElementById("editor-export-error");

  /** @param {string} msg */
  function setExportError(msg) {
    if (!exportErrEl) return;
    if (!msg) {
      exportErrEl.hidden = true;
      exportErrEl.textContent = "";
      return;
    }
    exportErrEl.hidden = false;
    exportErrEl.textContent = msg;
  }

  /** P6.7 — validated JSON download; `id` becomes `level-{N}` from manifest ordering. */
  async function runExportLevel() {
    setExportError("");
    const level = session.level;
    const v = validateLevel(level);
    if (!v.valid) {
      setExportError(`Invalid level: ${v.errors[0] ?? "validation failed"}`);
      return;
    }
    let manifest;
    try {
      manifest = await loadCampaignManifest();
    } catch {
      manifest = [];
    }
    const nextN = nextCampaignLevelIndex(manifest);
    const nameStr = typeof level.name === "string" ? level.name : "Untitled";
    const filename = buildCampaignExportFilename(nameStr, nextN);
    const campaignId = `level-${nextN}`;
    const payload = buildCampaignLevelJsonForExport(level, campaignId);
    triggerDownload(filename, JSON.stringify(payload, null, 2));
  }

  /** P6.7 — manifest.json with this export filename appended (no duplicate entries). */
  async function runExportManifest() {
    setExportError("");
    const level = session.level;
    const v = validateLevel(level);
    if (!v.valid) {
      setExportError(`Invalid level: ${v.errors[0] ?? "validation failed"}`);
      return;
    }
    let manifest;
    try {
      manifest = await loadCampaignManifest();
    } catch {
      manifest = [];
    }
    const nextN = nextCampaignLevelIndex(manifest);
    const nameStr = typeof level.name === "string" ? level.name : "Untitled";
    const filename = buildCampaignExportFilename(nameStr, nextN);
    const updated = appendManifestEntry(manifest, filename);
    triggerDownload("manifest.json", JSON.stringify(updated, null, 2));
  }

  const exportLevelBtn = root.querySelector("[data-editor-export-level]");
  const exportManifestBtn = root.querySelector("[data-editor-export-manifest]");
  const importLevelBtn = root.querySelector("[data-editor-import-level]");
  const playtestBtn = root.querySelector("[data-editor-playtest]");
  const importFileInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("editor-import-file")
  );
  const onExportLevelClick = () => void runExportLevel();
  const onExportManifestClick = () => void runExportManifest();
  if (exportLevelBtn) exportLevelBtn.addEventListener("click", onExportLevelClick);
  if (exportManifestBtn) exportManifestBtn.addEventListener("click", onExportManifestClick);

  /** P6.8 — file picker → parse JSON → validateLevel → new WIP id → persist → remount editor. */
  async function runImportLevelFromFile(file) {
    setExportError("");
    let text;
    try {
      text = await file.text();
    } catch (e) {
      setExportError(`Invalid level file: ${String(e)}`);
      return;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      setExportError("Invalid level file: Invalid JSON");
      return;
    }
    const v = validateLevel(json);
    if (!v.valid) {
      setExportError(`Invalid level file: ${v.errors[0] ?? "validation failed"}`);
      return;
    }
    if (json.id === LOBBY_LEVEL_ID) {
      setExportError("Invalid level file: Lobby campaign level cannot be imported as WIP");
      return;
    }
    const wipId = `wip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const next = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(json)));
    next.id = wipId;
    upsertWipLevel(next);
    disposeEditorSession(session);
    session = mountEditorSession(/** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(next))));
  }

  const onImportLevelClick = () => {
    if (importFileInput) importFileInput.click();
  };

  const onImportFileChange = () => {
    const f = importFileInput?.files?.[0];
    if (importFileInput) importFileInput.value = "";
    if (f) void runImportLevelFromFile(f);
  };

  if (importLevelBtn) importLevelBtn.addEventListener("click", onImportLevelClick);
  if (importFileInput) importFileInput.addEventListener("change", onImportFileChange);

  /** P6.9 — validated WIP → session flag + boot target → reload into arena play-test. */
  const onPlaytestClick = () => {
    const level = session.level;
    const lid = level && typeof level.id === "string" ? level.id.trim() : "";
    if (!lid) {
      setExportError("Cannot play-test: level has no id.");
      return;
    }
    const v = validateLevel(level);
    if (!v.valid) {
      setExportError(`Cannot play-test: ${v.errors[0] ?? "invalid level"}`);
      return;
    }
    upsertWipLevel(level);
    setExportError("");
    setEditorPlaytestReturn({ levelId: lid });
    setSessionBootTarget({ mode: "wip_playtest", levelId: lid });
    window.location.reload();
  };
  if (playtestBtn) playtestBtn.addEventListener("click", onPlaytestClick);

  /** Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y redo — skip when typing in form fields. */
  const onUndoRedoKey = (/** @type {KeyboardEvent} */ e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement
    ) {
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        if (session.history.redo()) session.afterHistoryRestore();
      } else if (session.history.undo()) {
        session.afterHistoryRestore();
      }
      return;
    }
    if (k === "y") {
      e.preventDefault();
      if (session.history.redo()) session.afterHistoryRestore();
    }
  };
  window.addEventListener("keydown", onUndoRedoKey);

  const onReturn = () => opts.onReturnToLobby();

  const btn = root.querySelector("[data-return-lobby]");
  const newLevelBtn = root.querySelector("[data-editor-new-level]");
  const onClick = () => onReturn();
  if (btn) btn.addEventListener("click", onClick);

  /** @param {string} msg */
  function setNewLevelError(msg) {
    if (!newLevelErr) return;
    if (!msg) {
      newLevelErr.hidden = true;
      newLevelErr.textContent = "";
      return;
    }
    newLevelErr.hidden = false;
    newLevelErr.textContent = msg;
  }

  function openNewLevelDialog() {
    setNewLevelError("");
    if (newLevelDialog) {
      try {
        newLevelDialog.showModal();
      } catch {
        /* already open */
      }
    }
  }

  /** @param {Event} e */
  function onNewLevelSubmit(e) {
    e.preventDefault();
    setNewLevelError("");
    const fd = newLevelForm instanceof HTMLFormElement ? new FormData(newLevelForm) : null;
    const rawW = fd ? fd.get("arenaWidth") : null;
    const rawD = fd ? fd.get("arenaDepth") : null;
    const w = Math.floor(Number(rawW));
    const d = Math.floor(Number(rawD));
    if (!Number.isFinite(w) || !Number.isFinite(d)) {
      setNewLevelError(`Enter whole numbers for width and depth (minimum ${MIN_ARENA_SIZE}).`);
      return;
    }
    if (w < MIN_ARENA_SIZE || d < MIN_ARENA_SIZE) {
      setNewLevelError(`Arena must be at least ${MIN_ARENA_SIZE}×${MIN_ARENA_SIZE} units.`);
      return;
    }
    const next = createBlankWipLevel(w, d);
    upsertWipLevel(next);
    setExportError("");
    disposeEditorSession(session);
    session = mountEditorSession(/** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(next))));
    if (newLevelDialog) newLevelDialog.close();
  }

  const onNewLevelClick = () => openNewLevelDialog();
  if (newLevelBtn) newLevelBtn.addEventListener("click", onNewLevelClick);

  const cancelBtn = document.querySelector("[data-editor-new-level-cancel]");
  const onNewLevelCancel = () => {
    setNewLevelError("");
    if (newLevelDialog) newLevelDialog.close();
  };
  if (cancelBtn) cancelBtn.addEventListener("click", onNewLevelCancel);

  if (newLevelForm instanceof HTMLFormElement) {
    newLevelForm.addEventListener("submit", onNewLevelSubmit);
  }

  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (newLevelDialog?.open) {
      e.preventDefault();
      e.stopPropagation();
      newLevelDialog.close();
      return;
    }
    onReturn();
  };
  window.addEventListener("keydown", onKey);

  return {
    dispose() {
      disposeEditorSession(session);
      if (propsRoot) {
        propsRoot.hidden = true;
        propsRoot.classList.add("tron-destination--hidden");
      }
      if (paletteRoot) {
        paletteRoot.hidden = true;
        paletteRoot.classList.add("tron-destination--hidden");
      }
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onUndoRedoKey);
      if (btn) btn.removeEventListener("click", onClick);
      if (newLevelBtn) newLevelBtn.removeEventListener("click", onNewLevelClick);
      if (cancelBtn) cancelBtn.removeEventListener("click", onNewLevelCancel);
      if (newLevelForm instanceof HTMLFormElement) {
        newLevelForm.removeEventListener("submit", onNewLevelSubmit);
      }
      if (exportLevelBtn) exportLevelBtn.removeEventListener("click", onExportLevelClick);
      if (exportManifestBtn) exportManifestBtn.removeEventListener("click", onExportManifestClick);
      if (importLevelBtn) importLevelBtn.removeEventListener("click", onImportLevelClick);
      if (importFileInput) importFileInput.removeEventListener("change", onImportFileChange);
      if (playtestBtn) playtestBtn.removeEventListener("click", onPlaytestClick);
      setExportError("");
      root.hidden = true;
      root.classList.add("tron-destination--hidden");
      if (canvas) canvas.removeAttribute("aria-hidden");
    },
  };
}
