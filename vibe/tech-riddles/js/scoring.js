const SHORT_ANSWER_LIMIT = 3;
const ARTICLE_WORDS = new Set(["a", "an", "the"]);
const GENERIC_PARTIAL_WORDS = new Set([
  "answer",
  "cache",
  "check",
  "consumer",
  "data",
  "field",
  "key",
  "method",
  "model",
  "pattern",
  "policy",
  "producer",
  "query",
  "request",
  "response",
  "score",
  "service",
  "system",
  "table",
  "test",
  "token",
  "type",
  "value",
]);

const SYMBOL_REPLACEMENTS = [
  [/\bc\+\+\b/g, "cpp"],
  [/\bc#\b/g, "c sharp"],
  [/\bci\/cd\b/g, "ci cd"],
  [/\btcp\/ip\b/g, "tcp ip"],
  [/\bo\(n\)\b/g, "linear time"],
  [/\bo\(log n\)\b/g, "logarithmic time"],
  [/\bo\(1\)\b/g, "constant time"],
  [/&/g, " and "],
  [/\+/g, " plus "],
];

export function normalizeAnswer(value) {
  const raw = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const withSymbols = SYMBOL_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    raw,
  );

  return withSymbols
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !ARTICLE_WORDS.has(word))
    .join(" ");
}

export function scoreAnswer(input, acceptedAnswers) {
  const guess = normalizeAnswer(input);
  const accepted = acceptedAnswers.map((answer) => ({
    raw: answer,
    normalized: normalizeAnswer(answer),
  }));

  if (!guess) {
    return { correct: false, mode: "empty", matchedAnswer: null, confidence: 0 };
  }

  const exact = accepted.find(({ normalized }) => normalized === guess);
  if (exact) {
    return { correct: true, mode: "exact", matchedAnswer: exact.raw, confidence: 1 };
  }

  const partial = accepted
    .map((answer) => ({
      ...answer,
      confidence: partialTokenConfidence(guess, answer.normalized),
    }))
    .filter(({ confidence }) => confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (partial) {
    return {
      correct: true,
      mode: "partial",
      matchedAnswer: partial.raw,
      confidence: partial.confidence,
    };
  }

  const fuzzy = accepted
    .map((answer) => ({
      ...answer,
      confidence: fuzzyConfidence(guess, answer.normalized),
    }))
    .filter(({ confidence }) => confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)[0];

  if (fuzzy) {
    return {
      correct: true,
      mode: "fuzzy",
      matchedAnswer: fuzzy.raw,
      confidence: fuzzy.confidence,
    };
  }

  return { correct: false, mode: "miss", matchedAnswer: null, confidence: 0 };
}

function partialTokenConfidence(guess, accepted) {
  const guessWords = guess.split(" ");
  const acceptedWords = accepted.split(" ");

  if (acceptedWords.length < 2 || guessWords.length >= acceptedWords.length) return 0;
  if (guessWords.some((word) => word.length <= SHORT_ANSWER_LIMIT)) return 0;
  if (guessWords.some((word) => GENERIC_PARTIAL_WORDS.has(word))) return 0;
  if (!guessWords.every((word) => acceptedWords.includes(word))) return 0;

  const meaningfulCharacters = guessWords.join("").length;
  if (meaningfulCharacters < 6) return 0;

  return Math.max(0.72, guessWords.length / acceptedWords.length);
}

function fuzzyConfidence(guess, accepted) {
  if (!guess || !accepted) return 0;

  const minLength = Math.min(guess.length, accepted.length);
  const maxLength = Math.max(guess.length, accepted.length);
  if (minLength <= SHORT_ANSWER_LIMIT) return 0;

  const distance = levenshtein(guess, accepted);
  const similarity = 1 - distance / maxLength;
  const guessWords = guess.split(" ");
  const acceptedWords = accepted.split(" ");

  if (guessWords.length === 1 && acceptedWords.length === 1) {
    const maxDistance = maxLength >= 8 ? 2 : 1;
    return distance <= maxDistance && similarity >= 0.8 ? similarity : 0;
  }

  const overlap = tokenOverlap(guessWords, acceptedWords);
  if (distance <= 3 && similarity >= 0.84 && overlap >= 0.5) {
    return Math.min(similarity, overlap);
  }

  return 0;
}

function tokenOverlap(leftWords, rightWords) {
  const left = new Set(leftWords);
  const right = new Set(rightWords);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(left.size, right.size);
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }

    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}
