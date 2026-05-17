export function validateRiddles(riddles, { areas, difficulties, expectedPerArea = null } = {}) {
  const issues = [];
  const ids = new Set();
  const prompts = new Map();
  const areaCounts = new Map(areas.map((area) => [area, 0]));
  const forbiddenPromptPhrases = [
    /\bwhat do you call this\?/i,
    /\bwhat am i\?/i,
    /\bname me\b/i,
    /\bfits here\b/i,
  ];

  riddles.forEach((riddle, index) => {
    const label = riddle.id || `riddle at index ${index}`;
    const prompt = String(riddle.prompt || "");
    const promptKey = prompt.toLowerCase().replace(/\s+/g, " ").trim();
    const promptLines = prompt.split("\n").map((line) => line.trim()).filter(Boolean);

    if (!riddle.id) issues.push(`${label}: missing id`);
    if (ids.has(riddle.id)) issues.push(`${label}: duplicate id`);
    ids.add(riddle.id);

    if (!areas.includes(riddle.area)) issues.push(`${label}: unknown area "${riddle.area}"`);
    if (!difficulties.includes(riddle.difficulty)) {
      issues.push(`${label}: unknown difficulty "${riddle.difficulty}"`);
    }
    if (!prompt || prompt.length < 20) issues.push(`${label}: prompt is too short`);
    if (promptLines.length < 2 || promptLines.length > 12) {
      issues.push(`${label}: prompt should be 2-12 non-empty lines`);
    }
    if (forbiddenPromptPhrases.some((phrase) => phrase.test(prompt))) {
      issues.push(`${label}: prompt contains a stock generated phrase`);
    }
    if (prompts.has(promptKey)) issues.push(`${label}: duplicate prompt with ${prompts.get(promptKey)}`);
    prompts.set(promptKey, label);
    if (!Array.isArray(riddle.answers) || riddle.answers.length === 0) {
      issues.push(`${label}: missing accepted answers`);
    }

    if (areaCounts.has(riddle.area)) {
      areaCounts.set(riddle.area, areaCounts.get(riddle.area) + 1);
    }
  });

  if (Number.isInteger(expectedPerArea)) {
    areaCounts.forEach((count, area) => {
      if (count !== expectedPerArea) {
        issues.push(`${area}: expected ${expectedPerArea} riddles, found ${count}`);
      }
    });
  }

  return issues;
}
