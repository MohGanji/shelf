/**
 * Developer HUD (`.` key) — live `devHud` sliders + toggles (plan P9.2).
 * Mutates the same `devHud` object as gameplay; calls `applyDevHud` + `persist` on change.
 */

import { DEFAULT_DEV_HUD, mergeDevHud } from "../config.js";

/**
 * @typedef {{
 *   devHud: import("../config.js").DEFAULT_DEV_HUD;
 *   applyDevHud: (patch: Partial<import("../config.js").DEFAULT_DEV_HUD>) => void;
 *   persist: () => void;
 *   syncHud?: () => void;
 *   isInputBlocked: () => boolean;
 * }} DevHudControllerOptions
 */

/**
 * @typedef {{ dispose(): void; getOpen: () => boolean }} DevHudController
 */

/** @param {string} k @returns {k is keyof typeof DEFAULT_DEV_HUD} */
function isDevKey(k) {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DEV_HUD, k);
}

/**
 * @param {DevHudControllerOptions} opts
 * @returns {DevHudController}
 */
export function createDevHudController(opts) {
  const { devHud, applyDevHud, persist, syncHud, isInputBlocked } = opts;

  const root = document.createElement("div");
  root.id = "dev-hud-panel";
  root.className = "dev-hud";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Advanced tuning");
  root.setAttribute("aria-hidden", "true");

  const header = document.createElement("div");
  header.className = "dev-hud__header";
  const headerTop = document.createElement("div");
  headerTop.className = "dev-hud__header-top";
  const title = document.createElement("div");
  title.className = "dev-hud__title";
  title.textContent = "Advanced tuning";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "dev-hud__reset";
  resetBtn.textContent = "Reset defaults";
  resetBtn.setAttribute("aria-label", "Reset all tuning values to built-in defaults");
  headerTop.appendChild(title);
  headerTop.appendChild(resetBtn);
  const hint = document.createElement("div");
  hint.className = "dev-hud__hint";
  hint.textContent = "Press . to hide · optional settings persist in your save";
  header.appendChild(headerTop);
  header.appendChild(hint);

  const scroll = document.createElement("div");
  scroll.className = "dev-hud__scroll";

  /** @type {Map<string, HTMLInputElement>} */
  const inputs = new Map();

  /**
   * @param {keyof typeof DEFAULT_DEV_HUD} key
   * @param {Partial<import("../config.js").DEFAULT_DEV_HUD>} patch
   */
  function applyAndPersist(patch) {
    Object.assign(devHud, patch);
    applyDevHud(patch);
    persist();
    if (typeof syncHud === "function") syncHud();
  }

  /**
   * @param {string} cat
   * @param {Array<{ key: keyof typeof DEFAULT_DEV_HUD; label: string; min?: number; max?: number; step?: number } | { key: keyof typeof DEFAULT_DEV_HUD; label: string; kind: 'bool' }>} fields
   */
  function section(cat, fields) {
    const det = document.createElement("details");
    det.className = "dev-hud__section";
    det.open = true;
    const sum = document.createElement("summary");
    sum.className = "dev-hud__summary";
    sum.textContent = cat;
    det.appendChild(sum);

    for (const f of fields) {
      const row = document.createElement("label");
      row.className = "dev-hud__row";

      const lab = document.createElement("span");
      lab.className = "dev-hud__label";
      lab.textContent = f.label;
      row.appendChild(lab);

      const key = f.key;
      if (!isDevKey(String(key))) continue;

      if ("kind" in f && f.kind === "bool") {
        const inp = document.createElement("input");
        inp.type = "checkbox";
        inp.className = "dev-hud__check";
        inp.checked = !!devHud[key];
        inp.addEventListener("change", () => {
          applyAndPersist(/** @type {any} */ ({ [key]: inp.checked }));
        });
        inputs.set(String(key), inp);
        row.appendChild(inp);
      } else if ("min" in f && typeof f.min === "number" && typeof f.max === "number") {
        const wrap = document.createElement("div");
        wrap.className = "dev-hud__slider-wrap";
        const inp = document.createElement("input");
        inp.type = "range";
        inp.className = "dev-hud__range";
        inp.min = String(f.min);
        inp.max = String(f.max);
        inp.step = f.step != null ? String(f.step) : "1";
        const cur = typeof devHud[key] === "number" ? devHud[key] : Number(DEFAULT_DEV_HUD[key]);
        inp.value = String(cur);
        const num = document.createElement("span");
        num.className = "dev-hud__val";
        const stepN = f.step != null ? f.step : 1;
        const fmt = (raw) => {
          const n = Number(raw);
          if (!Number.isFinite(n)) return "—";
          if (stepN < 0.1) return n.toFixed(3);
          if (stepN < 1) return n.toFixed(2);
          return String(Math.round(n));
        };
        num.textContent = fmt(inp.value);
        inp.addEventListener("input", () => {
          const v = parseFloat(inp.value);
          num.textContent = fmt(inp.value);
          if (Number.isFinite(v)) applyAndPersist(/** @type {any} */ ({ [key]: v }));
        });
        inputs.set(String(key), inp);
        wrap.appendChild(inp);
        wrap.appendChild(num);
        row.appendChild(wrap);
      }

      det.appendChild(row);
    }

    scroll.appendChild(det);
  }

  section("Post-processing", [
    { key: "bloomIntensity", label: "Bloom intensity", min: 0, max: 5, step: 0.05 },
    { key: "bloomThreshold", label: "Bloom threshold", min: 0, max: 1, step: 0.02 },
    { key: "chromaticAberration", label: "Chromatic aberration", min: 0, max: 0.02, step: 0.0005 },
    { key: "crtScanlines", label: "CRT scanlines", kind: "bool" },
    { key: "gridBrightness", label: "Grid brightness", min: 0, max: 1, step: 0.02 },
    { key: "neonIntensity", label: "Neon intensity", min: 0.5, max: 3, step: 0.05 },
    { key: "fogDensity", label: "Fog density", min: 0, max: 0.06, step: 0.001 },
  ]);

  section("Camera", [
    { key: "cameraDistance", label: "Distance", min: 2, max: 24, step: 0.25 },
    { key: "cameraHeight", label: "Height", min: 1, max: 16, step: 0.25 },
    { key: "cameraLookAhead", label: "Look-ahead", min: 0, max: 12, step: 0.25 },
    { key: "cameraDamping", label: "Damping", min: 0.02, max: 0.35, step: 0.005 },
    { key: "cameraTurnOffset", label: "Turn offset", min: 0, max: 6, step: 0.1 },
    { key: "cameraBaseFov", label: "Base FOV°", min: 40, max: 100, step: 1 },
    { key: "nitroFovAdd", label: "Nitro FOV add°", min: 0, max: 28, step: 0.5 },
    { key: "nitroPullBackAdd", label: "Nitro pull-back add", min: 0, max: 12, step: 0.25 },
  ]);

  section("Cycle feel", [
    { key: "cycleTiltMax", label: "Tilt max (rad)", min: 0, max: 0.8, step: 0.02 },
    { key: "cycleTiltOnSteer", label: "Tilt on steer", kind: "bool" },
    { key: "cyclePitchOnAccel", label: "Pitch on accel", kind: "bool" },
    { key: "cycleLeanOnBrake", label: "Lean on brake", kind: "bool" },
    { key: "cyclePitchAccelAngle", label: "Pitch accel angle", min: 0, max: 0.35, step: 0.01 },
    { key: "cycleLeanBrakeAngle", label: "Lean brake angle", min: 0, max: 0.35, step: 0.01 },
    { key: "cycleTiltSmoothing", label: "Tilt smoothing", min: 2, max: 28, step: 0.5 },
    { key: "cycleWheelSpinScale", label: "Wheel spin scale", min: 0.5, max: 8, step: 0.1 },
    { key: "cycleFriction", label: "Coast friction", min: 0.9, max: 1, step: 0.002 },
    { key: "brakeDeceleration", label: "Brake decel", min: 5, max: 120, step: 1 },
    { key: "steeringSpeedFalloff", label: "Steering speed falloff", min: 0, max: 0.1, step: 0.002 },
    { key: "enginePitch", label: "Engine pitch", min: 0.5, max: 2, step: 0.05 },
    { key: "gearShiftCount", label: "Gear shifts", min: 1, max: 10, step: 1 },
    { key: "wallHeight", label: "Arena wall height", min: 1, max: 8, step: 0.25 },
  ]);

  section("Nitro camera", [
    { key: "nitroFovWiden", label: "FOV widen", kind: "bool" },
    { key: "nitroCameraPullBack", label: "Camera pull-back", kind: "bool" },
    { key: "nitroSpeedLines", label: "Speed lines", kind: "bool" },
    { key: "nitroMotionBlur", label: "Motion blur", kind: "bool" },
  ]);

  section("Nitro / boost / shield", [
    { key: "nitroBurstDuration", label: "Burst duration (s)", min: 0.1, max: 2, step: 0.05 },
    { key: "nitroSpeedReturnTime", label: "Speed return (s)", min: 0.05, max: 2, step: 0.05 },
    { key: "nitroBarRechargeTime", label: "Bar recharge (s)", min: 0.5, max: 30, step: 0.5 },
    { key: "nitroMaxSpeedMultiplier", label: "Max speed ×", min: 1, max: 2, step: 0.02 },
    { key: "nitroHandlingMultiplier", label: "Handling × (burst)", min: 0.2, max: 1.2, step: 0.02 },
    { key: "boostPadStrength", label: "Boost pad strength", min: 0.3, max: 3, step: 0.05 },
    { key: "shieldDeployTime", label: "Shield deploy (s)", min: 0.02, max: 1, step: 0.01 },
    { key: "shieldDuration", label: "Shield duration (s)", min: 0.5, max: 30, step: 0.5 },
    { key: "shieldSlowdownPercent", label: "Shield hit slow %", min: 0, max: 1, step: 0.05 },
    { key: "coinOverlayDuration", label: "Coin overlay (s)", min: 0.5, max: 12, step: 0.5 },
  ]);

  section("Trail", [
    { key: "trailOpacity", label: "Opacity", min: 0.1, max: 1, step: 0.02 },
    { key: "trailFadeSpeed", label: "Fade speed", min: 0.1, max: 5, step: 0.05 },
    { key: "defaultTrailLength", label: "Default max segments", min: 8, max: 200, step: 1 },
    { key: "trailExtendAmount", label: "Trail extend pickup +", min: 1, max: 50, step: 1 },
    { key: "trailImmunitySegments", label: "Self-immunity segments", min: 0, max: 24, step: 1 },
    { key: "minimumArenaSize", label: "Min arena size (editor)", min: 40, max: 400, step: 4 },
  ]);

  section("Derez", [
    { key: "derezSlowMo", label: "Slow-mo", kind: "bool" },
    { key: "derezCameraOverhead", label: "Overhead cam", kind: "bool" },
    { key: "derezCameraShake", label: "Camera shake", kind: "bool" },
    { key: "derezGlitchFlash", label: "Glitch flash", kind: "bool" },
    { key: "derezSequenceSeconds", label: "Sequence length (s)", min: 0.4, max: 6, step: 0.1 },
    { key: "derezOverheadHeight", label: "Overhead height", min: 6, max: 60, step: 1 },
  ]);

  section("Portal", [
    { key: "portalWarpIntensity", label: "Warp intensity", min: 0, max: 1, step: 0.05 },
    { key: "portalExitImmunityDuration", label: "Exit immunity (s)", min: 0.02, max: 0.8, step: 0.01 },
  ]);

  section("Cooldowns / power-ups", [
    { key: "specialObjectCooldown", label: "Boost/portal cooldown (s)", min: 0.5, max: 30, step: 0.5 },
    { key: "powerupRespawnTime", label: "Power-up respawn (s)", min: 1, max: 90, step: 1 },
    { key: "nitroCapacityPlusAmount", label: "Nitro capacity+ bars", min: 1, max: 6, step: 1 },
  ]);

  section("Gameplay", [
    { key: "lowSpeedThreshold", label: "Low-speed threshold", min: 0, max: 40, step: 0.5 },
  ]);

  section("Audio", [
    { key: "musicCrossfadeDuration", label: "Music crossfade (s)", min: 0, max: 6, step: 0.1 },
    {
      key: "lobbyMusicVariant",
      label: "Lobby music (0=A · 1=B)",
      min: 0,
      max: 1,
      step: 1,
    },
    {
      key: "gameplayMusicVariant",
      label: "Gameplay music (0=A · 1=B)",
      min: 0,
      max: 1,
      step: 1,
    },
  ]);

  section("AI", [
    { key: "aiAggression", label: "Aggression", min: 0.2, max: 3, step: 0.05 },
    { key: "aiReactionTime", label: "Reaction time (s)", min: 0.04, max: 1.5, step: 0.02 },
    { key: "aiAvoidanceRange", label: "Avoidance range", min: 2, max: 22, step: 0.25 },
  ]);

  section("Near-miss", [
    { key: "nearMissDistance", label: "Near-miss distance", min: 0.2, max: 6, step: 0.05 },
  ]);

  root.appendChild(header);
  root.appendChild(scroll);

  const mount = document.getElementById("app-root") || document.body;
  mount.appendChild(root);

  let open = false;

  function setOpen(v) {
    open = v;
    root.hidden = !v;
    root.setAttribute("aria-hidden", v ? "false" : "true");
  }

  function toggle() {
    setOpen(!open);
  }

  /** Sync control values from `devHud` (e.g. after load). */
  function refreshControls() {
    for (const [keyStr, el] of inputs) {
      if (!isDevKey(keyStr)) continue;
      const key = /** @type {keyof typeof DEFAULT_DEV_HUD} */ (keyStr);
      const val = devHud[key];
      if (el.type === "checkbox") {
        el.checked = !!val;
      } else if (el.type === "range" && typeof val === "number") {
        el.value = String(val);
        const row = el.closest(".dev-hud__row");
        const num = row && row.querySelector(".dev-hud__val");
        if (num) {
          const st = parseFloat(el.step || "1");
          if (st < 0.1) num.textContent = val.toFixed(3);
          else if (st < 1) num.textContent = val.toFixed(2);
          else num.textContent = String(Math.round(val));
        }
      }
    }
  }

  function resetToDefaults() {
    const next = mergeDevHud({});
    for (const k of Object.keys(DEFAULT_DEV_HUD)) {
      const key = /** @type {keyof typeof DEFAULT_DEV_HUD} */ (k);
      devHud[key] = next[key];
    }
    applyDevHud(next);
    persist();
    refreshControls();
    if (typeof syncHud === "function") syncHud();
  }

  resetBtn.addEventListener("click", () => resetToDefaults());

  /** @param {KeyboardEvent} e */
  function onGlobalKeydown(e) {
    if (e.key !== "." && e.code !== "Period") return;
    if (isInputBlocked()) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
      if (t !== document.body && !root.contains(t)) return;
    }
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }

  window.addEventListener("keydown", onGlobalKeydown, true);

  refreshControls();

  return {
    getOpen: () => open,
    refresh: refreshControls,
    dispose() {
      window.removeEventListener("keydown", onGlobalKeydown, true);
      root.remove();
    },
  };
}
