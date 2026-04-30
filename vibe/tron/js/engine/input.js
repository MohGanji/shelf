import {
  CONTROLS_OVERLAY_SESSION_EVENT,
  isControlsOverlayBlockingInput,
  isLevelExitDestinationOverlayBlockingInput,
  isPauseOverlayBlockingInput,
  LEVEL_EXIT_DESTINATION_OVERLAY_SESSION_EVENT,
  PAUSE_OVERLAY_SESSION_EVENT,
} from "../ui/menus.js";
import { isTunnelBlockingInput, TUNNEL_SESSION_EVENT } from "./tunnel.js";

/**
 * @typedef {object} TronCycleKeyState
 * @property {boolean} w
 * @property {boolean} a
 * @property {boolean} s
 * @property {boolean} d
 * @property {boolean} space
 * @property {boolean} e — equippable activate (plan P3.4 Shield)
 */

/**
 * Keyboard input for the light cycle (WASD + arrows, Space).
 * Tunnel blocks input — no buffering (plan § Level Transitions).
 *
 * @returns {{ state: TronCycleKeyState; dispose: () => void }}
 */
export function createTronCycleKeyState() {
  /** @type {TronCycleKeyState} */
  const state = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    e: false,
  };

  const controller = new AbortController();
  const opts = { signal: controller.signal };

  function mapKey(e) {
    const k = e.key.toLowerCase();
    if (k === "arrowup") return "w";
    if (k === "arrowdown") return "s";
    if (k === "arrowleft") return "a";
    if (k === "arrowright") return "d";
    return k;
  }

  function onDown(e) {
    if (
      isTunnelBlockingInput() ||
      isControlsOverlayBlockingInput() ||
      isPauseOverlayBlockingInput() ||
      isLevelExitDestinationOverlayBlockingInput()
    )
      return;
    const k = mapKey(e);
    if (k === "w") state.w = true;
    if (k === "s") state.s = true;
    if (k === "a") state.a = true;
    if (k === "d") state.d = true;
    if (k === "e") state.e = true;
    if (e.code === "Space") {
      state.space = true;
      e.preventDefault();
    }
  }

  function onUp(e) {
    if (
      isTunnelBlockingInput() ||
      isControlsOverlayBlockingInput() ||
      isPauseOverlayBlockingInput() ||
      isLevelExitDestinationOverlayBlockingInput()
    )
      return;
    const k = mapKey(e);
    if (k === "w") state.w = false;
    if (k === "s") state.s = false;
    if (k === "a") state.a = false;
    if (k === "d") state.d = false;
    if (k === "e") state.e = false;
    if (e.code === "Space") state.space = false;
  }

  /** Drop held keys when a tunnel session starts or ends (swallowed keyups must not stick). */
  function clearHeldKeys() {
    state.w = false;
    state.a = false;
    state.s = false;
    state.d = false;
    state.space = false;
    state.e = false;
  }

  window.addEventListener("keydown", onDown, opts);
  window.addEventListener("keyup", onUp, opts);
  window.addEventListener(TUNNEL_SESSION_EVENT, clearHeldKeys, opts);
  window.addEventListener(
    CONTROLS_OVERLAY_SESSION_EVENT,
    (ev) => {
      if (/** @type {CustomEvent} */ (ev).detail?.active) clearHeldKeys();
    },
    opts,
  );
  window.addEventListener(
    PAUSE_OVERLAY_SESSION_EVENT,
    (ev) => {
      if (/** @type {CustomEvent} */ (ev).detail?.active) clearHeldKeys();
    },
    opts,
  );
  window.addEventListener(
    LEVEL_EXIT_DESTINATION_OVERLAY_SESSION_EVENT,
    (ev) => {
      if (/** @type {CustomEvent} */ (ev).detail?.active) clearHeldKeys();
    },
    opts,
  );

  return {
    state,
    dispose() {
      controller.abort();
    },
  };
}

/**
 * @param {(ev: KeyboardEvent) => void} onKeyDown
 */
export function attachKeyDown(onKeyDown) {
  window.addEventListener(
    "keydown",
    (ev) => {
      if (isTunnelBlockingInput()) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      onKeyDown(ev);
    },
    true,
  );
}
