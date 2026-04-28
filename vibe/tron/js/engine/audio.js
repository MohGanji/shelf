/**
 * Web Audio API engine: music (loop + crossfade), SFX pool, ambient bus.
 * Missing assets decode/load failures → silent no-op (graceful degradation).
 */

/**
 * @param {AudioContext} ctx
 * @param {GainNode} destination
 * @param {number} poolSize
 */
function createSfxPool(ctx, destination, poolSize) {
  /** @type {{ gain: GainNode; source: AudioBufferSourceNode | null }[]} */
  const voices = [];
  for (let i = 0; i < poolSize; i++) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(destination);
    voices.push({ gain: g, source: null });
  }

  /**
   * @param {AudioBuffer} buffer
   * @param {number} [when]
   */
  function play(buffer, when = 0) {
    const startAt = when;
    let voice = voices.find((v) => v.source === null);
    if (!voice) {
      voice = voices[0];
      try {
        voice.source?.stop(0);
      } catch {
        /* already stopped */
      }
      voice.source = null;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(voice.gain);
    voice.source = src;
    const t = Math.max(ctx.currentTime, startAt);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(1, t);
    src.onended = () => {
      if (voice.source === src) {
        voice.source = null;
      }
    };
    try {
      src.start(t);
    } catch {
      voice.source = null;
    }
  }

  return { play, _voices: voices };
}

/**
 * @param {AudioContext} ctx
 * @param {GainNode} musicOut
 */
function createMusicCrossfader(ctx, musicOut) {
  const a = ctx.createGain();
  const b = ctx.createGain();
  a.gain.value = 0;
  b.gain.value = 0;
  a.connect(musicOut);
  b.connect(musicOut);

  /** @type {[AudioBufferSourceNode | null, AudioBufferSourceNode | null]} */
  const sources = [null, null];
  /** @type {0 | 1} */
  let active = 0;
  let crossfadeSec = 1;

  /**
   * @param {0 | 1} idx
   */
  function stopSlot(idx) {
    const s = sources[idx];
    if (!s) return;
    try {
      s.stop(0);
    } catch {
      /* already stopped */
    }
    sources[idx] = null;
  }

  /**
   * @param {AudioBuffer} buffer
   * @param {number} durationSec
   */
  function crossfadeTo(buffer, durationSec) {
    const t0 = ctx.currentTime;
    const prevActive = active;
    const inactive = /** @type {0 | 1} */ (prevActive === 0 ? 1 : 0);
    stopSlot(inactive);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gIn = inactive === 0 ? a : b;
    const gOut = inactive === 0 ? b : a;
    src.connect(gIn);
    sources[inactive] = src;
    try {
      src.start(t0);
    } catch {
      sources[inactive] = null;
      return;
    }

    const dur = Math.max(0.01, durationSec);
    gOut.gain.cancelScheduledValues(t0);
    gIn.gain.cancelScheduledValues(t0);
    gOut.gain.setValueAtTime(gOut.gain.value, t0);
    gIn.gain.setValueAtTime(0, t0);
    gOut.gain.linearRampToValueAtTime(0, t0 + dur);
    gIn.gain.linearRampToValueAtTime(1, t0 + dur);

    active = inactive;
    window.setTimeout(() => {
      stopSlot(prevActive);
      const gDead = prevActive === 0 ? a : b;
      gDead.gain.cancelScheduledValues(ctx.currentTime);
      gDead.gain.value = 0;
    }, dur * 1000 + 50);
  }

  /**
   * @param {AudioBuffer} buffer
   */
  function startFirst(buffer) {
    stopSlot(0);
    stopSlot(1);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(a);
    sources[0] = src;
    active = 0;
    b.gain.value = 0;
    a.gain.value = 0;
    try {
      const t = ctx.currentTime;
      src.start(t);
      a.gain.setValueAtTime(1, t);
    } catch {
      sources[0] = null;
    }
  }

  function setCrossfadeDuration(sec) {
    crossfadeSec = Math.max(0.01, sec);
  }

  function getCrossfadeDuration() {
    return crossfadeSec;
  }

  function stopAll() {
    const t = ctx.currentTime;
    a.gain.linearRampToValueAtTime(0, t + 0.05);
    b.gain.linearRampToValueAtTime(0, t + 0.05);
    window.setTimeout(() => {
      stopSlot(0);
      stopSlot(1);
      a.gain.value = 0;
      b.gain.value = 0;
    }, 60);
  }

  return {
    a,
    b,
    crossfadeTo,
    startFirst,
    stopAll,
    setCrossfadeDuration,
    getCrossfadeDuration,
  };
}

/**
 * @typedef {object} AudioEngineOptions
 * @property {number} [masterVolume]
 * @property {number} [musicVolume]
 * @property {number} [sfxVolume]
 * @property {number} [ambientVolume]
 * @property {number} [musicCrossfadeSec]
 * @property {number} [sfxPoolSize]
 * @property {boolean} [autoplay]
 * @property {string} [musicLobbyUrl] — P8.2; try fetch/decode before procedural lobby bed
 * @property {string} [musicGameplayUrl] — P8.2; try fetch/decode before procedural gameplay bed
 */

/**
 * P8.2 — Seamless looping procedural pads (no external WAV). Integer-cycle carriers + sidechain period.
 * @param {Float32Array} chL
 * @param {Float32Array} chR
 * @param {number} n
 * @param {number} sr
 */
function fillLobbyMusicLoop(chL, chR, n, sr) {
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const breathe = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.25 * t);
    let s = 0;
    s += Math.sin(2 * Math.PI * 60 * t) * 0.055;
    s += Math.sin(2 * Math.PI * 80 * t) * 0.045;
    s += Math.sin(2 * Math.PI * 100 * t) * 0.04;
    s *= breathe;
    chL[i] = s * 0.85;
    chR[i] = s * 1.12;
  }
}

/**
 * @param {Float32Array} chL
 * @param {Float32Array} chR
 * @param {number} n
 * @param {number} sr
 */
function fillGameplayMusicLoop(chL, chR, n, sr) {
  const bps = 120 / 60;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const side = 0.35 + 0.65 * (Math.sin(2 * Math.PI * bps * t) * 0.5 + 0.5);
    let s = 0;
    s += Math.sin(2 * Math.PI * 75 * t) * 0.1 * side;
    s += Math.sin(2 * Math.PI * 150 * t) * 0.065 * side;
    s += Math.sin(2 * Math.PI * 225 * t) * 0.04 * side;
    chL[i] = s * 0.95;
    chR[i] = s * 1.05;
  }
}

/**
 * @param {number} sampleRate
 * @param {number} durationSec
 * @param {'lobby' | 'gameplay'} kind
 * @returns {AudioBuffer}
 */
function createProceduralMusicBuffer(sampleRate, durationSec, kind) {
  const frames = Math.max(2, Math.floor(sampleRate * durationSec));
  const buf = new AudioBuffer({
    length: frames,
    numberOfChannels: 2,
    sampleRate,
  });
  const chL = buf.getChannelData(0);
  const chR = buf.getChannelData(1);
  if (kind === "lobby") {
    fillLobbyMusicLoop(chL, chR, frames, sampleRate);
  } else {
    fillGameplayMusicLoop(chL, chR, frames, sampleRate);
  }
  return buf;
}

/** Keep music below gameplay SFX while preserving user-facing slider values. */
const MUSIC_BUS_TRIM = 0.58;

/**
 * Gear shift thresholds — plan: ~10%, ~25%, ~45%, ~70%, ~100% for 5 gears; equal splits for other counts.
 * @param {number} count
 * @returns {number[]}
 */
function getGearThresholds(count) {
  const n = Math.max(1, Math.min(10, Math.round(count)));
  if (n === 5) return [0.1, 0.25, 0.45, 0.7, 1.0];
  const t = [];
  for (let i = 1; i <= n; i += 1) {
    t.push(i / n);
  }
  return t;
}

/**
 * @param {number} ratio 0..1
 * @param {number[]} thresholds ascending
 */
