# Tron: Light Cycles

Implementation tracks `plans/plan-2026-04-09-tron-light-cycles.md`.

## P1.3 — Light cycle model

- `js/game/cycle.js` — procedural low-poly mesh (~0.8×0.3×0.4), emissive neon materials, side wheels with glow, wheel spin from speed.
- `js/config.js` — cycle bounds, default player/enemy colors (`#00FFFF` / `#FF6600`), Dev HUD defaults for tilt / pitch-on-accel / lean-on-brake (all toggleable).
- `index.html` + `js/main.js` — local demo (cyan player + orange enemy instance). WASD drives the left cycle; **T / P / L** toggle animation features; **1 / 2** recolor the player cycle.

### Run (ES modules need HTTP)

```bash
cd vibe/tron && python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/) and click the canvas for keyboard focus.
