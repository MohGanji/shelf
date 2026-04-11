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
  return thresholds.length;
}

/**
 * @param {AudioEngineOptions} options
 */
export function createAudioEngine(options = {}) {
  const masterVolume = options.masterVolume ?? 1;
  const musicVolume = options.musicVolume ?? 0.7;
  const sfxVolume = options.sfxVolume ?? 1;
  const ambientVolume = options.ambientVolume ?? 0.5;
  let musicCrossfadeSec = options.musicCrossfadeSec ?? 1;
  const sfxPoolSize = options.sfxPoolSize ?? 16;
  const autoplay = options.autoplay ?? true;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    return createNoopEngine();
  }

  const ctx = new Ctx();
  const masterGain = ctx.createGain();
  masterGain.gain.value = masterVolume;
  masterGain.connect(ctx.destination);

  const musicGain = ctx.createGain();
  musicGain.gain.value = musicVolume;
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
    const once = async () => {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
      if (ctx.state === "running") {
        window.removeEventListener("pointerdown", once);
        window.removeEventListener("keydown", once);
      }
    };
    window.addEventListener("pointerdown", once, { passive: true });
    window.addEventListener("keydown", once);
  }

  async function unlock() {
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch {
      /* ignore */
    }
    if (ctx.state !== "running") {
      attachUserGestureUnlock();
    }
  }

  /** P8.4 — Engine layer state (idle hum + moving whine + gear chunks). */
  let engineGearBand = -1;
  /** @type {{ mix: GainNode; idle: OscillatorNode; main: OscillatorNode; idleG: GainNode; mainG: GainNode } | null} */
  let engineNodes = null;
  let engineLfoPhase = 0;

  function ensureEngineGraph() {
    if (engineNodes || !ctx) return engineNodes;
    const mix = ctx.createGain();
    mix.gain.value = 0;
    mix.connect(sfxGain);
    const idle = ctx.createOscillator();
    idle.type = "sine";
    idle.frequency.value = 62;
    const idleG = ctx.createGain();
    idleG.gain.value = 0;
    idle.connect(idleG);
    idleG.connect(mix);
    const main = ctx.createOscillator();
    main.type = "triangle";
    main.frequency.value = 110;
    const mainG = ctx.createGain();
    mainG.gain.value = 0;
    main.connect(mainG);
    mainG.connect(mix);
    const t = ctx.currentTime;
    try {
      idle.start(t);
      main.start(t);
    } catch {
      return null;
    }
    engineNodes = { mix, idle, main, idleG, mainG };
    return engineNodes;
  }

  function playEngineGearChunk() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const amp = Math.max(0, sfxGain.gain.value) * 0.12;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(240, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.055);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
    o.connect(g);
    g.connect(sfxGain);
    try {
      o.start(t0);
      o.stop(t0 + 0.1);
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
    } = opts;
    const gGraph = ensureEngineGraph();
    if (!gGraph) return;
    const t = ctx.currentTime;
    if (!active) {
      engineGearBand = -1;
      engineLfoPhase = 0;
      gGraph.mix.gain.setTargetAtTime(0, t, 0.035);
      return;
    }

    const pitch = typeof enginePitch === "number" && enginePitch > 0 ? enginePitch : 1;
    const denom = Math.max(0.001, speedRatioDenominator);
    const ratio = Math.max(0, Math.min(1, Math.abs(speed) / denom));
    const th = getGearThresholds(
      typeof gearShiftCount === "number" && Number.isFinite(gearShiftCount) ? gearShiftCount : 5,
    );
    const band = gearBandIndex(ratio, th);
    if (engineGearBand >= 0 && band > engineGearBand) {
      playEngineGearChunk();
    }
    engineGearBand = band;

    engineLfoPhase += dt * 5.2;
    const idleFlutter = 0.86 + 0.14 * Math.sin(engineLfoPhase);
    const spd = Math.abs(speed);
    const nearIdle = spd < 2.2;
    const idleVol = (nearIdle ? 0.038 : 0.012) * idleFlutter;
    const moveCore = Math.pow(ratio, 0.88) * 0.092;
    const topWhine = ratio > 0.88 ? 0.045 * ((ratio - 0.88) / 0.12) : 0;
    const mainVol = Math.min(0.14, moveCore + topWhine);

    const fMain = (86 + Math.pow(ratio, 1.16) * 410 * pitch) * (ratio > 0.9 ? 1.05 : 1);
    const fIdle = 55 + 8 * pitch;

    gGraph.idle.frequency.setTargetAtTime(fIdle, t, 0.025);
    gGraph.main.frequency.setTargetAtTime(fMain, t, 0.03);
    gGraph.idleG.gain.setTargetAtTime(idleVol, t, 0.045);
    gGraph.mainG.gain.setTargetAtTime(mainVol, t, 0.038);
    gGraph.mix.gain.setTargetAtTime(1, t, 0.04);
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
      if (v.master != null) masterGain.gain.value = v.master;
      if (v.music != null) musicGain.gain.value = v.music;
      if (v.sfx != null) sfxGain.gain.value = v.sfx;
      if (v.ambient != null) ambientGain.gain.value = v.ambient;
    },

    setMusicCrossfadeDuration(sec) {
      musicCrossfadeSec = Math.max(0.01, sec);
      music.setCrossfadeDuration(musicCrossfadeSec);
    },
    getMusicCrossfadeDuration() {
      return music.getCrossfadeDuration();
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
     * P8.2 — Lobby / garage / editor ambience vs driving combat loop. Uses procedural buffers unless
     * optional URLs are supplied later (same profile names).
     * @param {'lobby' | 'gameplay'} profile
     */
    async playMusicProfile(profile) {
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

    /** Digital shatter — filtered noise + glassy tones (plan P2.4; no asset file). */
    playDerezShatter() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const dur = 0.55;
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
      bp.frequency.setValueAtTime(2400, t0);
      bp.frequency.exponentialRampToValueAtTime(400, t0 + dur);
      bp.Q.value = 0.85;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.22 * sfxVolume, t0 + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      noise.connect(bp);
      bp.connect(ng);
      ng.connect(sfxGain);

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.35);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.06 * sfxVolume, t0 + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(og);
      og.connect(sfxGain);

      try {
        noise.start(t0);
        noise.stop(t0 + dur + 0.05);
        osc.start(t0);
        osc.stop(t0 + 0.42);
      } catch {
        /* ignore */
      }
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

    /** Boost pad — lighter whoosh than nitro (plan P3.5; procedural). */
    playBoostPadWhoosh() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, t0);
      osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.06);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.07 * sfxVolume, t0 + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.14);
      } catch {
        /* ignore */
      }
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
      osc.frequency.setValueAtTime(880, t0);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.085 * sfxVolume, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(g);
      g.connect(sfxGain);
      try {
        osc.start(t0);
        osc.stop(t0 + 0.16);
      } catch {
        /* ignore */
      }
    },

    /** Near-miss tension zip — procedural (plan P2.5; audio-only feedback). */
    playNearMissWhoosh() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
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
      g.gain.exponentialRampToValueAtTime(0.075 * sfxVolume, t0 + 0.01);
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

    /** P8.5 — Nitro burst: whoosh + bass pulse (procedural). */
    playNitroBurstWhoosh() {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const amp = sfxVolume;
      const sweep = ctx.createOscillator();
      const sg = ctx.createGain();
      sweep.type = "sine";
      sweep.frequency.setValueAtTime(180, t0);
      sweep.frequency.exponentialRampToValueAtTime(2200, t0 + 0.14);
      sg.gain.setValueAtTime(0.0001, t0);
      sg.gain.exponentialRampToValueAtTime(0.1 * amp, t0 + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      sweep.connect(sg);
      sg.connect(sfxGain);

      const bass = ctx.createOscillator();
      const bg = ctx.createGain();
      bass.type = "sine";
      bass.frequency.setValueAtTime(62, t0);
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(0.09 * amp, t0 + 0.035);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      bass.connect(bg);
      bg.connect(sfxGain);

      try {
        sweep.start(t0);
        sweep.stop(t0 + 0.22);
        bass.start(t0);
        bass.stop(t0 + 0.24);
      } catch {
        /* ignore */
      }
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
    unlock: async () => {},
    setVolumes: () => {},
    setMusicCrossfadeDuration: () => {},
    getMusicCrossfadeDuration: () => 1,
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
  };
}