function gearBandIndex(ratio, thresholds) {
  const r = Math.max(0, Math.min(1, ratio));
  for (let i = 0; i < thresholds.length; i += 1) {
    if (r < thresholds[i]) return i;
  }
  return Math.max(0, thresholds.length - 1);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

/**
 * @param {number} ratio 0..1
 * @param {number} band
 * @param {number[]} thresholds
 */
function gearProgressInBand(ratio, band, thresholds) {
  const lo = band <= 0 ? 0 : thresholds[band - 1] ?? 0;
  const hi = thresholds[band] ?? 1;
  return clamp01((ratio - lo) / Math.max(0.001, hi - lo));
}

/**
 * @param {AudioEngineOptions} options
 */
export function createAudioEngine(options = {}) {
  /** Kept in sync with gain nodes via `setVolumes` so procedural SFX envelopes match saved / UI levels. */
  let masterVolume = options.masterVolume ?? 1;
  let musicVolume = options.musicVolume ?? 0.7;
  let sfxVolume = options.sfxVolume ?? 1;
  let ambientVolume = options.ambientVolume ?? 0.5;
  let musicCrossfadeSec = options.musicCrossfadeSec ?? 1;
  const sfxPoolSize = options.sfxPoolSize ?? 16;
  const autoplay = options.autoplay ?? true;
  let musicLobbyUrl =
    typeof options.musicLobbyUrl === "string" && options.musicLobbyUrl.length > 0
      ? options.musicLobbyUrl
      : "";
  let musicGameplayUrl =
    typeof options.musicGameplayUrl === "string" && options.musicGameplayUrl.length > 0
      ? options.musicGameplayUrl
      : "";

  function effectiveMusicVolume() {
    return Math.max(0, musicVolume) * MUSIC_BUS_TRIM;
  }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return createNoopEngine();
  }

  const ctx = new Ctx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = masterVolume;
  masterGain.connect(ctx.destination);

  const musicGain = ctx.createGain();
  musicGain.gain.value = effectiveMusicVolume();
  musicGain.connect(masterGain);

  const sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxVolume;
  sfxGain.connect(masterGain);

  const ambientGain = ctx.createGain();
  ambientGain.gain.value = ambientVolume;
  ambientGain.connect(masterGain);

  /** Submix for ambient layers (grid hum, etc.) — connect sources here. */
  const ambientIn = ctx.createGain();
  ambientIn.gain.value = 1;
  ambientIn.connect(ambientGain);

  const music = createMusicCrossfader(ctx, musicGain);
  const sfxPool = createSfxPool(ctx, sfxGain, sfxPoolSize);
  music.setCrossfadeDuration(musicCrossfadeSec);

  let musicStarted = false;

  /** Dev HUD — procedural nitro/derez variant indices (synced via {@link syncDevAudioPresets}). */
  let sfxNitroPresetIndex = 0;
  let sfxDerezPresetIndex = 0;

  /** @type {{ lobby: AudioBuffer; gameplay: AudioBuffer } | null} */
  let proceduralMusicBuffers = null;

  /** @type {{ stop(): void }[]} */
  const ambientBedNodes = [];

  function ensureProceduralMusicBuffers() {
    if (proceduralMusicBuffers) return proceduralMusicBuffers;
    const sr = ctx.sampleRate;
    proceduralMusicBuffers = {
      lobby: createProceduralMusicBuffer(sr, 4, "lobby"),
      gameplay: createProceduralMusicBuffer(sr, 4, "gameplay"),
    };
    return proceduralMusicBuffers;
  }

  /**
   * Same as {@link playMusicLoop} but uses an in-memory buffer (P8.2 procedural or decoded WAV).
   * @param {AudioBuffer} buf
   */
  function playMusicLoopBuffer(buf) {
    if (!buf) return false;
    if (!musicStarted) {
      music.startFirst(buf);
      musicStarted = true;
      return true;
    }
    music.crossfadeTo(buf, music.getCrossfadeDuration());
    return true;
  }

  /** @type {Map<string, AudioBuffer | null>} */
  const bufferCache = new Map();

  /**
   * @param {string} url
   * @returns {Promise<AudioBuffer | null>}
   */
  async function loadBuffer(url) {
    if (!url || typeof url !== "string") return null;
    if (bufferCache.has(url)) {
      const c = bufferCache.get(url);
      return c === null ? null : c;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        bufferCache.set(url, null);
        return null;
      }
      const raw = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(raw.slice(0));
      bufferCache.set(url, buf);
      return buf;
    } catch {
      bufferCache.set(url, null);
      return null;
    }
  }

  let gestureUnlockAttached = false;

  function attachUserGestureUnlock() {
    if (gestureUnlockAttached) return;
    gestureUnlockAttached = true;
    /**
     * Do not `await ctx.resume()` — while autoplay-blocked, Chrome may leave that promise pending
     * forever, which would stall boot (`main.js` calls `unlock` before the tunnel). Fire-and-forget
     * and detach listeners once the context actually reaches `"running"`.
     */
    const tryResume = () => {
      void ctx.resume().catch(() => {});
    };
    const onState = () => {
      if (ctx.state === "running") {
        ctx.removeEventListener("statechange", onState);
        window.removeEventListener("pointerdown", tryResume);
        window.removeEventListener("keydown", tryResume);
      }
    };
    ctx.addEventListener("statechange", onState);
    window.addEventListener("pointerdown", tryResume, { passive: true });
    window.addEventListener("keydown", tryResume);
  }

  function unlock() {
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    if (ctx.state !== "running") {
      attachUserGestureUnlock();
    }
  }

  /** P8.4 — Engine layer state (procedural drag-style gear shifts + saw engine). */
  let engineGearBand = -1;
  /** Player: saw → fixed warm lowpass — same topology & pitch law as proximity enemy bed (see `applyDynamicMix`). */
  /** @type {{ mix: GainNode; core: OscillatorNode; lp: BiquadFilterNode; coreG: GainNode } | null} */
  let engineNodes = null;
  let engineLfoPhase = 0;
  let engineShiftStart = -1;
  let engineShiftUntil = -1;
  let engineShiftDepth = 0;
  let engineLastShiftAt = -1;
  let enginePrevSpeed = null;

  function ensureEngineGraph() {
    if (engineNodes || !ctx) return engineNodes;
    const mix = ctx.createGain();
    mix.gain.value = 0;
    mix.connect(sfxGain);
    const core = ctx.createOscillator();
    core.type = "sawtooth";
    core.frequency.value = 110;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    lp.Q.value = 0.78;
    const coreG = ctx.createGain();
    coreG.gain.value = 0;
    core.connect(lp);
    lp.connect(coreG);
    coreG.connect(mix);
    const t = ctx.currentTime;
    try {
      core.start(t);
    } catch {
      return null;
    }
    engineNodes = { mix, core, lp, coreG };
    return engineNodes;
  }

  /**
   * Drag-racing shift transient: low driveline thunk, clutch click, and a brief air/electric unload.
   * @param {object} opts
   * @param {number} [opts.load] 0..1
   * @param {number} [opts.gear]
   */
  function playEngineGearShift(opts = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const load = clamp01(typeof opts.load === "number" ? opts.load : 0.65);
    const gear = Math.max(1, Math.floor(typeof opts.gear === "number" ? opts.gear : 1));
    const amp = Math.max(0, sfxVolume) * (0.9 + load * 0.62);

    const thunk = ctx.createOscillator();
    thunk.type = "triangle";
    thunk.frequency.setValueAtTime(74 + gear * 5, t0);
    thunk.frequency.exponentialRampToValueAtTime(34, t0 + 0.075);
    const thunkG = ctx.createGain();
    thunkG.gain.setValueAtTime(0.0001, t0);
    thunkG.gain.exponentialRampToValueAtTime(0.13 * amp, t0 + 0.004);
    thunkG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.105);
    thunk.connect(thunkG);
    thunkG.connect(sfxGain);

    const frames = Math.max(256, Math.floor(ctx.sampleRate * 0.045));
    const noiseBuf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      nd[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const click = ctx.createBufferSource();
    click.buffer = noiseBuf;
    const clickBp = ctx.createBiquadFilter();
    clickBp.type = "bandpass";
    clickBp.frequency.setValueAtTime(1250, t0);
    clickBp.frequency.exponentialRampToValueAtTime(520, t0 + 0.035);
    clickBp.Q.value = 2.4;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(0.0001, t0);
    clickG.gain.exponentialRampToValueAtTime(0.055 * amp, t0 + 0.002);
    clickG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    click.connect(clickBp);
    clickBp.connect(clickG);
    clickG.connect(sfxGain);

    const unload = ctx.createBufferSource();
    unload.buffer = noiseBuf;
    const unloadBp = ctx.createBiquadFilter();
    unloadBp.type = "bandpass";
    unloadBp.frequency.setValueAtTime(420 + load * 180, t0);
    unloadBp.frequency.exponentialRampToValueAtTime(980 + load * 380, t0 + 0.075);
    unloadBp.Q.value = 0.55;
    const unloadG = ctx.createGain();
    unloadG.gain.setValueAtTime(0.0001, t0);
    unloadG.gain.exponentialRampToValueAtTime(0.022 * amp, t0 + 0.01);
    unloadG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
    unload.connect(unloadBp);
    unloadBp.connect(unloadG);
    unloadG.connect(sfxGain);

    try {
      thunk.start(t0);
      thunk.stop(t0 + 0.12);
      click.start(t0);
      click.stop(t0 + 0.055);
      unload.start(t0 + 0.01);
      unload.stop(t0 + 0.105);
    } catch {
      /* ignore */
    }
  }

  /**
   * Drive engine synth from player speed (plan P8.4). Call once per frame while in arena.
   * @param {object} opts
   * @param {boolean} [opts.active]
   * @param {number} [opts.dt]
   * @param {number} [opts.speed]
   * @param {number} [opts.speedRatioDenominator] — e.g. top speed × nitro cap for 0..1 ratio
   * @param {number} [opts.enginePitch] — devHud `enginePitch`
   * @param {number} [opts.gearShiftCount] — devHud `gearShiftCount`
   * @param {number} [opts.acceleration] — configured forward acceleration, for load-normalized shift intensity
   * @param {boolean} [opts.throttle]
   * @param {boolean} [opts.braking]
   * @param {boolean} [opts.nitroActive]
   */
  function tickEngineSound(opts = {}) {
    if (!ctx) return;
    const {
      active = true,
      dt = 1 / 60,
      speed = 0,
      speedRatioDenominator = 72,
      enginePitch = 1,
      gearShiftCount = 5,
      acceleration = 0,
      throttle = false,
      braking = false,
      nitroActive = false,
    } = opts;
    const gGraph = ensureEngineGraph();
    if (!gGraph) return;
    const t = ctx.currentTime;
    if (!active) {
      engineGearBand = -1;
      engineLfoPhase = 0;
      engineShiftStart = -1;
      engineShiftUntil = -1;
      engineShiftDepth = 0;
      engineLastShiftAt = -1;
      enginePrevSpeed = null;
      gGraph.coreG.gain.setTargetAtTime(0, t, 0.035);
      gGraph.mix.gain.setTargetAtTime(0, t, 0.035);
      return;
    }

    const pitch = typeof enginePitch === "number" && enginePitch > 0 ? enginePitch : 1;
    const denom = Math.max(0.001, speedRatioDenominator);
    const ratio = Math.max(0, Math.min(1, Math.abs(speed) / denom));
    const spd = Math.abs(speed);
    const prevSpd = typeof enginePrevSpeed === "number" ? Math.abs(enginePrevSpeed) : spd;
    const measuredAccel = dt > 0 ? Math.max(0, (spd - prevSpd) / dt) : 0;
    const accelRef =
      typeof acceleration === "number" && Number.isFinite(acceleration) && acceleration > 0
        ? acceleration
        : denom * 0.9;
    const accelLoad = clamp01(measuredAccel / Math.max(1, accelRef));
    /** Without throttle, tie idle motor character to road speed so parked grids stay quiet (still loud under throttle). */
    const idleEase =
      spd < 3 && !throttle && !nitroActive && !braking ? clamp01(spd / 6) : 1;
    const driverLoad = braking ? 0 : (throttle ? 0.7 : 0.18 * idleEase) + (nitroActive ? 0.3 : 0);
    const load = clamp01(Math.max(accelLoad, driverLoad));
    const th = getGearThresholds(
      typeof gearShiftCount === "number" && Number.isFinite(gearShiftCount) ? gearShiftCount : 5,
    );
    const band = gearBandIndex(ratio, th);
    const now = t;
    const upshiftThreshold = th[Math.min(engineGearBand, th.length - 1)] ?? ratio;
    const clearedShiftDeadband = ratio > upshiftThreshold + 0.006;
    if (
      engineGearBand >= 0 &&
      band > engineGearBand &&
      clearedShiftDeadband &&
      now - engineLastShiftAt > 0.16 &&
      load > 0.12
    ) {
      engineLastShiftAt = now;
      engineShiftStart = now;
      engineShiftUntil = now + 0.135;
      engineShiftDepth = 0.12 + load * 0.18;
      playEngineGearShift({ load, gear: band + 1 });
    }
    engineGearBand = band;
    enginePrevSpeed = speed;

    const gearProgress = gearProgressInBand(ratio, band, th);

    engineLfoPhase += dt * 5.2;
    const idleFlutter = 0.88 + 0.12 * Math.sin(engineLfoPhase);
    const nearIdle = spd < 2.2;
    const drive = clamp01(ratio);

    let shiftDip = 0;
    let mainVol = Math.pow(drive, 0.58) * (0.098 + load * 0.058);
    if (nearIdle) mainVol += 0.015 * clamp01(spd / 3);
    mainVol = Math.min(0.26, mainVol * idleFlutter * 1.1);
    if (now < engineShiftUntil && engineShiftStart >= 0) {
      const u = clamp01((now - engineShiftStart) / Math.max(0.001, engineShiftUntil - engineShiftStart));
      shiftDip = Math.sin(Math.PI * u) * engineShiftDepth;
      mainVol *= 1 - shiftDip * 0.55;
    }

    /**
     * Continuous road-speed sweep (matches proximity character) +
     * RPM climb within each gear band (so revs rise toward upshift, not a single smooth ramp).
     */
    const nitMul = nitroActive ? 1.045 : 1;
    const speedHz = Math.pow(drive, 0.9) * 240 * pitch;
    const rpm01 = clamp01(0.24 + gearProgress * 0.72 + load * 0.08);
    const rpmHz = Math.pow(Math.max(0.02, rpm01 - shiftDip * 0.42), 1.05) * 88 * pitch;
    const nearRedline =
      gearProgress > 0.82 ? Math.pow((gearProgress - 0.82) / 0.18, 1.15) * (12 + load * 22) : 0;
    let fHz = (88 + speedHz * 0.82 + rpmHz + nearRedline) * nitMul;
    if (shiftDip > 0) fHz *= 1 - shiftDip * 0.1;
    if (nearIdle && spd < 1.25) {
      fHz *= 0.94 + 0.06 * idleFlutter;
    }

    /** Fixed mellow LP (proximity timbre). */
    gGraph.lp.frequency.setTargetAtTime(520, t, 0.06);

    gGraph.core.frequency.setTargetAtTime(fHz, t, now < engineShiftUntil ? 0.022 : 0.065);
    gGraph.coreG.gain.setTargetAtTime(Math.min(0.198, mainVol), t, 0.045);
    gGraph.mix.gain.setTargetAtTime(1, t, 0.04);
  }

  /**
   * Briefly dip music so derez hits read above the bed (sfx stays on normal bus).
   */
  /** @param {"player" | "opponent" | undefined} [kind] — opponent kills duck slightly longer so hits sit above the bed. */
  function duckMusicForDerezSfx(kind) {
    const t0 = ctx.currentTime;
    const base = effectiveMusicVolume();
    let g = base;
    try {
      g = musicGain.gain.value;
    } catch {
      g = base;
    }
    try {
      musicGain.gain.cancelScheduledValues(t0);
    } catch {
      /* ignore */
    }
    musicGain.gain.setValueAtTime(g, t0);
    musicGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, base * 0.08), t0 + 0.055);
    const recover =
      kind === "opponent" ? 2.82 : kind === "player" ? 2.42 : 2.38;
    musicGain.gain.exponentialRampToValueAtTime(base, t0 + recover);
  }

  /**
   * @param {unknown} devHud
   */
  function syncDevAudioPresets(devHud) {
    if (!devHud || typeof devHud !== "object") return;
    const nn = Math.floor(Number(/** @type {{ sfxNitroPreset?: unknown }} */ (devHud).sfxNitroPreset));
    sfxNitroPresetIndex = Number.isFinite(nn) ? Math.max(0, Math.min(4, nn)) : 0;
    const dd = Math.floor(Number(/** @type {{ sfxDerezPreset?: unknown }} */ (devHud).sfxDerezPreset));
    sfxDerezPresetIndex = Number.isFinite(dd) ? Math.max(0, Math.min(4, dd)) : 0;
  }

  /**
   * @param {"player" | "opponent"} kind
   */
  function playDerezPreset0Shards(kind) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const isOpp = kind === "opponent";
    const v = Math.max(0, sfxVolume) * (isOpp ? 1.55 : 1.34);
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(sfxGain);
    const durM = isOpp ? 1.86 : 1.92;
    const hi0 = isOpp ? 5600 : 4200;
    const nF = 16384;
    const buf = ctx.createBuffer(1, nF, ctx.sampleRate);
    const dch = buf.getChannelData(0);
    for (let i = 0; i < nF; i += 1) {
      dch[i] = (Math.random() * 2 - 1) * (1 - i / nF);
    }

    // Layer A — main crackle (band-swept noise)
    const a = ctx.createBufferSource();
    a.buffer = buf;
    const aBp = ctx.createBiquadFilter();
    aBp.type = "bandpass";
    aBp.frequency.setValueAtTime(hi0, t0);
    aBp.frequency.exponentialRampToValueAtTime(130, t0 + durM);
    aBp.Q.value = 0.72;
    const aG = ctx.createGain();
    aG.gain.setValueAtTime(0.0001, t0);
    aG.gain.exponentialRampToValueAtTime((isOpp ? 0.6 : 0.48) * v, t0 + 0.065);
    aG.gain.exponentialRampToValueAtTime(0.0001, t0 + durM);
    a.connect(aBp);
    aBp.connect(aG);
    aG.connect(bus);

    // Layer B — sub “vacuum” rumble
    const b = ctx.createBufferSource();
    b.buffer = buf;
    const bL = ctx.createBiquadFilter();
    bL.type = "lowpass";
    bL.frequency.setValueAtTime(520, t0);
    bL.frequency.exponentialRampToValueAtTime(52, t0 + 0.72);
    const bG = ctx.createGain();
    bG.gain.setValueAtTime(0.0001, t0);
    bG.gain.exponentialRampToValueAtTime((isOpp ? 0.48 : 0.38) * v, t0 + 0.055);
    bG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.88);
    b.connect(bL);
    bL.connect(bG);
    bG.connect(bus);

    // Layer C — air / glass air (high shelf noise)
    const c = ctx.createBufferSource();
    c.buffer = buf;
    const cH = ctx.createBiquadFilter();
    cH.type = "highpass";
    cH.frequency.value = 2100;
    const cG = ctx.createGain();
    cG.gain.setValueAtTime(0.0001, t0);
    cG.gain.exponentialRampToValueAtTime((isOpp ? 0.3 : 0.22) * v, t0 + 0.02);
    cG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.56);
    c.connect(cH);
    cH.connect(cG);
    cG.connect(bus);

    // Layer D — digital “tear” (triangle, pitch dive)
    const tr = ctx.createOscillator();
    tr.type = "triangle";
    tr.frequency.setValueAtTime(420, t0);
    tr.frequency.exponentialRampToValueAtTime(36, t0 + 0.76);
    const tG = ctx.createGain();
    tG.gain.setValueAtTime(0.0001, t0);
    tG.gain.exponentialRampToValueAtTime((isOpp ? 0.24 : 0.17) * v, t0 + 0.022);
    tG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.82);
    const tLp = ctx.createBiquadFilter();
    tLp.type = "lowpass";
    tLp.frequency.setValueAtTime(6800, t0);
    tr.connect(tG);
    tG.connect(tLp);
    tLp.connect(bus);

    // Layer E — glass partials (staggered tails)
    const baseF = isOpp ? 1120 : 920;
    /** @type {OscillatorNode[]} */
    const chimeOscs = [];
    /** @type {number[]} */
    const chimeStopAt = [];
    for (let p = 0; p < 3; p += 1) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(baseF * (1 + 0.22 * p), t0);
      o.frequency.exponentialRampToValueAtTime(108 + p * 44, t0 + 0.52 + p * 0.05);
      const oG = ctx.createGain();
      oG.gain.setValueAtTime(0.0001, t0);
      oG.gain.exponentialRampToValueAtTime(0.088 * v * 0.5 ** p, t0 + 0.058 + p * 0.03);
      oG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.82 + p * 0.08);
      o.connect(oG);
      oG.connect(bus);
      chimeOscs.push(o);
      chimeStopAt.push(t0 + 0.9 + p * 0.08);
    }

    const zip = ctx.createOscillator();
    zip.type = "square";
    zip.frequency.setValueAtTime(isOpp ? 228 : 172, t0);
    zip.frequency.exponentialRampToValueAtTime(34, t0 + 0.128);
    const zipG = ctx.createGain();
    zipG.gain.setValueAtTime(0.0001, t0);
    zipG.gain.exponentialRampToValueAtTime(0.072 * v, t0 + 0.016);
    zipG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    const zipLp = ctx.createBiquadFilter();
    zipLp.type = "lowpass";
    zipLp.frequency.value = 3200;
    zip.connect(zipG);
    zipG.connect(zipLp);
    zipLp.connect(bus);

    // Layer F — body/sub decay (weights the dissolve so it doesn't feel like a tiny clip)
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(isOpp ? 62 : 50, t0);
    sub.frequency.exponentialRampToValueAtTime(20, t0 + 1.08);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, t0);
    subG.gain.exponentialRampToValueAtTime((isOpp ? 0.24 : 0.16) * v, t0 + 0.088);
    subG.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.62);
    sub.connect(subG);
    subG.connect(bus);

    // Layer G — delayed shard sweep (“aftershock”, stretches perceived duration)
    const ashDelay = 0.46;
    const ashDur = 0.98;
    const ash = ctx.createBufferSource();
    ash.buffer = buf;
    const ashBp = ctx.createBiquadFilter();
    ashBp.type = "bandpass";
    ashBp.frequency.setValueAtTime(isOpp ? 3400 : 2800, t0 + ashDelay);
    ashBp.frequency.exponentialRampToValueAtTime(88, t0 + ashDelay + ashDur * 0.94);
    ashBp.Q.value = 1.12;
    const ashG = ctx.createGain();
    ashG.gain.setValueAtTime(0.0001, t0 + ashDelay);
    ashG.gain.exponentialRampToValueAtTime((isOpp ? 0.38 : 0.3) * v, t0 + ashDelay + 0.058);
    ashG.gain.exponentialRampToValueAtTime(0.0001, t0 + ashDelay + ashDur);
    ash.connect(ashBp);
    ashBp.connect(ashG);
    ashG.connect(bus);

    // Layer H — explosion concussion (short LF punch under the shards)
    const expl = ctx.createOscillator();
    expl.type = "sine";
    expl.frequency.setValueAtTime(isOpp ? 96 : 82, t0);
    expl.frequency.exponentialRampToValueAtTime(28, t0 + 0.38);
    const explG = ctx.createGain();
    explG.gain.setValueAtTime(0.0001, t0);
    explG.gain.exponentialRampToValueAtTime((isOpp ? 0.26 : 0.2) * v, t0 + 0.01);
    explG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.52);
    expl.connect(explG);
    explG.connect(bus);

    // Layer I — explosion blast cloud (filtered noise transient)
    const explN = ctx.createBufferSource();
    explN.buffer = buf;
    const explLp = ctx.createBiquadFilter();
    explLp.type = "lowpass";
    explLp.frequency.setValueAtTime(5200, t0);
    explLp.frequency.exponentialRampToValueAtTime(240, t0 + 0.24);
    const explNg = ctx.createGain();
    explNg.gain.setValueAtTime(0.0001, t0);
    explNg.gain.exponentialRampToValueAtTime((isOpp ? 0.34 : 0.26) * v, t0 + 0.018);
    explNg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    explN.connect(explLp);
    explLp.connect(explNg);
    explNg.connect(bus);

    // Layer J — car-crash scrape / twist (rapid BP sweep across noise)
    const crash = ctx.createBufferSource();
    crash.buffer = buf;
    const crashBp = ctx.createBiquadFilter();
    crashBp.type = "bandpass";
    crashBp.frequency.setValueAtTime(isOpp ? 4800 : 4200, t0 + 0.004);
    crashBp.frequency.exponentialRampToValueAtTime(160, t0 + 0.15);
    crashBp.Q.value = 2.05;
    const crashG = ctx.createGain();
    crashG.gain.setValueAtTime(0.0001, t0 + 0.006);
    crashG.gain.exponentialRampToValueAtTime((isOpp ? 0.32 : 0.24) * v, t0 + 0.032);
    crashG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    crash.connect(crashBp);
    crashBp.connect(crashG);
    crashG.connect(bus);

    // Layer K — metallic impact pings (brief bumper / sheet-metal hits)
    /** @type {OscillatorNode[]} */
    const clangOsc = [];
    /** @type {number[]} */
    const clangStop = [];
    const clangFreq = isOpp ? [740, 1180, 1860] : [620, 980, 1540];
    for (let ci = 0; ci < clangFreq.length; ci += 1) {
      const co = ctx.createOscillator();
      co.type = "triangle";
      const f0 = clangFreq[ci];
      co.frequency.setValueAtTime(f0, t0 + ci * 0.009);
      co.frequency.exponentialRampToValueAtTime(Math.max(48, f0 * 0.38 + ci * 22), t0 + 0.072 + ci * 0.016);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t0 + ci * 0.009);
      cg.gain.exponentialRampToValueAtTime((isOpp ? 0.09 : 0.068) * v * 0.72 ** ci, t0 + 0.018 + ci * 0.011);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14 + ci * 0.045);
      co.connect(cg);
      cg.connect(bus);
      clangOsc.push(co);
      clangStop.push(t0 + 0.22 + ci * 0.03);
    }

    try {
      zip.start(t0);
      zip.stop(t0 + 0.24);
      expl.start(t0);
      expl.stop(t0 + 0.58);
      explN.start(t0);
      explN.stop(t0 + 0.46);
      crash.start(t0 + 0.004);
      crash.stop(t0 + 0.32);
      sub.start(t0);
      sub.stop(t0 + 1.68);
      a.start(t0);
      a.stop(t0 + durM + 0.12);
      b.start(t0);
      b.stop(t0 + 0.92);
      c.start(t0);
      c.stop(t0 + 0.58);
      tr.start(t0);
      tr.stop(t0 + 0.88);
      ash.start(t0 + ashDelay);
      ash.stop(t0 + ashDelay + ashDur + 0.06);
      for (let ci = 0; ci < clangOsc.length; ci += 1) {
        clangOsc[ci].start(t0 + ci * 0.009);
        clangOsc[ci].stop(clangStop[ci] ?? t0 + 0.26);
      }
      for (let pi = 0; pi < chimeOscs.length; pi += 1) {
        const o = chimeOscs[pi];
        const stopAt = chimeStopAt[pi] ?? t0 + 0.98;
        o.start(t0);
        o.stop(stopAt);
      }
    } catch {
      /* ignore */
    }
  }

  /** Preset 1 — staggered square chirps + shard noise bursts (rhythmic cascade). */
  function playDerezPreset1PulseCascade(kind) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const isOpp = kind === "opponent";
    const v = Math.max(0, sfxVolume) * (isOpp ? 1.34 : 1.22);
    const nF = 8192;
    const buf = ctx.createBuffer(1, nF, ctx.sampleRate);
    const dch = buf.getChannelData(0);
    for (let i = 0; i < nF; i += 1) {
      dch[i] = (Math.random() * 2 - 1) * (1 - i / nF);
    }
    const steps = 6;
    for (let k = 0; k < steps; k += 1) {
      const tk = t0 + k * 0.082;
      const sq = ctx.createOscillator();
      sq.type = "square";
      sq.frequency.setValueAtTime(isOpp ? 410 : 330, tk);
      sq.frequency.exponentialRampToValueAtTime(48 + k * 9, tk + 0.072);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, tk);
      g.gain.exponentialRampToValueAtTime(0.082 * v, tk + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, tk + 0.096);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      sq.connect(lp);
      lp.connect(g);
      g.connect(sfxGain);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(4800 - k * 380, tk);
      bp.frequency.exponentialRampToValueAtTime(220, tk + 0.088);
      bp.Q.value = 1.45;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, tk);
      ng.gain.exponentialRampToValueAtTime(0.065 * v, tk + 0.014);
      ng.gain.exponentialRampToValueAtTime(0.0001, tk + 0.09);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(sfxGain);
      try {
        sq.start(tk);
        sq.stop(tk + 0.108);
        noise.start(tk);
        noise.stop(tk + 0.098);
      } catch {
        /* ignore */
      }
    }
  }

  /** Preset 2 — thunder wash + boom + ping + hiss tail (cinematic dissolve). */
  function playDerezPreset2ThunderDissolve(kind) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const isOpp = kind === "opponent";
    const v = Math.max(0, sfxVolume) * (isOpp ? 1.32 : 1.18);
    const nF = 12288;
    const buf = ctx.createBuffer(1, nF, ctx.sampleRate);
    const dch = buf.getChannelData(0);
    for (let i = 0; i < nF; i += 1) {
      dch[i] = (Math.random() * 2 - 1) * (1 - i / nF);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t0);
    lp.frequency.exponentialRampToValueAtTime(9800, t0 + 0.018);
    lp.frequency.exponentialRampToValueAtTime(140, t0 + 1.05);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.52 * v, t0 + 0.045);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.18);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(sfxGain);
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(isOpp ? 58 : 48, t0);
    boom.frequency.exponentialRampToValueAtTime(18, t0 + 0.85);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.exponentialRampToValueAtTime(0.22 * v, t0 + 0.06);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
    boom.connect(bg);
    bg.connect(sfxGain);
    const ping = ctx.createOscillator();
    ping.type = "sine";
    ping.frequency.setValueAtTime(1760, t0 + 0.05);
    ping.frequency.exponentialRampToValueAtTime(440, t0 + 0.38);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, t0 + 0.05);
    pg.gain.exponentialRampToValueAtTime(0.09 * v, t0 + 0.058);
    pg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    ping.connect(pg);
    pg.connect(sfxGain);
    try {
      src.start(t0);
      src.stop(t0 + 1.22);
      boom.start(t0);
      boom.stop(t0 + 1.12);
      ping.start(t0 + 0.05);
      ping.stop(t0 + 0.46);
    } catch {
      /* ignore */
    }
  }

  /** Preset 3 — dual saw chirps + HP crackle (sharp arcade bite). */
  function playDerezPreset3ArcadeShear(kind) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const isOpp = kind === "opponent";
    const v = Math.max(0, sfxVolume) * (isOpp ? 1.42 : 1.28);
    for (let k = 0; k < 2; k += 1) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(isOpp ? 920 + k * 180 : 740 + k * 210, t0);
      osc.frequency.exponentialRampToValueAtTime(55 + k * 18, t0 + 0.22 + k * 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.085 * v, t0 + 0.004 + k * 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26 + k * 0.02);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6200;
      osc.connect(lp);
      lp.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.31);
      } catch {
        /* ignore */
      }
    }
    const nF = 4096;
    const buf = ctx.createBuffer(1, nF, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < nF; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / nF);
    }
    const hp = ctx.createBufferSource();
    hp.buffer = buf;
    const bpf = ctx.createBiquadFilter();
    bpf.type = "highpass";
    bpf.frequency.value = 2800;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.14 * v, t0 + 0.008);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    hp.connect(bpf);
    bpf.connect(hg);
    hg.connect(sfxGain);
    try {
      hp.start(t0);
      hp.stop(t0 + 0.2);
    } catch {
      /* ignore */
    }
  }

  /** Preset 4 — slow sine cluster + distant hiss swell (gentler aftermath). */
  function playDerezPreset4SoftImplode(kind) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const isOpp = kind === "opponent";
    const v = Math.max(0, sfxVolume) * (isOpp ? 1.22 : 1.08);
    const freqs = isOpp ? [185, 247, 329] : [155, 233, 311];
    let i = 0;
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const delay = i * 0.048;
      osc.frequency.setValueAtTime(f, t0 + delay);
      osc.frequency.exponentialRampToValueAtTime(f * 0.42 + i * 12, t0 + 0.72 + i * 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(0.065 * v * 0.88 ** i, t0 + delay + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 1.35);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0 + delay);
        osc.stop(t0 + delay + 1.42);
      } catch {
        /* ignore */
      }
      i += 1;
    }
    const nf = 8192;
    const nb = ctx.createBuffer(1, nf, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let k = 0; k < nf; k++) {
      nd[k] = (Math.random() * 2 - 1) * (1 - k / nf);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(2100, t0 + 0.35);
    bp.frequency.exponentialRampToValueAtTime(130, t0 + 1.1);
    bp.Q.value = 0.85;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0 + 0.35);
    ng.gain.exponentialRampToValueAtTime(0.06 * v, t0 + 0.42);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.28);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(sfxGain);
    try {
      noise.start(t0 + 0.35);
      noise.stop(t0 + 1.32);
    } catch {
      /* ignore */
    }
  }

  /**
   * Death derez — delegates to preset chosen in Dev HUD (`sfxDerezPreset`).
   * @param {"player" | "opponent"} kind
   */
  function playDerezShatterCore(kind) {
    if (!ctx) return;
    duckMusicForDerezSfx(kind);
    switch (sfxDerezPresetIndex) {
      case 1:
        playDerezPreset1PulseCascade(kind);
        break;
      case 2:
        playDerezPreset2ThunderDissolve(kind);
        break;
      case 3:
        playDerezPreset3ArcadeShear(kind);
        break;
      case 4:
        playDerezPreset4SoftImplode(kind);
        break;
      default:
        playDerezPreset0Shards(kind);
        break;
    }
  }

  /** Proximity bed — shared recipe with player engine: saw → fixed ~520 Hz lowpass (detuned pitch range). */
  /** @type {{ osc: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null} */
  let enemyBed = null;
  function ensureEnemyBed() {
    if (enemyBed || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 520;
    f.Q.value = 0.78;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    const t0 = ctx.currentTime;
    try {
      osc.start(t0);
    } catch {
      return;
    }
    enemyBed = { osc, f, g };
  }

  /** Quieter than enemy bed — triangle “fence hum” detuned by proximity to lethal trails (Dev HUD). */
  /** @type {{ osc: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null} */
  let trailBed = null;
  function ensureTrailBed() {
    if (trailBed || !ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 580;
    f.Q.value = 0.72;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    const t0 = ctx.currentTime;
    try {
      osc.start(t0);
    } catch {
      return;
    }
    trailBed = { osc, f, g };
  }

  /** Continuous nitro/boost exhaust — looped noise BP + detuned saw LP (same timbral family as engine / proximity bed). */
  /** @type {(null | { mix: GainNode })[]} */
  const nitroPresetSlots = [null, null, null, null, null];
  /** @type {{ src: AudioBufferSourceNode; bp: BiquadFilterNode; ng: GainNode; saw: OscillatorNode; slp: BiquadFilterNode; sg: GainNode; mix: GainNode } | null} */
  let nitroExhaust = null;
  function ensureNitroExhaustGraph() {
    if (nitroExhaust || !ctx) return nitroExhaust;
    const frames = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) {
      d[i] = (Math.random() * 2 - 1) * 0.92;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1.22;
    const ng = ctx.createGain();
    ng.gain.value = 1;
    src.connect(bp);
    bp.connect(ng);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = 340;
    const slp = ctx.createBiquadFilter();
    slp.type = "lowpass";
    slp.frequency.value = 640;
    slp.Q.value = 0.74;
    const sg = ctx.createGain();
    sg.gain.value = 1;
    saw.connect(slp);
    slp.connect(sg);
    const mix = ctx.createGain();
    mix.gain.value = 0;
    ng.connect(mix);
    sg.connect(mix);
    mix.connect(sfxGain);
    const tStart = ctx.currentTime;
    try {
      src.start(tStart);
      saw.start(tStart);
    } catch {
      return null;
    }
    nitroExhaust = { src, bp, ng, saw, slp, sg, mix };
    nitroPresetSlots[0] = nitroExhaust;
    return nitroExhaust;
  }

  /**
   * Alternate sustained nitro beds — indexed 1…4 (`sfxNitroPreset`).
   * @param {1 | 2 | 3 | 4} idx
   */
  function ensureNitroPresetAlt(idx) {
    if (!ctx || idx < 1 || idx > 4) return null;
    if (nitroPresetSlots[idx]) return nitroPresetSlots[idx];

    const frames = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) {
      d[i] = (Math.random() * 2 - 1) * 0.92;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const mix = ctx.createGain();
    mix.gain.value = 0;
    mix.connect(sfxGain);
    const tStart = ctx.currentTime;

    if (idx === 1) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 760;
      lp.Q.value = 0.68;
      const ng = ctx.createGain();
      ng.gain.value = 1;
      src.connect(lp);
      lp.connect(ng);
      ng.connect(mix);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 118;
      const og = ctx.createGain();
      og.gain.value = 1;
      osc.connect(og);
      og.connect(mix);
      try {
        src.start(tStart);
        osc.start(tStart);
      } catch {
        return null;
      }
      nitroPresetSlots[idx] = /** @type {any} */ ({ mix, src, lp, ng, osc, og });
      return nitroPresetSlots[idx];
    }

    if (idx === 2) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 1580;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3400;
      const og = ctx.createGain();
      og.gain.value = 1;
      osc.connect(lp);
      lp.connect(og);
      og.connect(mix);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3400;
      bp.Q.value = 1.65;
      const ng = ctx.createGain();
      ng.gain.value = 0.55;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(mix);
      try {
        osc.start(tStart);
        src.start(tStart);
      } catch {
        return null;
      }
      nitroPresetSlots[idx] = /** @type {any} */ ({ mix, osc, lp, bp, og, ng, src });
      return nitroPresetSlots[idx];
    }

    if (idx === 3) {
      const sq = ctx.createOscillator();
      sq.type = "square";
      sq.frequency.value = 46;
      const slp = ctx.createBiquadFilter();
      slp.type = "lowpass";
      slp.frequency.value = 680;
      const sg = ctx.createGain();
      sg.gain.value = 1;
      sq.connect(slp);
      slp.connect(sg);
      sg.connect(mix);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 920;
      bp.Q.value = 1.35;
      const ng = ctx.createGain();
      ng.gain.value = 1;
      src.connect(bp);
      bp.connect(ng);
      ng.connect(mix);
      try {
        sq.start(tStart);
        src.start(tStart);
      } catch {
        return null;
      }
      nitroPresetSlots[idx] = /** @type {any} */ ({ mix, sq, slp, sg, bp, ng, src });
      return nitroPresetSlots[idx];
    }

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 8;
    const ng = ctx.createGain();
    ng.gain.value = 1;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(mix);
    try {
      src.start(tStart);
    } catch {
      return null;
    }
    nitroPresetSlots[idx] = /** @type {any} */ ({ mix, bp, ng, src });
    return nitroPresetSlots[idx];
  }

  /**
   * @param {number} t
   * @param {number} exceptIdx — preset slot to leave untouched (−1 = mute all)
   */
  function muteNitroPresetSlotsExcept(t, exceptIdx) {
    for (let i = 0; i < 5; i++) {
      if (i === exceptIdx) continue;
      let mix = null;
      if (i === 0) {
        mix = nitroPresetSlots[0]?.mix ?? nitroExhaust?.mix ?? null;
      } else {
        mix = nitroPresetSlots[i]?.mix ?? null;
      }
      try {
        if (mix) mix.gain.setTargetAtTime(0, t, 0.065);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Sustained nitro/boost timbre — preset from Dev HUD (`sfxNitroPreset`).
   * @param {Partial<{ active: boolean; intensity01: number; dt: number }>} [opts]
   */
  function tickNitroExhaustHiss(opts = {}) {
    const active = opts.active !== false;
    const intensity01 = clamp01(typeof opts.intensity01 === "number" ? opts.intensity01 : 0);
    if (!ctx) return;
    const t = ctx.currentTime;
    const dead = !active || intensity01 < 0.014;
    if (dead) {
      muteNitroPresetSlotsExcept(t, -1);
      return;
    }
    const vol = Math.max(0, sfxVolume);
    const shaped = Math.pow(intensity01, 0.76);
    const pi = sfxNitroPresetIndex;
    muteNitroPresetSlotsExcept(t, pi);

    try {
      if (pi === 1) {
        const slot = ensureNitroPresetAlt(1);
        if (!slot) return;
        const amp = Math.min(0.27, shaped * 0.21 * vol);
        slot.mix.gain.setTargetAtTime(amp, t, 0.052);
        slot.lp.frequency.setTargetAtTime(420 + intensity01 * 2600, t, 0.09);
        slot.osc.frequency.setTargetAtTime(88 + intensity01 * 210, t, 0.065);
      } else if (pi === 2) {
        const slot = ensureNitroPresetAlt(2);
        if (!slot) return;
        const amp = Math.min(0.22, shaped * 0.155 * vol);
        slot.mix.gain.setTargetAtTime(amp, t, 0.055);
        slot.osc.frequency.setTargetAtTime(960 + intensity01 * 4200, t, 0.08);
        slot.bp.frequency.setTargetAtTime(2100 + intensity01 * 4100, t, 0.075);
        slot.ng.gain.setTargetAtTime(0.35 + intensity01 * 0.55, t, 0.06);
      } else if (pi === 3) {
        const slot = ensureNitroPresetAlt(3);
        if (!slot) return;
        const amp = Math.min(0.29, shaped * 0.215 * vol);
        slot.mix.gain.setTargetAtTime(amp, t, 0.048);
        slot.sq.frequency.setTargetAtTime(38 + intensity01 * 72, t, 0.055);
        slot.bp.frequency.setTargetAtTime(620 + intensity01 * 1480, t, 0.07);
      } else if (pi === 4) {
        const slot = ensureNitroPresetAlt(4);
        if (!slot) return;
        const amp = Math.min(0.2, shaped * 0.145 * vol);
        slot.mix.gain.setTargetAtTime(amp, t, 0.06);
        slot.bp.frequency.setTargetAtTime(900 + intensity01 * 5200, t, 0.1);
        slot.bp.Q.value = 6 + intensity01 * 10;
      } else {
        const g = ensureNitroExhaustGraph();
        if (!g) return;
        const amp = Math.min(0.26, shaped * 0.185 * vol);
        g.mix.gain.setTargetAtTime(amp, t, 0.052);
        g.bp.frequency.setTargetAtTime(760 + intensity01 * 3360, t, 0.09);
        g.bp.Q.value = 1.02 + intensity01 * 1.05;
        g.saw.frequency.setTargetAtTime(248 + intensity01 * 560, t, 0.065);
        g.slp.frequency.setTargetAtTime(500 + intensity01 * 1680, t, 0.075);
      }
    } catch {
      /* ignore */
    }
  }

  /** Burst opener paired with preset 0 sustained nitro — layered sweep + grit + bass + hiss. */
  function playNitroBurstPresetVent() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const sweep = ctx.createOscillator();
    const sg = ctx.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(140, t0);
    sweep.frequency.exponentialRampToValueAtTime(2600, t0 + 0.175);
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.125 * amp, t0 + 0.024);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    sweep.connect(sg);
    sg.connect(sfxGain);

    const grit = ctx.createOscillator();
    const gg = ctx.createGain();
    grit.type = "sawtooth";
    grit.frequency.setValueAtTime(320, t0);
    grit.frequency.exponentialRampToValueAtTime(1480, t0 + 0.14);
    const glp = ctx.createBiquadFilter();
    glp.type = "lowpass";
    glp.frequency.value = 1100;
    gg.gain.setValueAtTime(0.0001, t0);
    gg.gain.exponentialRampToValueAtTime(0.058 * amp, t0 + 0.032);
    gg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    grit.connect(glp);
    glp.connect(gg);
    gg.connect(sfxGain);

    const bass = ctx.createOscillator();
    const bg = ctx.createGain();
    bass.type = "sine";
    bass.frequency.setValueAtTime(58, t0);
    bass.frequency.exponentialRampToValueAtTime(44, t0 + 0.12);
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.exponentialRampToValueAtTime(0.118 * amp, t0 + 0.042);
    bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
    bass.connect(bg);
    bg.connect(sfxGain);

    const n = 4096;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const hiss = ctx.createBufferSource();
    hiss.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.setValueAtTime(6200, t0);
    hp.frequency.exponentialRampToValueAtTime(920, t0 + 0.16);
    hp.Q.value = 1.42;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.078 * amp, t0 + 0.015);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    hiss.connect(hp);
    hp.connect(hg);
    hg.connect(sfxGain);

    try {
      sweep.start(t0);
      sweep.stop(t0 + 0.29);
      grit.start(t0);
      grit.stop(t0 + 0.26);
      bass.start(t0);
      bass.stop(t0 + 0.34);
      hiss.start(t0);
      hiss.stop(t0 + 0.22);
    } catch {
      /* ignore */
    }
  }

  /** Brief sine bump + LP noise — matches Turbine sustained character. */
  function playNitroBurstPresetTurbine() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, t0);
    osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14 * amp, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(g);
    g.connect(sfxGain);
    const nf = 2048;
    const buf = ctx.createBuffer(1, nf, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nf; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / nf);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(560, t0);
    lp.frequency.exponentialRampToValueAtTime(3400, t0 + 0.14);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.085 * amp, t0 + 0.022);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    src.connect(lp);
    lp.connect(ng);
    ng.connect(sfxGain);
    try {
      osc.start(t0);
      osc.stop(t0 + 0.24);
      src.start(t0);
      src.stop(t0 + 0.21);
    } catch {
      /* ignore */
    }
  }

  function playNitroBurstPresetEther() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(2100, t0);
    osc.frequency.exponentialRampToValueAtTime(8800, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.078 * amp, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    osc.connect(g);
    g.connect(sfxGain);
    try {
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } catch {
      /* ignore */
    }
  }

  function playNitroBurstPresetSub() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const sq = ctx.createOscillator();
    sq.type = "square";
    sq.frequency.setValueAtTime(48, t0);
    sq.frequency.exponentialRampToValueAtTime(72, t0 + 0.08);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.11 * amp, t0 + 0.038);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    sq.connect(lp);
    lp.connect(sg);
    sg.connect(sfxGain);
    try {
      sq.start(t0);
      sq.stop(t0 + 0.28);
    } catch {
      /* ignore */
    }
  }

  function playNitroBurstPresetThin() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const nf = 2048;
    const buf = ctx.createBuffer(1, nf, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < nf; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / nf);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(5200, t0);
    bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.12);
    bp.Q.value = 12;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.065 * amp, t0 + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(sfxGain);
    try {
      src.start(t0);
      src.stop(t0 + 0.18);
    } catch {
      /* ignore */
    }
  }

  function dispatchNitroBurstWhoosh() {
    switch (sfxNitroPresetIndex) {
      case 1:
        playNitroBurstPresetTurbine();
        break;
      case 2:
        playNitroBurstPresetEther();
        break;
      case 3:
        playNitroBurstPresetSub();
        break;
      case 4:
        playNitroBurstPresetThin();
        break;
      default:
        playNitroBurstPresetVent();
        break;
    }
  }

  function playBoostPadPresetVent() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxVolume);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(380, t0);
    osc.frequency.exponentialRampToValueAtTime(1750, t0 + 0.085);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.094 * amp, t0 + 0.022);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g);
    g.connect(sfxGain);

    const saw = ctx.createOscillator();
    const sg = ctx.createGain();
    saw.type = "sawtooth";
    saw.frequency.setValueAtTime(210, t0);
    saw.frequency.exponentialRampToValueAtTime(780, t0 + 0.09);
    const slp = ctx.createBiquadFilter();
    slp.type = "lowpass";
    slp.frequency.value = 820;
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.048 * amp, t0 + 0.024);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    saw.connect(slp);
    slp.connect(sg);
    sg.connect(sfxGain);

    const n = 4096;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(4200, t0);
    bp.frequency.exponentialRampToValueAtTime(780, t0 + 0.11);
    bp.Q.value = 1.35;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(0.065 * amp, t0 + 0.018);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(sfxGain);

    try {
      osc.start(t0);
      osc.stop(t0 + 0.19);
      saw.start(t0);
      saw.stop(t0 + 0.17);
      noise.start(t0);
      noise.stop(t0 + 0.16);
    } catch {
      /* ignore */
    }
  }

  function dispatchBoostPadWhoosh() {
    switch (sfxNitroPresetIndex) {
      case 1:
        playNitroBurstPresetTurbine();
        break;
      case 2:
        playNitroBurstPresetEther();
        break;
      case 3:
        playNitroBurstPresetSub();
        break;
      case 4:
        playNitroBurstPresetThin();
        break;
      default:
        playBoostPadPresetVent();
        break;
    }
  }

  function playOpponentSlamLayer() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const v = Math.max(0, sfxVolume);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(54, t0);
    osc.frequency.exponentialRampToValueAtTime(28, t0 + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.62 * v, t0 + 0.024);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.92);
    osc.connect(g);
    g.connect(sfxGain);
    const harm = ctx.createOscillator();
    harm.type = "triangle";
    harm.frequency.setValueAtTime(108, t0);
    harm.frequency.exponentialRampToValueAtTime(46, t0 + 0.16);
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0);
    hg.gain.exponentialRampToValueAtTime(0.32 * v, t0 + 0.032);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.72);
    harm.connect(hg);
    hg.connect(sfxGain);
    try {
      osc.start(t0);
      osc.stop(t0 + 1.05);
      harm.start(t0);
      harm.stop(t0 + 0.82);
    } catch {
      /* ignore */
    }
  }

  /**
   * Engine off + enemy proximity bed to zero — does **not** move the music duck (safe during derez SFX).
   * @param {number} [dt]
   */
  function silenceDrivingLayers(dt = 1 / 60) {
    tickEngineSound({ active: false, dt });
    tickNitroExhaustHiss({ active: false, intensity01: 0, dt });
    ensureEnemyBed();
    ensureTrailBed();
    if (ctx) {
      const t0 = ctx.currentTime;
      if (enemyBed) {
        try {
          enemyBed.g.gain.setTargetAtTime(0, t0, 0.045);
        } catch {
          /* ignore */
        }
      }
      if (trailBed) {
        try {
          trailBed.g.gain.setTargetAtTime(0, t0, 0.045);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    context: ctx,
    autoplay,

    masterGain,
    musicGain,
    sfxGain,
    ambientGain,
    /** Input bus for ambient layers (grid hum, crackle, drone — P8.3+). */
    ambientIn,

    needsUserGesture() {
      return ctx.state === "suspended";
    },
    attachUserGestureUnlock,
    unlock,

    /**
     * @param {Partial<{ master: number; music: number; sfx: number; ambient: number }>} v
     */
    setVolumes(v) {
      if (v.master != null) {
        masterVolume = v.master;
        masterGain.gain.value = v.master;
      }
      if (v.music != null) {
        musicVolume = v.music;
        musicGain.gain.value = effectiveMusicVolume();
      }
      if (v.sfx != null) {
        sfxVolume = v.sfx;
        sfxGain.gain.value = v.sfx;
      }
      if (v.ambient != null) {
        ambientVolume = v.ambient;
        ambientGain.gain.value = v.ambient;
      }
    },

    /**
     * Frame mix: music duck + enemy engine proximity bed + trail proximity bed (SFX bus).
     * @param {Partial<{ musicDuckTension01: number; musicDuckMaxDb: number; enemyEngine01: number; enemyEngineMaxGain: number; trailProximity01: number; trailProximityMaxGain: number; trailProximityBedEnabled: boolean }>} opts
     */
    applyDynamicMix(opts = {}) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const duck = clamp01(/** @type {number} */ (opts.musicDuckTension01 ?? 0));
      const maxDb = typeof opts.musicDuckMaxDb === "number" && Number.isFinite(opts.musicDuckMaxDb) ? opts.musicDuckMaxDb : 4;
      const lin = Math.pow(10, -maxDb / 20);
      const factor = 1 - duck * (1 - lin);
      const base = effectiveMusicVolume();
      try {
        musicGain.gain.setTargetAtTime(base * factor, t0, 0.07);
      } catch {
        /* ignore */
      }
      const e01 = clamp01(/** @type {number} */ (opts.enemyEngine01 ?? 0));
      const maxG =
        typeof opts.enemyEngineMaxGain === "number" && Number.isFinite(opts.enemyEngineMaxGain)
          ? Math.max(0, opts.enemyEngineMaxGain)
          : 0.35;
      ensureEnemyBed();
      if (enemyBed) {
        const mg = e01 * maxG * Math.max(0, sfxVolume);
        enemyBed.g.gain.setTargetAtTime(mg, t0, 0.045);
        /** Same sweep shape as player core; slight Hz offset so two bikes don’t perfectly phase-cancel when layered. */
        enemyBed.osc.frequency.setTargetAtTime(84 + e01 * 248, t0, 0.085);
      }
      const trWall =
        opts.trailProximityBedEnabled === false
          ? 0
          : clamp01(/** @type {number} */ (opts.trailProximity01 ?? 0));
      const trMax =
        typeof opts.trailProximityMaxGain === "number" && Number.isFinite(opts.trailProximityMaxGain)
          ? Math.max(0, opts.trailProximityMaxGain)
          : 0.2;
      ensureTrailBed();
      if (trailBed) {
        const tg = trWall * trMax * Math.max(0, sfxVolume);
        trailBed.g.gain.setTargetAtTime(tg, t0, 0.048);
        trailBed.osc.frequency.setTargetAtTime(62 + trWall * 152, t0, 0.09);
        trailBed.f.frequency.setTargetAtTime(380 + trWall * 820, t0, 0.085);
      }
    },

    syncDevAudioPresets,

    /** Tiny blip when the page first gets a user gesture (web autoplay unlock). */
    playUiPreviewSting() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(990, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.055 * Math.max(0, sfxVolume), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.09);
      } catch {
        /* ignore */
      }
    },

    setMusicCrossfadeDuration(sec) {
      musicCrossfadeSec = Math.max(0.01, sec);
      music.setCrossfadeDuration(musicCrossfadeSec);
    },
    getMusicCrossfadeDuration() {
      return music.getCrossfadeDuration();
    },

    /**
     * Switch gameplay bed URL (e.g. Dev HUD variant). Does not change output until {@link playMusicProfile}("gameplay").
     * @param {string} url
     */
    setMusicLobbyUrl(url) {
      musicLobbyUrl = typeof url === "string" && url.length > 0 ? url : "";
    },
    getMusicLobbyUrl() {
      return musicLobbyUrl;
    },
    setMusicGameplayUrl(url) {
      musicGameplayUrl = typeof url === "string" && url.length > 0 ? url : "";
    },
    getMusicGameplayUrl() {
      return musicGameplayUrl;
    },

    /**
     * Loop music from URL. First successful play uses instant start; later calls crossfade.
     * @param {string} url
     */
    async playMusicLoop(url) {
      const buf = await loadBuffer(url);
      if (!buf) return false;
      return playMusicLoopBuffer(buf);
    },

    /**
     * P8.2 — Lobby / garage / editor ambience vs driving combat loop.
     * Tries `musicLobbyUrl` / `musicGameplayUrl` (MP3 from ElevenLabs pipeline); falls back to procedural beds.
     * @param {'lobby' | 'gameplay'} profile
     */
    async playMusicProfile(profile) {
      const preferUrl = profile === "gameplay" ? musicGameplayUrl : musicLobbyUrl;
      if (preferUrl) {
        const decoded = await loadBuffer(preferUrl);
        if (decoded) return playMusicLoopBuffer(decoded);
      }
      const b = ensureProceduralMusicBuffers();
      const buf = profile === "gameplay" ? b.gameplay : b.lobby;
      return playMusicLoopBuffer(buf);
    },

    stopMusic() {
      music.stopAll();
      musicStarted = false;
    },

    /**
     * P8.3 — Grid hum + harmonic + sub drone + filtered noise crackle on `ambientIn` bus.
     */
    startAmbientBed() {
      if (ambientBedNodes.length > 0) return;
      const t0 = ctx.currentTime;

      /**
       * @param {string} type
       * @param {number} freq
       * @param {number} gainVal
       */
      function addOsc(type, freq, gainVal) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gainVal;
        osc.connect(g);
        g.connect(ambientIn);
        osc.start(t0);
        ambientBedNodes.push({
          stop() {
            try {
              osc.stop();
            } catch {
              /* ignore */
            }
          },
        });
      }

      addOsc("sine", 58, 0.022);
      addOsc("sine", 117, 0.008);
      addOsc("triangle", 36, 0.014);

      const nFrames = Math.max(256, Math.floor(ctx.sampleRate * 0.31));
      const nBuf = ctx.createBuffer(1, nFrames, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nFrames; i++) {
        nd[i] = (Math.random() * 2 - 1) * 0.55;
      }
      const ns = ctx.createBufferSource();
      ns.buffer = nBuf;
      ns.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 0.55;
      const ng = ctx.createGain();
      ng.gain.value = 0.014;
      ns.connect(bp);
      bp.connect(ng);
      ng.connect(ambientIn);
      ns.start(t0);
      ambientBedNodes.push({
        stop() {
          try {
            ns.stop();
          } catch {
            /* ignore */
          }
        },
      });
    },

    stopAmbientBed() {
      for (const n of ambientBedNodes) {
        n.stop();
      }
      ambientBedNodes.length = 0;
    },

    /**
     * @param {string} url
     */
    async playSfx(url) {
      const buf = await loadBuffer(url);
      if (!buf) return false;
      sfxPool.play(buf);
      return true;
    },

    /**
     * @param {string} url
     */
    prefetch(url) {
      return loadBuffer(url);
    },

    loadBuffer,

    /**
     * Short buzz when nitro is pressed empty — procedural (no asset file).
     */
    playNitroEmptyBuzz() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(200, t0);
      osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11 * sfxVolume, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.13);
      } catch {
        /* ignore */
      }
    },

    /**
     * Player death derez — see `playDerezShatterCore` (multi-layer, music duck, loud vs bed).
     */
    playDerezShatter() {
      playDerezShatterCore("player");
    },

    /**
     * Opponent derez (kill-cam) — same core, slightly brighter + shorter.
     * @param {{ sting?: boolean }} [opts] — set `sting: false` to skip extra low slam (Dev HUD).
     */
    playEnemyDerezShatter(opts) {
      const st = opts && typeof opts === "object" && opts.sting === false ? false : true;
      if (st) playOpponentSlamLayer();
      playDerezShatterCore("opponent");
    },

    /** Instant power-up (green) — quick ascending chime (plan P3.1). */
    playPowerupPickupInstant() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, t0);
      osc.frequency.exponentialRampToValueAtTime(1980, t0 + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.1 * sfxVolume, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.12);
      } catch {
        /* ignore */
      }
    },

    /** Level-permanent power-up (blue) — deep resonant chord (plan P3.1). */
    playPowerupPickupLevelPermanent() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const freqs = [130.8, 196.0, 293.7];
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.045 * sfxVolume, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
        osc.connect(g);
        g.connect(sfxGain);
        try {
          osc.start(t0);
          osc.stop(t0 + 0.42);
        } catch {
          /* ignore */
        }
      }
    },

    /** Equippable power-up (purple) — staccato ping (plan P3.1). */
    playPowerupPickupEquippable() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1760, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.09 * sfxVolume, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.07);
      } catch {
        /* ignore */
      }
    },

    /** Boost pad opener — follows active nitro preset family. */
    playBoostPadWhoosh() {
      dispatchBoostPadWhoosh();
    },

    /** Shield deploy completes — rising energy tone (plan P3.4; procedural). */
    playShieldDeployRise() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(660, t0 + 0.12);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.09 * sfxVolume, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.18);
      } catch {
        /* ignore */
      }
    },

    /** Shield absorbs trail — clang + glassy noise (plan P3.4; procedural). */
    playShieldShatterClang() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, t0);
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11 * sfxVolume, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(g);
      g.connect(sfxGain);
      const n = 2048;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 1800;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.06 * sfxVolume, t0 + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.22);
        noise.start(t0);
        noise.stop(t0 + 0.14);
      } catch {
        /* ignore */
      }
    },

    /** Shield timer expired unused — soft fade hum (plan P3.4; procedural). */
    playShieldExpireFade() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(380, t0);
      osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.35);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05 * sfxVolume, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.45);
      } catch {
        /* ignore */
      }
    },

    /** Portal warp — bending whoosh (plan P3.6; procedural). */
    playPortalWarp() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(720, t0);
      osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12 * sfxVolume, t0 + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.24);
      } catch {
        /* ignore */
      }
    },

    /** Near-miss tension zip — procedural (plan P2.5; audio-only feedback). */
    playNearMissWhoosh() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const v = Math.max(0, sfxVolume);
      /** ~line up with a strong single SFX layer (e.g. derez core); was 0.075 and masked by music. */
      const peak = 0.28 * v;
      const noiseDur = 0.13;
      const n = 2048;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(2400, t0);
      bp.frequency.exponentialRampToValueAtTime(380, t0 + noiseDur);
      bp.Q.value = 2.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + noiseDur);
      noise.connect(bp);
      bp.connect(g);
      g.connect(sfxGain);
      try {
        noise.start(t0);
        noise.stop(t0 + noiseDur + 0.03);
      } catch {
        /* ignore */
      }
    },

    /** Triumphant chord when all combat enemies are cleared — plan P2.6 (procedural). */
    playLevelCompleteChord() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const freqs = [261.6, 329.6, 392.0, 523.2];
      let i = 0;
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f, t0);
        const delay = i * 0.045;
        g.gain.setValueAtTime(0.0001, t0 + delay);
        g.gain.exponentialRampToValueAtTime(0.055 * sfxVolume, t0 + delay + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.55);
        osc.connect(g);
        g.connect(sfxGain);
        try {
          osc.start(t0 + delay);
          osc.stop(t0 + delay + 0.65);
        } catch {
          /* ignore */
        }
        i += 1;
      }
    },

    /** Tinkling digital coins when NEON is banked on exit gate — plan P2.6 (procedural). */
    playCoinRewardTinkle() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      for (let k = 0; k < 6; k++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        const f = 1800 + k * 140 + (k % 2) * 80;
        osc.frequency.setValueAtTime(f, t0);
        const delay = k * 0.055;
        g.gain.setValueAtTime(0.0001, t0 + delay);
        g.gain.exponentialRampToValueAtTime(0.06 * sfxVolume, t0 + delay + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.07);
        osc.connect(g);
        g.connect(sfxGain);
        try {
          osc.start(t0 + delay);
          osc.stop(t0 + delay + 0.09);
        } catch {
          /* ignore */
        }
      }
    },

    /** Nitro burst opener — follows active nitro preset family. */
    playNitroBurstWhoosh() {
      dispatchNitroBurstWhoosh();
    },

    /**
     * P8.5 — Arena / barrier slide impact: metallic thud + scrape (procedural).
     * @param {number} [intensity] 0–1 from speed loss / impact
     */
    playWallHitThud(intensity = 0.5) {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const a = Math.max(0.15, Math.min(1, intensity)) * sfxVolume;
      const nFrames = 2048;
      const buf = ctx.createBuffer(1, nFrames, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < nFrames; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / nFrames);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(420, t0);
      bp.frequency.exponentialRampToValueAtTime(90, t0 + 0.12);
      bp.Q.value = 1.1;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.14 * a, t0 + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(sfxGain);

      const scrape = ctx.createOscillator();
      const sg = ctx.createGain();
      scrape.type = "sawtooth";
      scrape.frequency.setValueAtTime(210, t0);
      scrape.frequency.linearRampToValueAtTime(95, t0 + 0.09);
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.exponentialRampToValueAtTime(0.05 * a, t0 + 0.006);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      scrape.connect(sg);
      sg.connect(sfxGain);

      try {
        noise.start(t0);
        noise.stop(t0 + 0.15);
        scrape.start(t0);
        scrape.stop(t0 + 0.12);
      } catch {
        /* ignore */
      }
    },

    /** P8.5 — New trail segment — soft crystalline tink (procedural). */
    playTrailSegmentTink() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const amp = 0.055 * sfxVolume;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(3520, t0);
      osc.frequency.exponentialRampToValueAtTime(5280, t0 + 0.012);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(amp, t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.05);
      } catch {
        /* ignore */
      }
    },

    /** P8.5 — Riding through an open gate — deep resonant hum (procedural). */
    playGateEnterHum() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const amp = sfxVolume;
      const freqs = [98, 147, 196];
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(f * 0.92, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.042 * amp, t0 + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        osc.connect(g);
        g.connect(sfxGain);
        try {
          osc.start(t0);
          osc.stop(t0 + 0.58);
        } catch {
          /* ignore */
        }
      }
    },

    /** P8.5 — Tunnel transition — rushing wind + grid shimmer (procedural). */
    playTunnelTransitionWind() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const dur = 0.85;
      const amp = sfxVolume;
      const nFrames = Math.max(256, Math.floor(ctx.sampleRate * 0.2));
      const buf = ctx.createBuffer(1, nFrames, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < nFrames; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.9;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(700, t0);
      lp.frequency.exponentialRampToValueAtTime(5200, t0 + dur);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.1 * amp, t0 + 0.06);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      noise.connect(lp);
      lp.connect(ng);
      ng.connect(sfxGain);

      const grid = ctx.createOscillator();
      const gg = ctx.createGain();
      grid.type = "triangle";
      grid.frequency.setValueAtTime(880, t0);
      grid.frequency.exponentialRampToValueAtTime(2640, t0 + dur * 0.6);
      gg.gain.setValueAtTime(0.0001, t0);
      gg.gain.exponentialRampToValueAtTime(0.035 * amp, t0 + 0.04);
      gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      grid.connect(gg);
      gg.connect(sfxGain);

      try {
        noise.start(t0);
        noise.stop(t0 + dur + 0.05);
        grid.start(t0);
        grid.stop(t0 + dur + 0.05);
      } catch {
        /* ignore */
      }
    },

    tickEngineSound,
    tickNitroExhaustHiss,
    silenceDrivingLayers,
  };
}

