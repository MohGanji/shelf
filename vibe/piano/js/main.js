import { SONGS, songDurationSec, scheduleSong } from "./songs.js";
import { CODE_TO_MIDI } from "./keyboard.js";
import { ensureAudio, noteOn, noteOff, playNote, allNotesOff } from "./audio.js";
import { Visualizer } from "./visualizer.js";
import { judgeTiming, gradePerformance, WINDOWS } from "./grading.js";

const $ = (sel) => document.querySelector(sel);

const menuEl = $("#menu");
const stageEl = $("#stage");
const overlayEl = $("#overlay");
const hudTitle = $("#hud-title");
const hudMode = $("#hud-mode");
const hudStats = $("#hud-stats");
const progressFill = $("#progress-fill");

const viz = new Visualizer($("#viz"));

const game = {
  song: null,
  mode: null, // 'play' | 'practice'
  speed: 1,
  phase: "menu", // menu | ready | running | done
  showLabels: true,
  schedule: [],
  perf: [],
  duration: 0,
  t0: 0,
  time: -99,
  playCursor: 0,
  missCursor: 0,
  pressed: new Set(),
  lit: new Set(),
  floaters: [],
  openHolds: new Map(), // midi -> { perfNote, pressTime }
  wrongPresses: 0,
  streak: 0,
  sumPoints: 0,
  judged: 0,
  raf: 0,
};

const JUDGE_STYLE = {
  perfect: { text: "perfect", color: "#7df0ff" },
  good: { text: "good", color: "#8aff9e" },
  ok: { text: "ok", color: "#ffd479" },
  miss: { text: "miss", color: "#ff7a7a" },
};

// ------------------------------------------------------------------ menu --

