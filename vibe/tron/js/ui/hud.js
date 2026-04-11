/**
 * In-game HUD (plan `ui/hud.js`) — speed, nitro, trail, timer, equip, minimap. Wired in H1.
 */

/**
 * @typedef {{ dispose(): void }} HudController
 */

/**
 * Placeholder mount for the HTML HUD layer; real implementation attaches to `#cycle-hud` etc.
 * @returns {HudController}
 */
export function createHudController() {
  return {
    dispose() {},
  };
}