/** Fallback when AudioContext is missing (very old browsers). */
function createNoopEngine() {
  return {
    context: null,
    autoplay: false,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    ambientGain: null,
    ambientIn: null,
    needsUserGesture: () => false,
    attachUserGestureUnlock: () => {},
    unlock: () => {},
    setVolumes: () => {},
    applyDynamicMix: () => {},
    syncDevAudioPresets: () => {},
    playUiPreviewSting: () => {},
    setMusicCrossfadeDuration: () => {},
    getMusicCrossfadeDuration: () => 1,
    setMusicLobbyUrl: () => {},
    getMusicLobbyUrl: () => "",
    setMusicGameplayUrl: () => {},
    getMusicGameplayUrl: () => "",
    playMusicLoop: async () => false,
    playMusicProfile: async () => false,
    stopMusic: () => {},
    startAmbientBed: () => {},
    stopAmbientBed: () => {},
    playSfx: async () => false,
    prefetch: async () => null,
    loadBuffer: async () => null,
    playNitroEmptyBuzz: () => {},
    playDerezShatter: () => {},
    playEnemyDerezShatter: () => {},
    playPowerupPickupInstant: () => {},
    playPowerupPickupLevelPermanent: () => {},
    playPowerupPickupEquippable: () => {},
    playNearMissWhoosh: () => {},
    playBoostPadWhoosh: () => {},
    playShieldDeployRise: () => {},
    playShieldShatterClang: () => {},
    playShieldExpireFade: () => {},
    playPortalWarp: () => {},
    playLevelCompleteChord: () => {},
    playCoinRewardTinkle: () => {},
    playNitroBurstWhoosh: () => {},
    playWallHitThud: () => {},
    playTrailSegmentTink: () => {},
    playGateEnterHum: () => {},
    playTunnelTransitionWind: () => {},
    tickEngineSound: () => {},
    tickNitroExhaustHiss: () => {},
    silenceDrivingLayers: () => {},
  };
}
