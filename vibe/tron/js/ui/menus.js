/**
 * Pause menu, controls overlay, settings (plan P7.5–P7.6).
 */

import { persistSave, setControlsShown } from "../data/savedata.js";

/** While true, cycle keyboard input is ignored (plan § Level Transitions pattern). */
let controlsOverlayBlocksInput = false;

/** While true, arena gameplay input is ignored (plan X1 / P7.6 — pause). */
let pauseOverlayBlocksInput = false;

/** While post-exit destination overlay is visible. */
let levelExitDestinationOverlayBlocksInput = false;

/** @type {AbortController | null} */
let controlsOverlayListenersAc = null;

/** @type {(() => void) | null} */
let controlsPersistOnDismiss = null;

function abortControlsOverlayListenersOnly() {
  controlsOverlayListenersAc?.abort();
  controlsOverlayListenersAc = null;
}

/** Fired on `window` when first-visit controls overlay opens/closes — clears held keys when opening. */
export const CONTROLS_OVERLAY_SESSION_EVENT = "tron-controls-overlay-session";

/** Fired when pause opens/closes — clears held keys when opening (same contract as tunnel). */
export const PAUSE_OVERLAY_SESSION_EVENT = "tron-pause-overlay-session";

/** Exit-gate “where next?” menu (post level clear, before reload). */
export const LEVEL_EXIT_DESTINATION_OVERLAY_SESSION_EVENT = "tron-level-exit-destination-overlay-session";

/** True while the first-visit controls overlay is visible — same contract as `isTunnelBlockingInput`. */
export function isControlsOverlayBlockingInput() {
  return controlsOverlayBlocksInput;
}

/** True while the pause menu is visible — same contract as `isTunnelBlockingInput`. */
export function isPauseOverlayBlockingInput() {
  return pauseOverlayBlocksInput;
}

