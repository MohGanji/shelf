#!/usr/bin/env node
/**
 * P8.2 — Generate two loopable MP3 beds via ElevenLabs Sound Generation API and write to assets/audio/.
 * Requires: Node 18+, env ELEVENLABS_API_KEY (see plan § API Keys).
 *
 * Usage (from repo root or this directory):
 *   ELEVENLABS_API_KEY=... node vibe/tron/scripts/elevenlabs-music.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../assets/audio");
const API = "https://api.elevenlabs.io/v1/sound-generation";

const key = process.env.ELEVENLABS_API_KEY;
if (!key || typeof key !== "string") {
  console.error("Missing ELEVENLABS_API_KEY. Export it and re-run.");
  process.exit(1);
}

/** @type {{ file: string; text: string; duration_seconds: number; loop: boolean }[]} */
const TRACKS = [
  {
    file: "music-lobby.mp3",
    text:
      "Seamless looping dark ambient electronic soundscape for a Tron sci-fi game lobby and menu. " +
      "Slow atmospheric synth pads, subtle digital shimmer, sparse grid-like tones, no percussion, " +
      "instrumental only, Daft Punk inspired minimalism.",
    duration_seconds: 24,
    loop: true,
  },
  {
    file: "music-gameplay.mp3",
    text:
      "Seamless looping high-energy driving electronic combat music for a light cycle arcade game. " +
      "Heavy pulsing synth bass around 128 BPM, urgent sequenced leads, Tron Legacy style energy, " +
      "no vocals, instrumental only.",
    duration_seconds: 28,
    loop: true,
  },
];

/**
 * @param {typeof TRACKS[0]} track
 */
async function generateOne(track) {
  const url = new URL(API);
  url.searchParams.set("output_format", "mp3_44100_128");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
    },
    body: JSON.stringify({
      text: track.text,
      duration_seconds: track.duration_seconds,
      loop: track.loop,
      prompt_influence: 0.42,
      model_id: "eleven_text_to_sound_v2",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${errText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = join(OUT_DIR, track.file);
  await writeFile(outPath, buf);
  console.log(`Wrote ${outPath} (${buf.length} bytes)`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const t of TRACKS) {
  await generateOne(t);
}
console.log("Done. Game loads these via MUSIC_ASSET_URLS in js/config.js (procedural fallback if absent).");
