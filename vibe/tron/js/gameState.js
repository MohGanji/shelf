/**
 * Explicit game modes for `main.js` (plan X1 — state machine).
 *
 * Transitions are driven in `main.js`: BOOT ends after boot tunnel; LOBBY / LEVEL run the arena loop;
 * GARAGE / EDITOR are destination screens; PAUSE overlays arena play; PLAYER_DEREZ covers death sequence;
 * LEVEL_COMPLETE is active while the combat victory coin overlay is visible (gameplay continues).
 */

/** @typedef {(typeof GameMode)[keyof typeof GameMode]} GameModeValue */

export const GameMode = Object.freeze({
  BOOT: "BOOT",
  LOBBY: "LOBBY",
  LEVEL: "LEVEL",
  GARAGE: "GARAGE",
  EDITOR: "EDITOR",
  PAUSE: "PAUSE",
  PLAYER_DEREZ: "PLAYER_DEREZ",
  /** Exit unlocked + at least one enemy was present — overlay shown until timeout or level exit */
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
});

/**
 * @param {GameModeValue} mode
 * @returns {boolean}
 */
export function isArenaRideableMode(mode) {
  return mode === GameMode.LOBBY || mode === GameMode.LEVEL || mode === GameMode.LEVEL_COMPLETE;
}
