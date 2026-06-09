// Tiny piano-ish synth on Web Audio — no samples, everything generated.

let ctx = null;
let master = null;
const active = new Map(); // midi -> voice

export function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

const freqOf = (m) => 440 * Math.pow(2, (m - 69) / 12);

function makeVoice(midi, velocity) {
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200 + freqOf(midi) * 3;
  filter.Q.value = 0.4;

  const o1 = ctx.createOscillator();
  o1.type = "triangle";
  o1.frequency.value = freqOf(midi);
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freqOf(midi) * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;

  o1.connect(filter);
  o2.connect(g2);
  g2.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  const peak = 0.45 * velocity;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  // pluck down toward a quiet sustain, like a struck string
  gain.gain.exponentialRampToValueAtTime(peak * 0.3, t + 0.6);
  gain.gain.exponentialRampToValueAtTime(peak * 0.12, t + 2.5);

  o1.start(t);
  o2.start(t);
  return { o1, o2, gain };
}

function release(voice, when = 0) {
  const t = Math.max(ctx.currentTime, when);
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setTargetAtTime(0.0001, t, 0.07);
  voice.o1.stop(t + 0.5);
  voice.o2.stop(t + 0.5);
}

export function noteOn(midi, velocity = 1) {
  ensureAudio();
  noteOff(midi);
  active.set(midi, makeVoice(midi, velocity));
}

export function noteOff(midi) {
  const voice = active.get(midi);
  if (voice) {
    release(voice);
    active.delete(midi);
  }
}

// Fire-and-forget note for play mode (held for durSec, not tracked in `active`).
export function playNote(midi, durSec, velocity = 1) {
  ensureAudio();
  const voice = makeVoice(midi, velocity);
  release(voice, ctx.currentTime + Math.max(0.08, durSec));
}

export function allNotesOff() {
  for (const midi of [...active.keys()]) noteOff(midi);
}
