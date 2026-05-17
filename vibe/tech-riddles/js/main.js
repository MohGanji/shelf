import { RIDDLE_AREAS, RIDDLE_DIFFICULTIES, riddles } from "./riddles.js";
import { normalizeAnswer, scoreAnswer } from "./scoring.js";
import { validateRiddles } from "./riddleValidation.js";

const CHALLENGE_PLAN = [
  { difficulty: "college", count: 5 },
  { difficulty: "junior", count: 6 },
  { difficulty: "intermediate", count: 5 },
  { difficulty: "senior", count: 3 },
  { difficulty: "staff-phd", count: 1 },
];
const POINTS_PER_RIDDLE = 5;

const app = document.querySelector("#app");
const questionStatus = document.querySelector("#question-status");
const scoreStatus = document.querySelector("#score-status");

let state = createInitialState();

const validationIssues = validateRiddles(riddles, {
  areas: RIDDLE_AREAS,
  difficulties: RIDDLE_DIFFICULTIES,
});

if (validationIssues.length) {
  console.warn("Tech Riddles data issues:", validationIssues);
}

renderStart();

function createInitialState() {
  return {
    challenge: [],
    currentIndex: 0,
    answers: [],
    score: 0,
  };
}

function startChallenge() {
  if (!canBuildChallenge()) {
    renderStart();
    return;
  }

  state = {
    ...createInitialState(),
    challenge: buildChallenge(),
  };
  renderQuestion();
}

function buildChallenge() {
  const usedAnswers = new Set();

  return CHALLENGE_PLAN.flatMap(({ difficulty, count }) => {
    const pool = shuffle(riddles.filter((riddle) => riddle.difficulty === difficulty));
    const selected = [];

    for (const riddle of pool) {
      const answerKey = normalizeAnswer(riddle.answers[0]);
      if (usedAnswers.has(answerKey)) continue;

      selected.push(riddle);
      usedAnswers.add(answerKey);

      if (selected.length === count) break;
    }

    if (selected.length !== count) {
      throw new Error(`Not enough unique ${difficulty} riddles to build a challenge.`);
    }

    return selected;
  });
}

function canBuildChallenge() {
  return CHALLENGE_PLAN.every(({ difficulty, count }) => {
    const uniqueAnswers = new Set();

    for (const riddle of riddles) {
      if (riddle.difficulty !== difficulty || !riddle.answers?.[0]) continue;
      uniqueAnswers.add(normalizeAnswer(riddle.answers[0]));
    }

    return uniqueAnswers.size >= count;
  });
}

function renderStart() {
  const canStart = canBuildChallenge();
  questionStatus.textContent = canStart ? "Ready" : "Rebuilding";
  scoreStatus.textContent = "Score 0/100";
  app.innerHTML = `
    <section class="panel intro-panel">
      <p class="eyebrow">Tech Riddles</p>
      <h1>${canStart ? "Small clues for large systems." : "Riddle bank reset."}</h1>
      ${canStart ? "" : `
        <p class="intro-copy">
          ${riddles.length} handcrafted clues drafted. Full challenge unlocks when every level has enough.
        </p>
      `}
      <button class="primary-button" type="button" data-action="start" ${canStart ? "" : "disabled"}>
        Start Challenge
      </button>
    </section>
  `;
  if (canStart) {
    app.querySelector("[data-action='start']").addEventListener("click", startChallenge);
  }
}

function renderQuestion() {
  const riddle = state.challenge[state.currentIndex];
  const questionNumber = state.currentIndex + 1;
  questionStatus.textContent = `Question ${questionNumber}/20`;
  scoreStatus.textContent = `Score ${state.score}/100`;

  app.innerHTML = `
    <section class="panel question-panel">
      <p class="eyebrow">Riddle ${questionNumber}</p>
      <div class="riddle-text">${formatPrompt(riddle.prompt)}</div>
      <form class="answer-form" data-answer-form>
        <label class="sr-only" for="answer-input">Your answer</label>
        <input
          id="answer-input"
          class="answer-input"
          name="answer"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Type the answer"
          required
        >
        <button class="primary-button" type="submit">Answer</button>
      </form>
    </section>
  `;

  const form = app.querySelector("[data-answer-form]");
  const input = app.querySelector("#answer-input");
  input.focus();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAnswer(input.value);
  });
}

function submitAnswer(input) {
  const riddle = state.challenge[state.currentIndex];
  const result = scoreAnswer(input, riddle.answers);
  const points = result.correct ? POINTS_PER_RIDDLE : 0;

  state.score += points;
  state.answers.push({
    riddle,
    input,
    result,
    points,
  });

  scoreStatus.textContent = `Score ${state.score}/100`;
  renderFeedback(state.answers[state.answers.length - 1]);
}

function renderFeedback(answer) {
  const isLastQuestion = state.currentIndex === state.challenge.length - 1;
  const acceptedAnswer = answer.riddle.answers[0];
  const feedbackDetail = getFeedbackDetail(answer, acceptedAnswer);

  app.innerHTML = `
    <section class="panel feedback-panel ${answer.result.correct ? "is-correct" : "is-wrong"}">
      <p class="eyebrow">${answer.result.correct ? "Correct" : "Missed"}</p>
      ${feedbackDetail}
      <button class="primary-button" type="button" data-action="next">
        ${isLastQuestion ? "See Score" : "Next Riddle"}
      </button>
    </section>
  `;

  const nextButton = app.querySelector("[data-action='next']");
  nextButton.addEventListener("click", () => {
    state.currentIndex += 1;
    if (state.currentIndex >= state.challenge.length) {
      renderResults();
    } else {
      renderQuestion();
    }
  });
  nextButton.focus();
}

function getFeedbackDetail(answer, acceptedAnswer) {
  if (answer.result.correct && answer.result.mode !== "fuzzy") {
    return "";
  }

  if (answer.result.correct) {
    return `
      <p class="feedback-copy">
        Accepted: <strong>${escapeHtml(answer.result.matchedAnswer)}</strong>
      </p>
    `;
  }

  return `
    <p class="feedback-copy">
      Answer: <strong>${escapeHtml(acceptedAnswer)}</strong>
    </p>
    ${answer.riddle.explanation ? `<p class="explanation">${escapeHtml(answer.riddle.explanation)}</p>` : ""}
  `;
}

function renderResults() {
  questionStatus.textContent = "Complete";
  scoreStatus.textContent = `Score ${state.score}/100`;

  const correctCount = state.answers.filter((answer) => answer.result.correct).length;
  const gradeEstimate = getGradeEstimate(correctCount);

  app.innerHTML = `
    <section class="panel results-panel">
      <p class="eyebrow">Challenge Complete</p>
      <h1>${state.score}/100</h1>
      <p class="intro-copy">
        ${correctCount} of 20 correct.
      </p>
      <p class="grade-copy">
        Estimated level: <strong>${gradeEstimate}</strong>.
      </p>
      <button class="primary-button" type="button" data-action="restart">Play Again</button>
    </section>
  `;

  app.querySelector("[data-action='restart']").addEventListener("click", startChallenge);
}

function getGradeEstimate(correctCount) {
  if (correctCount >= 15) return "Staff / PhD level";
  if (correctCount >= 12) return "Senior engineer level";
  if (correctCount >= 9) return "Intermediate engineer level";
  if (correctCount >= 5) return "Junior engineer level";
  return "CS major / college level";
}

function formatPrompt(prompt) {
  return escapeHtml(prompt).replace(/\n/g, "<br>");
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
