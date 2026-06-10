# Tron: Cyber Cycles — performance benchmark

Deterministic, reproducible performance measurement for the game. Run it before and
after a change; compare the printed medians (also written to `results-<label>.json`).

```sh
cd vibe/tron
npm install --prefix bench          # once (playwright + chromium)
node bench/run.mjs --runs 3 --label mychange [--scenario lobby|combat|all]
```

## How determinism is achieved

- Fixed 1280×720 viewport, device pixel ratio 1, `?perf=medium` (graphics tier pinned —
  no host-hardware heuristics).
- `Math.random` replaced with a seeded PRNG (mulberry32) before any game code runs —
  enemy AI, particles and ambience make the same decisions every run.
- Seeded save file (all levels unlocked, overlays dismissed) + seeded session boot
  target, so each run boots straight into the same arena.
- Scripted keyboard input on a fixed wall-clock schedule.
- Medians across `--runs` independent browser contexts absorb the remaining
  scheduling noise. If the player dies mid-window (AI trajectories shift whenever
  code changes), the combat scenario retries with a phase-shifted steering schedule;
  each attempt is itself deterministic.

## Scenarios

| Scenario | What it measures |
|---|---|
| `lobby`  | Idle hub: ambience, banners, no trails. 12 s window. |
| `combat` | `level-20` (4 AI cycles, 500×500 arena): player drives laps for 31 s while all five trails grow to cap; 25 s measured window. This is the worst-case gameplay load. |

## Metrics (and why they map to gameplay experience)

**Smoothness** — what stutter feels like:
- `fps avg` — frames rendered / wall-clock duration.
- `frame ms median / p95 / p99` — rAF-to-rAF deltas. p95/p99 are the hitches you feel.
- `jank %` — share of frames slower than 1.5× the median (relative stutter).
- `>16.9ms %` — share of frames missing the 60 Hz budget.
- `degradation ms` — median frame time of the last 5 s minus the first 5 s of the
  window: "does it get worse as trails/UI accumulate".

**Speed** — how much work a frame costs:
- `cpu ms/frame median / p95` — main-thread time inside the frame callback
  (game update + physics + render submission), measured by wrapping rAF.
- `draw calls / triangles (end)` — `renderer.info` across **all** post passes
  (info.autoReset disabled, reset per frame), sampled over the last 60 frames.
  Deterministic for a given scene state.

**Resources** — memory pressure and heat proxy:
- `js heap end MB` — `performance.memory.usedJSHeapSize` at window end
  (`--enable-precise-memory-info`).
- `alloc churn MB/s` — sum of positive heap deltas / duration: the allocation rate
  the GC must keep collecting. High churn = constant CPU background work = heat.
- `geom/tex/programs` — live GPU objects (`renderer.info.memory` + program count).
  Growth here = GPU memory pressure / leaks.

## Notes

- The game exposes `window.__tronGame` (renderer/scene/camera) only when `?bench=1`.
- Headless Chromium uses the real GPU via ANGLE Metal on macOS (`--use-angle=metal`).
- `debug`/screenshot helpers in this directory are throwaway; `run.mjs` is the tool.
