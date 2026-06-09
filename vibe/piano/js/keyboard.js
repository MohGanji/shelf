// Playable range C4–F5. White keys live on the home row, black keys on the
// QWERTY row above them, mirroring the physical piano layout.

export const KEYS = [
  { m: 60, code: "KeyA", label: "A" },
  { m: 61, code: "KeyW", label: "W" },
  { m: 62, code: "KeyS", label: "S" },
  { m: 63, code: "KeyE", label: "E" },
  { m: 64, code: "KeyD", label: "D" },
  { m: 65, code: "KeyF", label: "F" },
  { m: 66, code: "KeyT", label: "T" },
  { m: 67, code: "KeyG", label: "G" },
  { m: 68, code: "KeyY", label: "Y" },
  { m: 69, code: "KeyH", label: "H" },
  { m: 70, code: "KeyU", label: "U" },
  { m: 71, code: "KeyJ", label: "J" },
  { m: 72, code: "KeyK", label: "K" },
  { m: 73, code: "KeyO", label: "O" },
  { m: 74, code: "KeyL", label: "L" },
  { m: 75, code: "KeyP", label: "P" },
  { m: 76, code: "Semicolon", label: ";" },
  { m: 77, code: "Quote", label: "'" },
];

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (m) => BLACK.has(m % 12);

export const WHITE_KEYS = KEYS.filter((k) => !isBlack(k.m));
export const BLACK_KEYS = KEYS.filter((k) => isBlack(k.m));

export const CODE_TO_MIDI = new Map(KEYS.map((k) => [k.code, k.m]));
export const MIDI_TO_LABEL = new Map(KEYS.map((k) => [k.m, k.label]));

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
