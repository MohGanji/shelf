/**
 * Deterministic performance benchmark for Tron: Cyber Cycles.
 *
 * Usage:  node bench/run.mjs [--runs 3] [--label baseline] [--scenario combat|lobby|all]
 *
 * What it does, per scenario:
 *   1. Serves the repo over a local static server (no caching surprises).
 *   2. Launches Chromium at a fixed 1280x720 / DPR 1 / ?perf=medium so the
 *      graphics tier never depends on host hardware heuristics.
 *   3. Seeds Math.random with a fixed PRNG, seeds the save file (all levels
 *      unlocked, overlays dismissed) and the session boot target, so every run
 *      boots the exact same arena with the same AI decisions.
 *   4. Scripted keyboard input (fixed schedule) drives the player for the
 *      measurement window while 5 AI cycles ride and trails grow.
 *   5. An injected rAF wrapper measures, for every frame: wall-clock frame
 *      delta, main-thread CPU time inside the frame callback, and (via
 *      renderer.info with autoReset off) draw calls + triangles across ALL
 *      post passes. Heap is sampled at 4 Hz.
 *
 * Metrics reported (medians across --runs):
 *   Smoothness: avg fps, median/p95/p99 frame ms, jank% (frames > 1.5x median
 *               display interval), degradation (median frame ms last 5s minus
 *               first 5s — "gets worse as trails/UI grow").
 *   Speed:      CPU ms/frame median + p95, draw calls and triangles at end of
 *               window (deterministic), shader program count.
 *   Resources:  JS heap at end, allocation churn MB/s (sum of positive heap
 *               deltas / duration — GC pressure proxy for heat), GPU
 *               geometries/textures alive.
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const PORT = 4173;

const args = process.argv.slice(2);
function argVal(name, dflt) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt;
}
const RUNS = Number.parseInt(argVal("runs", "3"), 10);
const LABEL = argVal("label", "run");
const SCENARIO = argVal("scenario", "all");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".glb": "model/gltf-binary",
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      let p = decodeURIComponent(url.pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = normalize(join(ROOT, p));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/** Injected before any page script: seeded RNG + frame instrumentation. */
const INIT_SCRIPT = `
(() => {
  if (new URLSearchParams(location.search).get("bench") !== "1") return;
  // mulberry32 — deterministic Math.random for AI / particles / ambience.
  let seed = 0xC0FFEE;
  Math.random = function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const data = {
    recording: false,
    frameTs: [],   // rAF timestamps (one per frame; deduped)
    cpuMs: [],     // summed callback CPU per frame
    draws: [],     // renderer.info draw calls per frame (all passes)
    tris: [],
    heap: [],      // [tMs, usedJSHeapSize]
  };
  window.__bench = data;

  let lastTs = -1;
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    origRaf((ts) => {
      const game = window.__tronGame;
      const isNewFrame = ts !== lastTs;
      if (data.recording && game && isNewFrame) {
        game.renderer.info.autoReset = false;
        game.renderer.info.reset();
      }
      const c0 = performance.now();
      cb(ts);
      const c1 = performance.now();
      if (data.recording) {
        if (isNewFrame) {
          data.frameTs.push(ts);
          data.cpuMs.push(c1 - c0);
          if (game) {
            data.draws.push(game.renderer.info.render.calls);
            data.tris.push(game.renderer.info.render.triangles);
          }
        } else {
          data.cpuMs[data.cpuMs.length - 1] += c1 - c0;
          if (game) {
            data.draws[data.draws.length - 1] = game.renderer.info.render.calls;
            data.tris[data.tris.length - 1] = game.renderer.info.render.triangles;
          }
        }
      }
      lastTs = ts;
    });

  setInterval(() => {
    if (data.recording && performance.memory) {
      data.heap.push([performance.now(), performance.memory.usedJSHeapSize]);
    }
  }, 250);
})();
`;