function fmtDur(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildMenu() {
  const groups = { easy: [], medium: [], hard: [] };
  for (const s of SONGS) groups[s.difficulty].push(s);

  menuEl.innerHTML = `
    <p class="intro">
      A Synthesia-style piano that lives on your laptop keyboard.
      Home row <span class="kbd">A</span>–<span class="kbd">'</span> plays the white keys,
      the row above (<span class="kbd">W</span> <span class="kbd">E</span> <span class="kbd">T</span>
      <span class="kbd">Y</span> <span class="kbd">U</span> <span class="kbd">O</span>
      <span class="kbd">P</span>) plays the black keys.
      <b>Play</b> a song to hear and watch it; <b>Practice</b> it to play the falling
      notes yourself and get graded with tips.
    </p>`;

  for (const [diff, songs] of Object.entries(groups)) {
    const sec = document.createElement("div");
    sec.className = "diff-group";
    sec.innerHTML = `<h2 class="diff-title ${diff}">${diff}</h2>`;
    for (const song of songs) {
      const row = document.createElement("div");
      row.className = "song-row";
      row.innerHTML = `
        <div class="song-meta">
          <div class="song-title">${song.title}</div>
          <div class="song-sub">${song.composer} · ${song.origin} · ${fmtDur(songDurationSec(song))}</div>
        </div>
        <div class="song-actions">
          <button class="btn play-btn">▶ play</button>
          <button class="btn practice-btn">practice</button>
        </div>`;
      row.querySelector(".play-btn").addEventListener("click", () => openStage(song, "play"));
      row.querySelector(".practice-btn").addEventListener("click", () => openStage(song, "practice"));
      sec.appendChild(row);
    }
    menuEl.appendChild(sec);
  }
}

// ----------------------------------------------------------------- stage --

function openStage(song, mode) {
  ensureAudio(); // user gesture: unlock audio now
  game.song = song;
  game.mode = mode;
  game.phase = "ready";
  menuEl.hidden = true;
  stageEl.hidden = false;
  hudTitle.textContent = song.title;
  hudMode.textContent = mode;
  hudMode.className = `mode-badge ${mode}`;
  hudStats.textContent = "";
  progressFill.style.width = "0%";
  viz.resize();
  showReadyOverlay();
  drawIdleFrame();
}

function showReadyOverlay() {
  const practice = game.mode === "practice";
  overlayEl.classList.remove("bare");
  overlayEl.hidden = false;
  overlayEl.innerHTML = `
    <div class="panel">
      <div class="panel-title">${game.song.title}</div>
      <div class="panel-sub">${game.song.composer} · <span class="diff-chip ${game.song.difficulty}">${game.song.difficulty}</span></div>
      ${practice
        ? `<p class="panel-hint">Hit each key as its bar reaches the line, and hold it for the bar's length.</p>`
        : `<p class="panel-hint">Sit back — the song plays itself. Feel free to jam along.</p>`}
      <div class="speed-row">
        <span>speed</span>
        ${[0.5, 0.75, 1].map((s) =>
          `<button class="pill speed-pill ${s === game.speed ? "active" : ""}" data-speed="${s}">${s}x</button>`).join("")}
      </div>
      <label class="label-toggle"><input type="checkbox" id="labels-cb" ${game.showLabels ? "checked" : ""}> show key letters on notes</label>
      <button class="btn big" id="start-btn">start</button>
      <div class="panel-foot">esc to quit · keys A S D F G H J K L ; ' + W E T Y U O P</div>
    </div>`;
  overlayEl.querySelectorAll(".speed-pill").forEach((b) =>
    b.addEventListener("click", () => {
      game.speed = parseFloat(b.dataset.speed);
      overlayEl.querySelectorAll(".speed-pill").forEach((x) => x.classList.toggle("active", x === b));
    }));
  $("#labels-cb").addEventListener("change", (e) => { game.showLabels = e.target.checked; });
  $("#start-btn").addEventListener("click", startRun);
}

function startRun() {
  const sched = scheduleSong(game.song, game.speed);
  game.schedule = sched;
  game.perf = sched.map((n, i) => ({
    m: n.m, start: n.start, dur: n.dur,
    gap: i > 0 ? n.start - sched[i - 1].start : 99,
    hit: false, err: 0, judgement: null, holdRatio: 0,
  }));
  game.noteState = new Map();
  game.duration = sched.length ? sched[sched.length - 1].start + sched[sched.length - 1].dur : 0;
  game.playCursor = 0;
  game.missCursor = 0;
  game.floaters = [];
  game.openHolds = new Map();
  game.wrongPresses = 0;
  game.streak = 0;
  game.sumPoints = 0;
  game.judged = 0;
  // countdown with notes frozen partway down the screen, then they fall;
  // the first note lands freezeAt seconds after the countdown ends
  const COUNTDOWN = 2.1; // 3 steps of 0.7s
  game.countdownSteps = 0.7;
  game.freezeAt = viz.lookahead * 0.65;
  game.t0 = performance.now() / 1000 + COUNTDOWN + game.freezeAt;
  game.phase = "running";
  overlayEl.hidden = false;
  overlayEl.classList.add("bare");
  overlayEl.innerHTML = `<div class="countdown" id="countdown">3</div>`;
  cancelAnimationFrame(game.raf);
  loop();
}

function loop() {
  game.raf = requestAnimationFrame(loop);
  game.time = performance.now() / 1000 - game.t0;
  let t = game.time;

  if (t < -game.freezeAt) {
    // countdown: hold the notes still at their starting positions
    const cd = $("#countdown");
    if (cd) cd.textContent = Math.ceil((-t - game.freezeAt) / game.countdownSteps);
    t = -game.freezeAt;
  } else if (!overlayEl.hidden && game.phase === "running") {
    overlayEl.hidden = true;
    overlayEl.classList.remove("bare");
  }

  if (game.phase === "running") {
    if (game.mode === "play") tickPlay(t);
    else tickPractice(t);
    progressFill.style.width = `${Math.min(100, Math.max(0, (t / game.duration) * 100)).toFixed(2)}%`;
    if (t > game.duration + 1.2) finishRun();
  }

  game.lit.clear();
  for (let i = game.playCursor - 1; i >= 0; i--) {
    const n = game.schedule[i];
    if (game.mode === "play" && t >= n.start && t <= n.start + n.dur) game.lit.add(n.m);
    if (n.start + n.dur < t - 4) break;
  }

  viz.draw({
    time: t,
    notes: game.schedule,
    noteState: game.noteState,
    pressed: game.pressed,
    lit: game.lit,
    floaters: game.floaters,
    showLabels: game.showLabels,
  });
}

function tickPlay(t) {
  while (game.playCursor < game.schedule.length && game.schedule[game.playCursor].start <= t) {
    const n = game.schedule[game.playCursor++];
    playNote(n.m, n.dur, 0.9);
  }
}

function tickPractice(t) {
  // advance playCursor just for the lit-key window bookkeeping
  while (game.playCursor < game.schedule.length && game.schedule[game.playCursor].start <= t) game.playCursor++;
  // sweep notes whose hit window has fully passed
  while (game.missCursor < game.schedule.length) {
    const n = game.schedule[game.missCursor];
    if (t < n.start + WINDOWS.ok) break;
    const p = game.perf[n.id];
    if (!p.hit && !game.noteState.has(n.id)) {
      game.noteState.set(n.id, { status: "miss" });
      game.streak = 0;
      game.judged++;
      addFloater(n.m, "miss");
      updateHud();
    }
    game.missCursor++;
  }
}

function addFloater(midi, judgement) {
  const r = viz.keyRects.get(midi);
  if (!r) return;
  const style = JUDGE_STYLE[judgement];
  game.floaters.push({ at: game.time, x: r.x + r.w / 2, text: style.text, color: style.color });
  if (game.floaters.length > 40) game.floaters.splice(0, 10);
}

function updateHud() {
  if (game.mode !== "practice") return;
  const pct = game.judged > 0 ? Math.round(game.sumPoints / game.judged) : 100;
  hudStats.textContent = `streak ${game.streak} · ${pct}%`;
}

// ----------------------------------------------------------------- input --

function pressKey(midi) {
  if (game.pressed.has(midi)) return;
  game.pressed.add(midi);
  noteOn(midi, 0.9);

  if (game.phase !== "running" || game.mode !== "practice" || game.time < -WINDOWS.ok) return;
  const t = game.time;

  let best = null, bestErr = Infinity;
  for (const n of game.schedule) {
    if (n.m !== midi) continue;
    if (n.start - t > WINDOWS.ok + 0.01) break;
    const p = game.perf[n.id];
    if (p.hit || game.noteState.has(n.id)) continue;
    const err = t - n.start;
    if (Math.abs(err) <= WINDOWS.ok && Math.abs(err) < Math.abs(bestErr)) {
      best = n; bestErr = err;
    }
  }

  if (best) {
    const p = game.perf[best.id];
    p.hit = true;
    p.err = bestErr;
    p.judgement = judgeTiming(bestErr);
    game.noteState.set(best.id, { status: "hit" });
    game.openHolds.set(midi, { p, pressTime: t });
    game.streak++;
    game.judged++;
    game.sumPoints += { perfect: 100, good: 75, ok: 40 }[p.judgement];
    addFloater(midi, p.judgement);
    updateHud();
  } else if (t > 0) {
    game.wrongPresses++;
  }
}

function releaseKey(midi) {
  if (!game.pressed.has(midi)) return;
  game.pressed.delete(midi);
  noteOff(midi);
  const hold = game.openHolds.get(midi);
  if (hold) {
    hold.p.holdRatio = Math.max(0, game.time - hold.pressTime) / hold.p.dur;
    game.openHolds.delete(midi);
  }
}

window.addEventListener("keydown", (e) => {
  if (stageEl.hidden) return;
  if (e.code === "Escape") { exitToMenu(); return; }
  const midi = CODE_TO_MIDI.get(e.code);
  if (midi == null) return;
  e.preventDefault();
  if (e.repeat) return;
  pressKey(midi);
});

window.addEventListener("keyup", (e) => {
  const midi = CODE_TO_MIDI.get(e.code);
  if (midi != null) releaseKey(midi);
});

// click / touch the on-screen keys too
const canvas = $("#viz");
let pointerMidi = null;
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const midi = viz.keyAt(e.clientX - rect.left, e.clientY - rect.top);
  if (midi != null) { pointerMidi = midi; pressKey(midi); canvas.setPointerCapture(e.pointerId); }
});
const endPointer = () => { if (pointerMidi != null) { releaseKey(pointerMidi); pointerMidi = null; } };
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

// ---------------------------------------------------------------- finish --

function finishRun() {
  game.phase = "done";
  overlayEl.classList.remove("bare");
  // close out any keys still held
  for (const [midi, hold] of game.openHolds) {
    hold.p.holdRatio = Math.max(0, game.time - hold.pressTime) / hold.p.dur;
  }
  game.openHolds.clear();
  allNotesOff();
  game.pressed.clear();

  if (game.mode === "play") {
    overlayEl.hidden = false;
    overlayEl.innerHTML = `
      <div class="panel">
        <div class="panel-title">fin.</div>
        <p class="panel-hint">That was “${game.song.title}”. Think you can play it yourself?</p>
        <div class="btn-row">
          <button class="btn big" id="practice-now-btn">practice it</button>
          <button class="btn" id="replay-btn">replay</button>
          <button class="btn" id="back-btn">all songs</button>
        </div>
      </div>`;
    $("#practice-now-btn").addEventListener("click", () => openStage(game.song, "practice"));
    $("#replay-btn").addEventListener("click", () => openStage(game.song, "play"));
    $("#back-btn").addEventListener("click", exitToMenu);
    return;
  }

  const res = gradePerformance(game.perf, game.wrongPresses);
  overlayEl.hidden = false;
  overlayEl.innerHTML = `
    <div class="panel results">
      <div class="grade-letter grade-${res.letter}">${res.letter}</div>
      <div class="grade-score">${res.score}<span>/100</span></div>
      <div class="counts">
        <span class="c-perfect">${res.counts.perfect} perfect</span>
        <span class="c-good">${res.counts.good} good</span>
        <span class="c-ok">${res.counts.ok} ok</span>
        <span class="c-miss">${res.counts.miss} missed</span>
        <span class="c-wrong">${res.wrongPresses} stray</span>
      </div>
      <div class="tips">
        <div class="tips-col">
          <h3>what worked</h3>
          <ul>${res.strengths.map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>
        <div class="tips-col">
          <h3>what to work on</h3>
          <ul>${res.improvements.map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn big" id="retry-btn">try again</button>
        <button class="btn" id="listen-btn">hear it played</button>
        <button class="btn" id="back-btn">all songs</button>
      </div>
    </div>`;
  $("#retry-btn").addEventListener("click", () => openStage(game.song, "practice"));
  $("#listen-btn").addEventListener("click", () => openStage(game.song, "play"));
  $("#back-btn").addEventListener("click", exitToMenu);
}

function exitToMenu() {
  cancelAnimationFrame(game.raf);
  game.phase = "menu";
  allNotesOff();
  game.pressed.clear();
  stageEl.hidden = true;
  overlayEl.hidden = true;
  menuEl.hidden = false;
}

function drawIdleFrame() {
  viz.draw({ time: 0, notes: [], pressed: game.pressed, lit: game.lit, floaters: [], showLabels: true });
}

// ----------------------------------------------------------------- setup --

new ResizeObserver(() => {
  viz.resize();
  if (game.phase === "ready" || game.phase === "menu") drawIdleFrame();
}).observe($(".canvas-wrap"));

buildMenu();
