import { isBlack } from "./keyboard.js";

export const WINDOWS = { perfect: 0.09, good: 0.19, ok: 0.35 };

export function judgeTiming(err) {
  const e = Math.abs(err);
  if (e <= WINDOWS.perfect) return "perfect";
  if (e <= WINDOWS.good) return "good";
  if (e <= WINDOWS.ok) return "ok";
  return null;
}

const TIMING_POINTS = { perfect: 100, good: 75, ok: 40 };

// results: per scheduled note {m, start, dur, hit, err, judgement, holdRatio, gap}
// wrongPresses: count of keydowns that matched nothing
export function gradePerformance(results, wrongPresses) {
  const total = results.length;
  const counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
  let scoreSum = 0;
  let bestStreak = 0, streak = 0;

  for (const r of results) {
    if (!r.hit) {
      counts.miss++;
      streak = 0;
      continue;
    }
    counts[r.judgement]++;
    scoreSum += TIMING_POINTS[r.judgement] * 0.7 + Math.min(r.holdRatio, 1) * 100 * 0.3;
    streak++;
    bestStreak = Math.max(bestStreak, streak);
  }

  const wrongPenalty = Math.min(12, wrongPresses * 1.5);
  const score = Math.max(0, Math.round(scoreSum / Math.max(total, 1) - wrongPenalty));
  const letter =
    score >= 97 ? "S" : score >= 90 ? "A" : score >= 80 ? "B" :
    score >= 70 ? "C" : score >= 55 ? "D" : "F";

  const { strengths, improvements } = buildTips(results, wrongPresses, counts, bestStreak);
  return { score, letter, counts, total, wrongPresses, bestStreak, strengths, improvements };
}

function buildTips(results, wrongPresses, counts, bestStreak) {
  const strengths = [];
  const improvements = [];
  const total = results.length;
  const hits = results.filter((r) => r.hit);
  const missRate = counts.miss / Math.max(total, 1);

  // --- timing bias and consistency
  if (hits.length >= 4) {
    const errs = hits.map((r) => r.err);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const absMean = errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length;
    const sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length);

    if (mean > 0.07) {
      improvements.push("You consistently press a touch late. Watch the bottom edge of the bar — strike the moment it touches the line, not after it lands.");
    } else if (mean < -0.07) {
      improvements.push("You tend to jump in early. Let the bar actually reach the line before you press — patience pays.");
    } else if (absMean <= 0.08 && hits.length / total > 0.6) {
      strengths.push("Your timing is sharp — most presses landed right on the line.");
    }
    if (sd > 0.13) {
      improvements.push("Your timing swings between early and late. Try counting along with the tempo (or pick a slower speed) to lock into a steady pulse.");
    } else if (sd <= 0.07 && hits.length >= 8) {
      strengths.push("Very consistent rhythm — your timing barely drifted across the song.");
    }
  }

  // --- hold durations
  if (hits.length >= 4) {
    const avgHold = hits.reduce((a, r) => a + Math.min(r.holdRatio, 1), 0) / hits.length;
    const shortRate = hits.filter((r) => r.holdRatio < 0.6).length / hits.length;
    if (shortRate > 0.35) {
      improvements.push("You release keys too early. Hold each key for the full length of its bar — long notes are part of the music too.");
    } else if (avgHold > 0.85) {
      strengths.push("Great note lengths — you held keys for their full duration.");
    }
  }

  // --- black vs white keys
  const blackNotes = results.filter((r) => isBlack(r.m));
  const whiteNotes = results.filter((r) => !isBlack(r.m));
  if (blackNotes.length >= 4 && whiteNotes.length >= 4) {
    const bMiss = blackNotes.filter((r) => !r.hit).length / blackNotes.length;
    const wMiss = whiteNotes.filter((r) => !r.hit).length / whiteNotes.length;
    if (bMiss > wMiss + 0.2) {
      improvements.push("The black keys (QWERTY row: W E T Y U O P) trip you up more than the white ones. Drill reaching up to that row without looking down.");
    } else if (bMiss <= wMiss && bMiss < 0.15) {
      strengths.push("You handle the black-key row as comfortably as the home row.");
    }
  }

  // --- left vs right side of the keyboard
  const low = results.filter((r) => r.m < 69);
  const high = results.filter((r) => r.m >= 69);
  if (low.length >= 4 && high.length >= 4) {
    const lMiss = low.filter((r) => !r.hit).length / low.length;
    const hMiss = high.filter((r) => !r.hit).length / high.length;
    if (lMiss > hMiss + 0.25) {
      improvements.push("Most misses were on the left half of the keyboard (A–H). Keep your left hand anchored over A S D F so it's ready.");
    } else if (hMiss > lMiss + 0.25) {
      improvements.push("Most misses were on the right half (J–'). Park your right hand over J K L ; so the high notes don't catch you off guard.");
    }
  }

  // --- fast passages
  const fast = results.filter((r) => r.gap < 0.28);
  if (fast.length >= 5) {
    const fMiss = fast.filter((r) => !r.hit).length / fast.length;
    if (fMiss > 0.4) {
      improvements.push("Fast runs are where notes slipped by. Try the 0.75x or 0.5x speed until the pattern is in your fingers, then bring it back up.");
    } else if (fMiss < 0.15) {
      strengths.push("You kept up with the fast runs — quick passages didn't shake you.");
    }
  }

  // --- wrong notes
  if (wrongPresses > total * 0.2) {
    improvements.push("Quite a few stray presses landed on keys with no note. Accuracy beats coverage — only press when a bar is arriving.");
  } else if (wrongPresses === 0 && hits.length > 0) {
    strengths.push("Zero stray notes — every press you made was meant to be there.");
  }

  // --- streak / overall
  if (bestStreak >= Math.max(10, total * 0.4)) {
    strengths.push(`Best streak: ${bestStreak} notes in a row without a miss.`);
  }
  if (missRate > 0.5) {
    improvements.push("More than half the notes went unplayed. Start in Play mode to learn how the song sounds, then practice at 0.5x speed.");
  }

  if (improvements.length === 0) {
    improvements.push("Honestly? Not much. Try a harder song or a faster speed.");
  }
  if (strengths.length === 0) {
    strengths.push("You finished the song — that's the first rep. It only goes up from here.");
  }
  return { strengths: strengths.slice(0, 4), improvements: improvements.slice(0, 4) };
}
