/**
 * Brief toast beside the HUD equip slot when the player collects a power-up.
 */

const DEFAULT_MS = 2400;
const HIDE_CLASS = "pickup-feedback--visible";

/**
 * @param {HTMLElement | null} root
 */
export function createPickupFeedback(root) {
  if (!root) {
    return { show: () => {} };
  }
  const titleEl = root.querySelector(".pickup-feedback__title");
  const subEl = root.querySelector(".pickup-feedback__sub");
  if (subEl instanceof HTMLElement) subEl.hidden = true;
  let hideT = 0;
  return {
    /**
     * @param {object} p
     * @param {string} p.title
     * @param {number} [p.durationMs]
     */
    show(p) {
      if (!(titleEl instanceof HTMLElement)) return;
      clearTimeout(hideT);
      titleEl.textContent = p.title;
      root.hidden = false;
      root.classList.remove(HIDE_CLASS);
      void root.offsetWidth;
      root.classList.add(HIDE_CLASS);
      const ms = typeof p.durationMs === "number" && p.durationMs > 0 ? p.durationMs : DEFAULT_MS;
      hideT = window.setTimeout(() => {
        root.classList.remove(HIDE_CLASS);
        window.setTimeout(() => {
          root.hidden = true;
        }, 420);
      }, ms);
    },
  };
}