/** Save with everything unlocked + overlays pre-dismissed (stable boot). */
const SEED_SAVE = {
  schemaVersion: 1,
  progress: {
    currentLevel: 20,
    completedLevels: Array.from({ length: 21 }, (_, i) => i),
  },
  tutorialCleared: true,
  controlsShown: true,
  flags: { seenGarage: true },
  // NOTE: exactly 0 volume crashes the boot tunnel (exponentialRampToValueAtTime(0)) — keep defaults.
  settings: { masterVolume: 0.5, musicVolume: 0.5, sfxVolume: 0.5, ambientVolume: 0.5 },
};

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarize(raw) {
  const deltas = [];
  for (let i = 1; i < raw.frameTs.length; i++) deltas.push(raw.frameTs[i] - raw.frameTs[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const med = percentile(sorted, 50);
  const durSec = (raw.frameTs.at(-1) - raw.frameTs[0]) / 1000;
  const jankThresh = med * 1.5;
  const jank = deltas.filter((d) => d > jankThresh).length / Math.max(1, deltas.length);
  const over60 = deltas.filter((d) => d > 16.9).length / Math.max(1, deltas.length);

  // degradation: median frame delta of last 5s vs first 5s of the window
  const t0 = raw.frameTs[0];
  const tEnd = raw.frameTs.at(-1);
  const head = [];
  const tail = [];
  for (let i = 1; i < raw.frameTs.length; i++) {
    const d = raw.frameTs[i] - raw.frameTs[i - 1];
    if (raw.frameTs[i] - t0 <= 5000) head.push(d);
    if (tEnd - raw.frameTs[i] <= 5000) tail.push(d);
  }
  const medOf = (arr) => percentile([...arr].sort((a, b) => a - b), 50);

  const cpuSorted = [...raw.cpuMs].sort((a, b) => a - b);

  // allocation churn: sum of positive heap deltas / duration
  let churn = 0;
  for (let i = 1; i < raw.heap.length; i++) {
    const d = raw.heap[i][1] - raw.heap[i - 1][1];
    if (d > 0) churn += d;
  }
  const heapDurSec = raw.heap.length > 1 ? (raw.heap.at(-1)[0] - raw.heap[0][0]) / 1000 : 1;

  const lastN = (arr, n) => arr.slice(-n);
  const medLast = (arr) => medOf(lastN(arr, 60));

  return {
    frames: deltas.length,
    fps: deltas.length / durSec,
    frameMsMedian: med,
    frameMsP95: percentile(sorted, 95),
    frameMsP99: percentile(sorted, 99),
    jankPct: jank * 100,
    over60BudgetPct: over60 * 100,
    degradationMs: medOf(tail) - medOf(head),
    cpuMsMedian: percentile(cpuSorted, 50),
    cpuMsP95: percentile(cpuSorted, 95),
    drawCallsEnd: medLast(raw.draws),
    trianglesEnd: medLast(raw.tris),
    heapEndMB: raw.heap.length ? raw.heap.at(-1)[1] / 1048576 : NaN,
    allocMBperSec: churn / 1048576 / Math.max(0.5, heapDurSec),
    info: raw.info,
  };
}

async function bootPage(browser, bootTarget) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(INIT_SCRIPT);
  await context.addInitScript(
    ({ save, boot }) => {
      localStorage.setItem("tron-light-cycles-save-v1", JSON.stringify(save));
      if (boot) sessionStorage.setItem("tron-session-boot-v1", JSON.stringify(boot));
      else sessionStorage.removeItem("tron-session-boot-v1");
    },
    { save: SEED_SAVE, boot: bootTarget },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("  [pageerror]", e.message));
  await page.goto(`http://localhost:${PORT}/index.html?bench=1&perf=medium`, {
    waitUntil: "domcontentloaded",
  });
  // game loop is live once the bench probe exists and frames advance
  await page.waitForFunction(() => window.__tronGame && window.__bench, null, {
    timeout: 120000,
  });
  // wait for boot overlay dismissal (gameplay rendering)
  await page.waitForFunction(
    () => document.getElementById("boot-overlay")?.classList.contains("boot-overlay--hidden"),
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1500); // settle: shaders compiled, music path resolved
  return { context, page };
}

async function record(page, ms) {
  await page.evaluate(() => {
    const b = window.__bench;
    b.frameTs.length = 0;
    b.cpuMs.length = 0;
    b.draws.length = 0;
    b.tris.length = 0;
    b.heap.length = 0;
    b.recording = true;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const b = window.__bench;
    b.recording = false;
    const r = window.__tronGame.renderer;
    return {
      frameTs: b.frameTs,
      cpuMs: b.cpuMs,
      draws: b.draws,
      tris: b.tris,
      heap: b.heap,
      info: {
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures,
        programs: r.info.programs.length,
      },
    };
  });
}

/**
 * Deterministic steering schedule: big rectangular laps. `phaseMs` shifts the first turn so a
 * retry (after an AI trajectory kills the player) takes a different but equivalent path.
 */
function combatInputs(phaseMs = 0) {
  return [
    { at: 0, type: "down", key: "w" },
    // four left turns per lap, ~5.2s straights — stays inside a 460x460 arena
    ...Array.from({ length: 5 }, (_, lap) =>
      [0, 1, 2, 3].map((leg) => ({
        at: 2600 + phaseMs + lap * 20800 + leg * 5200,
        type: "tap",
        key: "a",
        holdMs: 430,
      })),
    ).flat(),
  ];
}

async function driveCombat(page, totalMs, phaseMs = 0) {
  const canvas = page.locator("#game-canvas");
  await canvas.click();
  const t0 = Date.now();
  const pending = combatInputs(phaseMs).sort((a, b) => a.at - b.at);
  while (Date.now() - t0 < totalMs) {
    const now = Date.now() - t0;
    while (pending.length && pending[0].at <= now) {
      const ev = pending.shift();
      if (ev.type === "down") {
        await page.keyboard.down(ev.key === "w" ? "w" : ev.key);
      } else if (ev.type === "tap") {
        await page.keyboard.down(ev.key);
        await page.waitForTimeout(ev.holdMs);
        await page.keyboard.up(ev.key);
      }
    }
    await page.waitForTimeout(25);
  }
  await page.keyboard.up("w").catch(() => {});
}

async function runScenario(browser, name) {
  if (name === "lobby") {
    const { context, page } = await bootPage(browser, null);
    const raw = await record(page, 12000);
    await context.close();
    return summarize(raw);
  }
  if (name === "combat") {
    // Player death (enemy AI trajectory) reloads the page and voids the window — retry with a
    // phase-shifted steering schedule. Each attempt is itself deterministic.
    for (let attempt = 0; attempt < 6; attempt++) {
      const phaseMs = attempt * 900;
      const { context, page } = await bootPage(browser, {
        mode: "campaign",
        levelId: "level-20",
      });
      // start driving, give 4s for speed buildup + enemies to commit, then record 25s mid-flight
      const drive = driveCombat(page, 31000, phaseMs);
      await page.waitForTimeout(4000);
      const raw = await record(page, 25000);
      await drive;
      await context.close();
      // a full window is ~25s of frames; death+reload truncates it
      const recordedMs =
        raw.frameTs.length > 1 ? raw.frameTs.at(-1) - raw.frameTs[0] : 0;
      if (recordedMs >= 22000) return summarize(raw);
      process.stdout.write(
        `  attempt ${attempt + 1} died early (recorded ${(recordedMs / 1000).toFixed(1)}s) — retrying with phase +${(attempt + 1) * 0.9}s\n`,
      );
    }
    throw new Error("combat scenario: no surviving 25s window in 6 attempts");
  }
  throw new Error(`unknown scenario ${name}`);
}

function fmt(n, d = 1) {
  return Number.isFinite(n) ? n.toFixed(d) : "n/a";
}

const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--enable-precise-memory-info",
    "--use-angle=metal",
    "--enable-gpu",
    "--disable-renderer-backgrounding",
  ],
});

