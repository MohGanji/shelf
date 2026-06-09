# Keyfall

Synthesia-style piano visualizer that lives on your laptop keyboard. Pure
HTML/CSS/JS, no dependencies, no build step — all sound is synthesized with
the Web Audio API, no samples.

## Playing

- White keys: home row `A S D F G H J K L ; '` (C4–F5)
- Black keys: the row above, `W E T Y U O P`
- On-screen keys are also clickable/tappable.

Two modes per song:

- **Play** — the song performs itself with falling notes, like the Synthesia
  videos this is modeled on.
- **Practice** — notes fall silently; you press the mapped key when a bar
  reaches the line and hold it for the bar's length. At the end you get a
  letter grade (S–F), hit counts, and generated tips: what worked and what to
  drill, based on timing bias, hold lengths, black-key accuracy, keyboard
  region, fast passages, and stray presses.

## Song library & copyright

All classical pieces are hand-arranged excerpts of **public-domain
compositions** (Beethoven, Mozart, Bach-era traditionals, Pachelbel, Satie,
Rimsky-Korsakov — every composer died well over 70 years ago), transposed
where needed to fit the 18-key playable range. No copyrighted sheet music or
MIDI files were copied.

Film scores (Hans Zimmer etc.) are still under copyright, so instead the
library includes **original pieces written for this project** in that
cinematic style: "Time Dilation" (Zimmer-ish build), "Cornfield Drift"
(Interstellar-ish organ ostinato), plus originals "First Snow" and
"Neon Cascade".

## The experiment

Vibe-coded in one session with Claude Code (Fable 5): melodies transcribed/
composed by the model directly as note data in `js/songs.js`, then verified
by driving a real browser with screenshots and synthetic key events.
