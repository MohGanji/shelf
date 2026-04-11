# Tron: Light Cycles

Implementation tracks `plans/plan-2026-04-09-tron-light-cycles.md`.

## Audio (P8.1)

`js/engine/audio.js` — `createAudioEngine({ masterVolume, musicVolume, sfxVolume, ambientVolume, musicCrossfadeSec, autoplay })` with unlock on first user gesture. `AUDIO_AUTOPLAY` and volumes come from `js/config.js` + save `settings`.

## BOOT tunnel (P9.5)

`js/engine/tunnel.js` — `playTunnel(renderer, onComplete?, { durationSeconds })` runs the full-screen grid tunnel while the HTML BOOT overlay shows progress (`CONFIG.tunnelBootSeconds`). `isTunnelBlockingInput()` is true for the tunnel duration so gameplay keys are not buffered.

## P1.2 — Arena foundation

After BOOT, `js/main.js` tears down the **Nux** showcase (grid + `createLightCycle` meshes + `OrbitControls`) and builds the **400×400** arena from `getArenaPlaytestConfig()` (`WORLD` + `wallHeight` in `js/config.js`): unit grid, emissive perimeter walls, cannon-es floor + walls, and **angle-based wall slide** (`js/engine/physics.js`). **WASD** drives a cyan **proxy sphere** for physics smoke tests.

## P1.4 — Third-person chase camera

- `js/engine/camera.js` — `createChaseCamera` keeps the view **behind** the player’s heading (velocity when moving, else WASD intent so it still orbits when nearly stationary). Uses `cameraDistance`, `cameraHeight`, `cameraLookAhead`, `cameraDamping`, `cameraTurnOffset`, `cameraBaseFov` from `DEFAULT_DEV_HUD`.
- **Nitro (demo)**: **Space** triggers a short burst (`nitroBurstDuration`). When active: optional **FOV widen** and **pull-back** (`nitroFovAdd`, `nitroPullBackAdd`), **speed lines** (`#nitro-speed-lines` overlay), and **radial motion blur** (extra `ShaderPass` in `js/engine/post.js`). Toggles **5 / 6 / 7 / 8** match the plan’s `nitroFovWiden`, `nitroCameraPullBack`, `nitroSpeedLines`, `nitroMotionBlur`.

## P1.3 — Light cycle model

- `js/game/cycle.js` — procedural low-poly mesh (~0.8×0.3×0.4), emissive neon materials, side wheels with glow, wheel spin from speed, steer tilt and accel/brake pitch (Dev HUD toggles). Still constructed during bootstrapping so imports stay live; the scene swaps to the arena after the tunnel.
- `js/config.js` — shared `WORLD` / `DEFAULT_DEV_HUD` plus `CYCLE_BOUNDS`, `TRON_COLORS`, and cycle animation keys (`cycleTiltOnSteer`, `cyclePitchAccelAngle`, `cycleWheelSpinScale`, etc.).

### Run (ES modules need HTTP)

```bash
cd vibe/tron && python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/), wait for BOOT to finish, then click the canvas for keyboard focus.
