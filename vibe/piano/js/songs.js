// Song library.
// All classical pieces are hand-arranged excerpts of public-domain compositions
// (every composer here died well over 70 years ago). The "cinematic" tracks are
// original compositions written for this project in a Zimmer-ish style, because
// actual film scores are still under copyright.
//
// Format: each step is [midi, durationBeats] — midi may be an array (chord)
// or null (rest). Time advances by durationBeats after each step.

function mel(steps) {
  let t = 0;
  const notes = [];
  for (const [m, d] of steps) {
    if (m != null) {
      for (const midi of Array.isArray(m) ? m : [m]) {
        notes.push({ t, m: midi, d });
      }
    }
    t += d;
  }
  return notes;
}

function rep(steps, times) {
  const out = [];
  for (let i = 0; i < times; i++) out.push(...steps);
  return out;
}

// ---------------------------------------------------------------- easy ----

const twinkle = mel([
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
  [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
  [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 3],
]);

const odeToJoy = mel([
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
  [62, 1], [62, 1], [64, 1], [60, 1], [62, 1], [64, 0.5], [65, 0.5], [64, 1],
  [60, 1], [62, 1], [64, 0.5], [65, 0.5], [64, 1], [62, 1], [60, 1], [62, 1], [67, 2],
  [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
  [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 3],
]);

// Original. Gentle white-key melody in C major.
const firstSnow = mel([
  [64, 1], [67, 1], [72, 2], [71, 1], [67, 1], [69, 2],
  [67, 1], [64, 1], [62, 2], [60, 4],
  [64, 1], [67, 1], [72, 2], [74, 1], [72, 1], [71, 2],
  [69, 1], [71, 1], [67, 2], [64, 1], [62, 1], [64, 4],
  [64, 1], [67, 1], [72, 2], [71, 1], [67, 1], [69, 2],
  [72, 1], [71, 1], [69, 2], [67, 1], [65, 1], [64, 2],
  [62, 1], [64, 1], [60, 5],
]);

// -------------------------------------------------------------- medium ----

const greensleeves = mel([
  [69, 1], [72, 2], [74, 1], [76, 1.5], [77, 0.5], [76, 1],
  [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1],
  [72, 2], [69, 1], [69, 1.5], [68, 0.5], [69, 1],
  [71, 2], [68, 1], [64, 3],
  [69, 1], [72, 2], [74, 1], [76, 1.5], [77, 0.5], [76, 1],
  [74, 2], [71, 1], [67, 1.5], [69, 0.5], [71, 1],
  [72, 1.5], [71, 0.5], [69, 1], [68, 1.5], [66, 0.5], [68, 1],
  [69, 5],
]);

const furEliseA = [
  [76, 1], [75, 1], [76, 1], [75, 1], [76, 1], [71, 1], [74, 1], [72, 1],
  [69, 2], [null, 1], [60, 1], [64, 1], [69, 1], [71, 2], [null, 1],
  [64, 1], [68, 1], [71, 1], [72, 2], [null, 1], [64, 1],
];
const furElise = mel([
  ...furEliseA,
  [76, 1], [75, 1], [76, 1], [75, 1], [76, 1], [71, 1], [74, 1], [72, 1],
  [69, 2], [null, 1], [60, 1], [64, 1], [69, 1], [71, 2], [null, 1],
  [64, 1], [72, 1], [71, 1], [69, 2], [null, 2],
  [71, 2], [72, 2], [74, 2], [76, 4],
  [67, 2], [77, 2], [76, 2], [74, 4],
  [65, 2], [76, 2], [74, 2], [72, 4],
  [64, 2], [74, 2], [72, 2], [71, 4],
  ...furEliseA,
  [76, 1], [75, 1], [76, 1], [75, 1], [76, 1], [71, 1], [74, 1], [72, 1],
  [69, 2], [null, 1], [60, 1], [64, 1], [69, 1], [71, 2], [null, 1],
  [64, 1], [72, 1], [71, 1], [69, 6],
]);

const canonInC = mel([
  // the famous descending theme, in half notes
  [76, 2], [74, 2], [72, 2], [71, 2], [69, 2], [67, 2], [69, 2], [71, 2],
  // quarter-note variation over the same progression
  [76, 1], [72, 1], [74, 1], [71, 1], [72, 1], [69, 1], [71, 1], [67, 1],
  [69, 1], [65, 1], [67, 1], [64, 1], [65, 1], [69, 1], [71, 1], [74, 1],
  // eighth-note runs
  [72, 0.5], [64, 0.5], [67, 0.5], [72, 0.5], [71, 0.5], [62, 0.5], [67, 0.5], [71, 0.5],
  [72, 0.5], [64, 0.5], [69, 0.5], [72, 0.5], [71, 0.5], [64, 0.5], [67, 0.5], [71, 0.5],
  [69, 0.5], [65, 0.5], [60, 0.5], [64, 0.5], [67, 0.5], [64, 0.5], [60, 0.5], [64, 0.5],
  [65, 0.5], [64, 0.5], [65, 0.5], [69, 0.5], [67, 0.5], [69, 0.5], [71, 0.5], [74, 0.5],
  [72, 4],
]);

// Transposed down a major third to fit the playable range (originally in D).
const gymnopedie = mel([
  [74, 1], [77, 1], [75, 1], [74, 1], [69, 1], [67, 1],
  [69, 1], [70, 1], [65, 1], [62, 1], [67, 4], [null, 2],
  [74, 1], [77, 1], [75, 1], [74, 1], [69, 1], [67, 1],
  [69, 1], [70, 1], [65, 1], [67, 1], [69, 4], [null, 2],
  [67, 1], [69, 1], [70, 1], [74, 1], [72, 1], [69, 1], [70, 6],
]);

// First-movement arpeggios, set in C minor to fit the range.
const moonlight = mel([
  ...rep([[67, 1], [72, 1], [75, 1]], 4),
  ...rep([[67, 1], [72, 1], [75, 1]], 4),
  ...rep([[68, 1], [72, 1], [75, 1]], 2), ...rep([[68, 1], [74, 1], [77, 1]], 2),
  ...rep([[67, 1], [71, 1], [74, 1]], 2), ...rep([[67, 1], [74, 1], [77, 1]], 2),
  ...rep([[68, 1], [72, 1], [75, 1]], 2), ...rep([[68, 1], [74, 1], [77, 1]], 2),
  ...rep([[67, 1], [71, 1], [74, 1]], 2), ...rep([[67, 1], [74, 1], [77, 1]], 2),
  ...rep([[64, 1], [67, 1], [72, 1]], 4),
  [[60, 64, 67], 6],
]);

// Original. Hypnotic broken-chord ostinato, Interstellar-organ mood.
const cornfieldBar = (a, b, c) => rep([[a, 1], [b, 1], [c, 1], [b, 1]], 2);
const cornfield = mel([
  ...cornfieldBar(64, 71, 76), ...cornfieldBar(60, 67, 72),
  ...cornfieldBar(62, 69, 74), ...cornfieldBar(64, 71, 76),
  ...cornfieldBar(64, 71, 76), ...cornfieldBar(60, 67, 72),
  ...cornfieldBar(62, 69, 74), ...cornfieldBar(64, 71, 76),
  ...cornfieldBar(65, 72, 77), ...cornfieldBar(64, 71, 76),
  ...cornfieldBar(62, 69, 74), ...cornfieldBar(60, 67, 72),
  [[64, 71, 76], 6],
]);

// Original. Am–F–C–G arpeggios that double in speed each round, Time-style.
const timeDilation = mel([
  [69, 2], [72, 2], [65, 2], [69, 2], [60, 2], [64, 2], [67, 2], [71, 2],
  [69, 1], [72, 1], [76, 1], [72, 1], [65, 1], [69, 1], [72, 1], [69, 1],
  [60, 1], [64, 1], [67, 1], [64, 1], [67, 1], [71, 1], [74, 1], [71, 1],
  ...rep([[69, 0.5], [72, 0.5], [76, 0.5], [72, 0.5]], 2),
  ...rep([[65, 0.5], [69, 0.5], [72, 0.5], [69, 0.5]], 2),
  ...rep([[60, 0.5], [64, 0.5], [67, 0.5], [64, 0.5]], 2),
  ...rep([[67, 0.5], [71, 0.5], [74, 0.5], [71, 0.5]], 2),
  [69, 1], [72, 1], [76, 1], [72, 1], [65, 1], [69, 1], [72, 1], [69, 1],
  [60, 1], [64, 1], [67, 1], [64, 1], [67, 2], [71, 2],
  [69, 6],
]);

// ---------------------------------------------------------------- hard ----

// Octave-displaced where the original climbs out of range.
const turkishHalf = [
  [71, 1], [69, 1], [68, 1], [69, 1], [72, 4],
  [74, 1], [72, 1], [71, 1], [72, 1], [76, 4],
  [66, 1], [64, 1], [63, 1], [64, 1],
  [71, 1], [69, 1], [68, 1], [69, 1], [71, 1], [69, 1], [68, 1], [69, 1],
  [72, 4],
  [69, 1], [72, 1], [71, 1], [69, 1], [68, 1], [69, 1], [71, 1], [68, 1],
  [69, 4],
];
const turkishMarch = mel([...turkishHalf, [null, 2], ...turkishHalf]);

const chromDown = [];
for (let m = 76; m >= 61; m--) chromDown.push([m, 1]);
const chromUp = [];
for (let m = 61; m <= 75; m++) chromUp.push([m, 1]);
const bumblebee = mel([
  ...chromDown, [60, 2],
  [60, 1], [61, 1], [62, 1], [61, 1], [60, 1], [61, 1], [62, 1], [61, 1],
  ...chromUp, [76, 2],
  ...chromDown, [60, 2],
  [60, 1], [62, 1], [63, 1], [62, 1], [60, 1], [62, 1], [63, 1], [62, 1],
  ...chromUp, [76, 4],
]);

// Original. Syncopated C-minor-pentatonic runs.
const neonCascade = mel([
  [60, 1], [63, 1], [65, 1], [67, 1], [70, 1.5], [67, 0.5], [70, 1], [72, 2], [null, 1],
  [72, 1], [70, 1], [67, 1], [65, 1], [63, 1.5], [65, 0.5], [63, 1], [60, 2], [null, 1],
  [60, 0.5], [63, 0.5], [65, 0.5], [67, 0.5], [70, 0.5], [72, 0.5], [75, 0.5], [77, 0.5],
  [75, 1], [72, 1], [70, 1.5], [67, 0.5], [65, 1], [63, 1], [60, 2], [null, 1],
  [67, 0.5], [70, 0.5], [72, 0.5], [70, 0.5], [67, 0.5], [70, 0.5], [72, 0.5], [75, 0.5],
  [72, 0.5], [75, 0.5], [77, 0.5], [75, 0.5], [72, 1], [70, 1], [67, 2], [null, 1],
  [60, 0.5], [63, 0.5], [65, 0.5], [67, 0.5], [70, 0.5], [72, 0.5], [75, 0.5], [77, 0.5],
  [75, 0.5], [77, 0.5], [75, 0.5], [72, 0.5], [70, 0.5], [72, 0.5], [70, 0.5], [67, 0.5],
  [65, 1], [63, 1], [60, 4],
]);

export const SONGS = [
  {
    id: "twinkle", title: "Twinkle Twinkle Little Star", composer: "Traditional",
    origin: "public domain", difficulty: "easy", bpm: 100, notes: twinkle,
  },
  {
    id: "ode-to-joy", title: "Ode to Joy", composer: "Ludwig van Beethoven",
    origin: "public domain", difficulty: "easy", bpm: 108, notes: odeToJoy,
  },
  {
    id: "first-snow", title: "First Snow", composer: "Fable 5 (original)",
    origin: "written for this project", difficulty: "easy", bpm: 80, notes: firstSnow,
  },
  {
    id: "greensleeves", title: "Greensleeves", composer: "Traditional (English)",
    origin: "public domain", difficulty: "medium", bpm: 150, notes: greensleeves,
  },
  {
    id: "fur-elise", title: "Für Elise", composer: "Ludwig van Beethoven",
    origin: "public domain", difficulty: "medium", bpm: 220, notes: furElise,
  },
  {
    id: "canon", title: "Canon (in C)", composer: "Johann Pachelbel",
    origin: "public domain", difficulty: "medium", bpm: 60, notes: canonInC,
  },
  {
    id: "gymnopedie", title: "Gymnopédie No. 1", composer: "Erik Satie",
    origin: "public domain", difficulty: "medium", bpm: 76, notes: gymnopedie,
  },
  {
    id: "moonlight", title: "Moonlight Sonata (excerpt)", composer: "Ludwig van Beethoven",
    origin: "public domain", difficulty: "medium", bpm: 180, notes: moonlight,
  },
  {
    id: "cornfield", title: "Cornfield Drift", composer: "Fable 5 (original)",
    origin: "Interstellar-style organ ostinato, written for this project",
    difficulty: "medium", bpm: 132, notes: cornfield,
  },
  {
    id: "time-dilation", title: "Time Dilation", composer: "Fable 5 (original)",
    origin: "Zimmer-style build, written for this project",
    difficulty: "medium", bpm: 60, notes: timeDilation,
  },
  {
    id: "turkish-march", title: "Turkish March (excerpt)", composer: "W. A. Mozart",
    origin: "public domain", difficulty: "hard", bpm: 200, notes: turkishMarch,
  },
  {
    id: "bumblebee", title: "Flight of the Bumblebee (excerpt)", composer: "N. Rimsky-Korsakov",
    origin: "public domain", difficulty: "hard", bpm: 280, notes: bumblebee,
  },
  {
    id: "neon-cascade", title: "Neon Cascade", composer: "Fable 5 (original)",
    origin: "written for this project", difficulty: "hard", bpm: 140, notes: neonCascade,
  },
];

export function songDurationSec(song) {
  const spb = 60 / song.bpm;
  let end = 0;
  for (const n of song.notes) end = Math.max(end, (n.t + n.d) * spb);
  return end;
}

// Notes in seconds, slowed by 1/speed (speed 0.5 = half tempo).
export function scheduleSong(song, speed = 1) {
  const spb = 60 / song.bpm / speed;
  return song.notes
    .map((n, i) => ({ id: i, m: n.m, start: n.t * spb, dur: n.d * spb }))
    .sort((a, b) => a.start - b.start);
}
