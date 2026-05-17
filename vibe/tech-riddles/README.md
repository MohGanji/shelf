# Tech Riddles

A static, frontend-only challenge game for short technical riddles.

## Run

```bash
cd vibe/tech-riddles
python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Data

The riddle bank is being rebuilt by hand, one scenario at a time. Add new entries to the `riddles` array in `js/riddles.js`. Each riddle should store its finished prompt directly:

```js
{
  id: "infra-devops-college-001",
  area: "infra-devops",
  difficulty: "college",
  prompt: `You run Redis in Docker.

compose down.
compose up.

Sessions vanish.
Cached data is gone.

What did you forget
to give the container?`,
  answers: ["volume", "Docker volume", "persistent volume", "mounted volume"],
  explanation: "A Docker volume persists data outside the container lifecycle."
}
```

## Difficulty

Difficulty is not about making the wording obscure. It describes the stage where the underlying concept is normally familiar.

- `college`: useful modern concepts a strong CS graduate or self-taught equivalent may know, especially from projects, internships, labs, or common developer workflows. Avoid toy basics like "what is an array."
- `junior`: situations someone with early professional experience in that area is likely to have personally debugged or shipped.
- `intermediate`: tradeoffs and failure modes a mid-level engineer should recognize across real product work.
- `senior`: realistic incidents and decisions experienced engineers are expected to anticipate, usually with higher stakes, cross-system consequences, rollout risk, data correctness, or reliability concerns.
- `staff-phd`: deep systems, research, architecture, or organization-scale judgment usually associated with staff-level engineers, specialists, or PhD-level practitioners.

Write each riddle from inside a believable scenario first. The answer should feel like the missing concept that explains the situation, not like trivia attached to a poem.

Do not make higher difficulty more abstract. Senior and staff-level riddles should still feel like something that happened in production, a review, an incident, a migration, a rollout, or an experiment.

Poetic compression must not blur the technical mechanism. The scenario should be realistic, causally accurate, and specific enough that the intended answer is the best explanation. If multiple concepts could reasonably explain the same prompt, rewrite the scenario before adding it.

A challenge uses a skewed 20-question mix: 5 college, 6 junior, 5 intermediate, 3 senior, and 1 staff / PhD riddle. Until the bank has enough unique answers for that mix, the start screen stays in reset mode and the challenge button is disabled.

## Scoring

Answers are checked locally in `js/scoring.js`:

- normalized exact match against accepted aliases
- punctuation/case/article-insensitive comparison
- conservative partial keyword matching for distinctive terms in multi-word answers
- conservative fuzzy matching for small typos

No backend or LLM judge is used.

The results screen also gives a broad estimated level from total correct answers. The estimate is intentionally forgiving because each challenge spans many fields: 0-4 CS major / college, 5-8 junior engineer, 9-11 intermediate engineer, 12-14 senior engineer, and 15-20 staff / PhD.