const scenarios = SCENARIO === "all" ? ["lobby", "combat"] : [SCENARIO];
const out = {};
for (const sc of scenarios) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`[${LABEL}] scenario=${sc} run ${i + 1}/${RUNS}...\n`);
    try {
      runs.push(await runScenario(browser, sc));
    } catch (e) {
      console.error(`  run failed: ${e.message}`);
    }
  }
  if (runs.length === 0) continue;
  const med = {};
  for (const k of Object.keys(runs[0])) {
    if (k === "info") continue;
    const vals = runs.map((r) => r[k]).sort((a, b) => a - b);
    med[k] = vals[Math.floor(vals.length / 2)];
  }
  med.info = runs[runs.length - 1].info;
  out[sc] = { median: med, runs };

  console.log(`\n=== ${sc} (median of ${runs.length} runs) ===`);
  console.log(`  fps avg            : ${fmt(med.fps)}`);
  console.log(`  frame ms med/p95/p99: ${fmt(med.frameMsMedian, 2)} / ${fmt(med.frameMsP95, 2)} / ${fmt(med.frameMsP99, 2)}`);
  console.log(`  jank % (>1.5x med) : ${fmt(med.jankPct, 2)}`);
  console.log(`  >16.9ms frames %   : ${fmt(med.over60BudgetPct, 2)}`);
  console.log(`  degradation ms     : ${fmt(med.degradationMs, 2)} (last5s - first5s median frame ms)`);
  console.log(`  cpu ms/frame med/p95: ${fmt(med.cpuMsMedian, 2)} / ${fmt(med.cpuMsP95, 2)}`);
  console.log(`  draw calls (end)   : ${fmt(med.drawCallsEnd, 0)}`);
  console.log(`  triangles (end)    : ${fmt(med.trianglesEnd, 0)}`);
  console.log(`  js heap end MB     : ${fmt(med.heapEndMB, 1)}`);
  console.log(`  alloc churn MB/s   : ${fmt(med.allocMBperSec, 2)}`);
  console.log(`  geom/tex/programs  : ${med.info.geometries}/${med.info.textures}/${med.info.programs}`);
}

const { writeFile } = await import("node:fs/promises");
const outPath = join(ROOT, "bench", `results-${LABEL}.json`);
await writeFile(outPath, JSON.stringify(out, null, 2));
console.log(`\nwrote ${outPath}`);

await browser.close();
server.close();
process.exit(0);
