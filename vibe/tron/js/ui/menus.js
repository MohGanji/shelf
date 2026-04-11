/**
 * Pause menu, controls overlay, settings (plan P7.5–P7.6).
 */

import { persistSave, setControlsShown } from "../data/savedata.js";

/** While true, cycle keyboard input is ignored (plan § Level Transitions pattern). */
let controlsOverlayBlocksInput = false;

/** While true, arena gameplay input is ignored (plan X1 / P7.6 — pause). */
let pauseOverlayBlocksInput = false;

/** Fired on `window` when first-visit controls overlay opens/closes — clears held keys when opening. */
export const CONTROLS_OVERLAY_SESSION_EVENT = "tron-controls-overlay-session";

/** Fired when pause opens/closes — clears held keys when opening (same contract as tunnel). */
export const PAUSE_OVERLAY_SESSION_EVENT = "tron-pause-overlay-session";

/** True while the first-visit controls overlay is visible — same contract as `isTunnelBlockingInput`. */
export function isControlsOverlayBlockingInput() {
  return controlsOverlayBlocksInput;
}

/** True while the pause menu is visible — same contract as `isTunnelBlockingInput`. */
export function isPauseOverlayBlockingInput() {
  return pauseOverlayBlocksInput;
}

/**
 * @param {boolean} active
 */
function setControlsOverlayBlocksInput(active) {
  controlsOverlayBlocksInput = active;
  window.dispatchEvent(
    new CustomEvent(CONTROLS_OVERLAY_SESSION_EVENT, {
      detail: { active },
    }),
  );
}

/**
 * @param {boolean} active
 */
function setPauseOverlayBlocksInput(active) {
  pauseOverlayBlocksInput = active;
  window.dispatchEvent(
    new CustomEvent(PAUSE_OVERLAY_SESSION_EVENT, {
      detail: { active },
    }),
  );
}

/**
 * @param {{ root: HTMLElement | null; onResume: () => void; onQuitToLobby: () => void }} opts
 * @returns {{ open: () => void; close: () => void; dispose: () => void } | null}
 */
export function createPauseMenuController(opts) {
  const { root, onResume, onQuitToLobby } = opts;
  if (!root) return null;

  const resumeBtn = root.querySelector("[data-pause-resume]");
  const quitBtn = root.querySelector("[data-pause-quit]");
  if (!(resumeBtn instanceof HTMLButtonElement) || !(quitBtn instanceof HTMLButtonElement)) return null;

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  function open() {
    root.hidden = false;
    setPauseOverlayBlocksInput(true);
    resumeBtn.focus();
  }

  function close() {
    root.hidden = true;
    setPauseOverlayBlocksInput(false);
  }

  resumeBtn.addEventListener("click", () => onResume(), sig);
  quitBtn.addEventListener("click", () => onQuitToLobby(), sig);

  return {
    open,
    close,
    dispose() {
      ac.abort();
    },
  };
}

/**
 * P7.5 — Auto-show on first lobby entry (`controlsShown` false). Blocks cycle input until dismissed.
 * @param {{ save: import("../data/savedata.js").PlayerSave }} opts
 * @returns {{ dispose(): void } | null}
 */
export function showFirstVisitControlsOverlayIfNeeded(opts) {
  const { save } = opts;
  if (save.controlsShown) return null;

  const root = document.getElementById("controls-overlay");
  const dismissBtn = document.getElementById("controls-overlay-dismiss");
  if (!root || !dismissBtn) return null;

  root.hidden = false;
  setControlsOverlayBlocksInput(true);
  dismissBtn.focus();

  const ac = new AbortController();
  const sig = { signal: ac.signal };
  let finished = false;

  function dismiss() {
    if (finished) return;
    finished = true;
    ac.abort();
    root.hidden = true;
    setControlsOverlayBlocksInput(false);
    setControlsShown(save, true);
    persistSave(save);
  }

  dismissBtn.addEventListener("click", () => dismiss(), sig);

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    },
    sig,
  );

  return {
    dispose() {
      if (!ac.signal.aborted) dismiss();
    },
  };
}

/**
 * @typedef {{ dispose(): void }} MenuController
 */

/**
 * @returns {MenuController}
 */
export function createMenusController() {
  return {
    dispose() {},
  };
}