/** True while the exit-gate “next level vs lobby” menu is visible. */
export function isLevelExitDestinationOverlayBlockingInput() {
  return levelExitDestinationOverlayBlocksInput;
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

function setLevelExitDestinationOverlayBlocksInput(active) {
  levelExitDestinationOverlayBlocksInput = active;
  window.dispatchEvent(
    new CustomEvent(LEVEL_EXIT_DESTINATION_OVERLAY_SESSION_EVENT, {
      detail: { active },
    }),
  );
}

/**
 * @param {{
 *   root: HTMLElement | null;
 *   onResume: () => void;
 *   onQuitToLobby: () => void;
 * }} opts
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
 * After riding the exit gate: choose next arena or lobby (reload via session boot).
 *
 * @param {{
 *   root: HTMLElement | null;
 *   onPickNextLevel: (levelId: string) => void;
 *   onPickLobby: () => void;
 * }} opts
 */
export function createLevelExitDestinationOverlayController(opts) {
  const { root, onPickNextLevel, onPickLobby } = opts;
  if (!root) return null;

  const nextBtn = root.querySelector("[data-level-exit-next]");
  const lobbyBtn = root.querySelector("[data-level-exit-lobby]");
  if (!(nextBtn instanceof HTMLButtonElement) || !(lobbyBtn instanceof HTMLButtonElement)) return null;

  const ac = new AbortController();
  const sig = { signal: ac.signal };

  /** @type {string | null} */
  let pendingNextCampaignLevelId = null;

  function hideOverlayAndUnblockInput() {
    root.hidden = true;
    pendingNextCampaignLevelId = null;
    setLevelExitDestinationOverlayBlocksInput(false);
  }

  /**
   * @param {{
   *   title?: string;
   *   nextLevelId: string | null;
   *   nextLevelDisplayName?: string;
   *   earnedCoins?: number;
   *   totalCoins?: number;
   * }} spec
   */
  function open(spec) {
    const titleEl = root.querySelector("[data-level-exit-title]");
    if (titleEl instanceof HTMLElement) {
      titleEl.textContent =
        typeof spec.title === "string" && spec.title.trim() ? spec.title.trim() : "LEVEL CLEAR";
    }
    const earnedEl = root.querySelector("[data-level-exit-earned]");
    const totalEl = root.querySelector("[data-level-exit-total]");
    const ec =
      typeof spec.earnedCoins === "number" && Number.isFinite(spec.earnedCoins)
        ? Math.max(0, Math.floor(spec.earnedCoins))
        : 0;
    const tc =
      typeof spec.totalCoins === "number" && Number.isFinite(spec.totalCoins)
        ? Math.max(0, Math.floor(spec.totalCoins))
        : 0;
    if (earnedEl instanceof HTMLElement) earnedEl.textContent = String(ec);
    if (totalEl instanceof HTMLElement) totalEl.textContent = String(tc);
    const id =
      typeof spec.nextLevelId === "string" && spec.nextLevelId.trim().length > 0
        ? spec.nextLevelId.trim()
        : null;
    pendingNextCampaignLevelId = id;
    const display =
      typeof spec.nextLevelDisplayName === "string" && spec.nextLevelDisplayName.trim()
        ? spec.nextLevelDisplayName.trim()
        : "";
    if (id) {
      nextBtn.hidden = false;
      nextBtn.disabled = false;
      nextBtn.textContent = display ? `NEXT LEVEL: ${display}` : `NEXT LEVEL: ${id}`;
      nextBtn.focus();
    } else {
      nextBtn.hidden = true;
      nextBtn.disabled = true;
      lobbyBtn.focus();
    }
    root.hidden = false;
    setLevelExitDestinationOverlayBlocksInput(true);
  }

  nextBtn.addEventListener(
    "click",
    () => {
      if (!pendingNextCampaignLevelId) return;
      const id = pendingNextCampaignLevelId;
      hideOverlayAndUnblockInput();
      onPickNextLevel(id);
    },
    sig,
  );
  lobbyBtn.addEventListener(
    "click",
    () => {
      hideOverlayAndUnblockInput();
      onPickLobby();
    },
    sig,
  );

  return {
    open,
    close: hideOverlayAndUnblockInput,
    dispose() {
      ac.abort();
    },
  };
}

/**
 * Tear down listeners + optionally persist first-visit dismiss, then hide the overlay.
 */
function teardownControlsOverlaySessionUi() {
  const persistFn = controlsPersistOnDismiss;
  abortControlsOverlayListenersOnly();
  controlsPersistOnDismiss = null;
  persistFn?.();

  const root = document.getElementById("controls-overlay");
  if (root) root.hidden = true;
  setControlsOverlayBlocksInput(false);
}

/** @returns {boolean} True if something was dismissed. */
export function attemptDismissControlsOverlay() {
  const root = document.getElementById("controls-overlay");
  if (!root || root.hidden || !controlsOverlayBlocksInput) return false;
  teardownControlsOverlaySessionUi();
  return true;
}

/**
 * Opens the CONTROLS dialog for first-run tutorial / lobby onboarding (fullscreen overlay).

 *
 * ESC / dismiss button teardown is routed through {@link attemptDismissControlsOverlay}; `main.js` calls
 * that on capture-phase Escape before resume-from-pause so controls can stack above pause cleanly.
 *
 * @param {{
 *   persistSave?: import("../data/savedata.js").PlayerSave;
 * }} [opts]
 * @returns {boolean}
 */
export function openControlsOverlaySession(opts = {}) {
  const persistSaveOpt = opts.persistSave;
  attemptDismissControlsOverlay();

  const root = document.getElementById("controls-overlay");
  const dismissBtn = document.getElementById("controls-overlay-dismiss");
  if (!root || !(dismissBtn instanceof HTMLButtonElement)) return false;

  if (persistSaveOpt) {
    controlsPersistOnDismiss = () => {
      setControlsShown(persistSaveOpt, true);
      persistSave(persistSaveOpt);
    };
  } else {
    controlsPersistOnDismiss = null;
  }

  abortControlsOverlayListenersOnly();
  controlsOverlayListenersAc = new AbortController();
  const sig = { signal: controlsOverlayListenersAc.signal };

  dismissBtn.addEventListener("click", () => attemptDismissControlsOverlay(), sig);

  root.hidden = false;
  setControlsOverlayBlocksInput(true);
  dismissBtn.focus();
  return true;
}

/**
 * P7.5 — Auto-show once (`controlsShown` false): first-run **tutorial** arena by default flow,
 * or **lobby** for migrated saves / anyone who reaches hub without having dismissed yet.
 * Blocks cycle input until dismissed.
 * @param {{
 *   save: import("../data/savedata.js").PlayerSave;
 *   venue?: "tutorial" | "lobby";
 * }} opts
 * @returns {{ dispose(): void } | null}
 */
export function showFirstVisitControlsOverlayIfNeeded(opts) {
  const { save, venue = "lobby" } = opts;
  if (save.controlsShown) return null;
  /** First-run combat tutorial (`tutorialCleared` still false): overlay belongs on tutorial, not lobby. */
  if (venue === "lobby" && save.tutorialCleared === false) return null;

  if (!openControlsOverlaySession({ persistSave: save })) return null;

  return {
    dispose() {
      attemptDismissControlsOverlay();
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
