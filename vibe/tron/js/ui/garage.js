/**
 * Garage showroom UI (plan Phase 7). P7.4 adds colors, upgrades, stats panels.
 */

import { upsertWipLevel } from "../levels/loader.js";
import { ensureEditorWipLevel } from "../levels/editorLevel.js";
import { mountEditorOrthographicViewport } from "../levels/editorView.js";
import { mountEditorWorkbench } from "../levels/editorWorkbench.js";
import { mountEditorPalette } from "../levels/editorPalette.js";
import { mountEditorPropertiesPanel } from "../levels/editorPropertiesPanel.js";
import { mountGarageShowroom } from "./garageShowroom.js";

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
 * }} opts
 * @returns {{ dispose(): void }}
 */
export function mountEditorDestinationScreen(opts) {
  const root = document.getElementById("editor-destination");
  const paletteRoot = document.getElementById("editor-palette-root");
  const propsRoot = document.getElementById("editor-properties-root");
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

  const level = ensureEditorWipLevel();
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

  /** P6.4 — properties panel (synced to workbench selection). */
  const editorUi = { syncProps: () => {} };
  let propsCtl = { sync: () => {}, dispose() {} };

  const workbench = mountEditorWorkbench({
    viewport,
    getPaletteSelection: () => paletteCtl.getSelection(),
    level,
    onPersist: (L) => upsertWipLevel(L),
    onSelectionChange: () => editorUi.syncProps(),
  });

  if (propsRoot) {
    propsRoot.hidden = false;
    propsRoot.classList.remove("tron-destination--hidden");
    propsCtl = mountEditorPropertiesPanel(propsRoot, {
      level,
      getSelection: () => workbench.getSelection(),
      onApply: () => workbench.refresh(),
    });
    editorUi.syncProps = () => propsCtl.sync();
    propsCtl.sync();
  }

  const onReturn = () => opts.onReturnToLobby();

  const btn = root.querySelector("[data-return-lobby]");
  const onClick = () => onReturn();
  if (btn) btn.addEventListener("click", onClick);

  const onKey = (e) => {
    if (e.key === "Escape") onReturn();
  };
  window.addEventListener("keydown", onKey);

  return {
    dispose() {
      propsCtl.dispose();
      workbench.dispose();
      viewport.dispose();
      paletteCtl.dispose();
      if (propsRoot) {
        propsRoot.hidden = true;
        propsRoot.classList.add("tron-destination--hidden");
      }
      if (paletteRoot) {
        paletteRoot.hidden = true;
        paletteRoot.classList.add("tron-destination--hidden");
      }
      window.removeEventListener("keydown", onKey);
      if (btn) btn.removeEventListener("click", onClick);
      root.hidden = true;
      root.classList.add("tron-destination--hidden");
      if (canvas) canvas.removeAttribute("aria-hidden");
    },
  };
}
