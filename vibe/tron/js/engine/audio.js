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
      if (!musicStarted) {
        music.startFirst(buf);
        musicStarted = true;
        return true;
      }
      music.crossfadeTo(buf, music.getCrossfadeDuration());
      return true;
    },

    stopMusic() {
      music.stopAll();
      musicStarted = false;
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
    stopMusic: () => {},
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
  };
}
