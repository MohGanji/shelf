# Tron: Light Cycles

Implementation tracks `plans/plan-2026-04-09-tron-light-cycles.md`.

**BOOT tunnel (P9.5):** `js/engine/tunnel.js` — `playTunnel(renderer, onComplete?, { durationSeconds })` runs the full-screen grid tunnel while the HTML BOOT overlay shows progress (`CONFIG.tunnelBootSeconds`). `isTunnelBlockingInput()` is true for the tunnel duration so gameplay keys are not buffered.

## P1.3 — Light cycle model

- `js/game/cycle.js` — procedural low-poly mesh (~0.8×0.3×0.4), emissive neon materials, side wheels with glow, wheel spin from speed, steer tilt and accel/brake pitch (Dev HUD toggles).
- `js/config.js` — shared `WORLD` / `DEFAULT_DEV_HUD` plus `CYCLE_BOUNDS`, `TRON_COLORS`, and cycle animation keys (`cycleTiltOnSteer`, `cyclePitchAccelAngle`, `cycleWheelSpinScale`, etc.).
- `index.html` + `js/main.js` — after the BOOT tunnel, two sample cycles (player cyan + enemy orange) sit on a grid; **WASD** drives the player cycle, **mouse orbits** the camera, **T / P / L** toggles animation features, **1 / 2** recolors the player cycle.

### Run (ES modules need HTTP)

```bash
cd vibe/tron && python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/), wait for BOOT to finish, then click the canvas for keyboard focus.
