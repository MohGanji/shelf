import { isTunnelBlockingInput } from './tunnel.js';

/**
 * Keyboard routing — tunnel must not buffer keys (spec: clean input on arrival).
 * @param {(ev: KeyboardEvent) => void} onKeyDown
 */
export function attachKeyDown(onKeyDown) {
  window.addEventListener(
    'keydown',
    (ev) => {
      if (isTunnelBlockingInput()) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      onKeyDown(ev);
    },
    true
  );
}
