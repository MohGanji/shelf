// localStorage persistence for saved meals and the diet profile.

const MEALS_KEY = "nutrihex.meals.v1";
const PROFILE_KEY = "nutrihex.profile.v1";

export const PRESETS = {
  balanced: { label: "Balanced", kcal: 2000, protein: 100, carbs: 250, fat: 70, fiber: 30 },
  protein: { label: "High protein", kcal: 2200, protein: 160, carbs: 200, fat: 73, fiber: 30 },
  keto: { label: "Keto", kcal: 2000, protein: 120, carbs: 25, fat: 155, fiber: 25 },
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function loadMeals() {
  return read(MEALS_KEY, []);
}

export function saveMeals(meals) {
  localStorage.setItem(MEALS_KEY, JSON.stringify(meals));
}

export function loadProfile() {
  return read(PROFILE_KEY, null);
}

export function saveProfile(profile) {
  if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  else localStorage.removeItem(PROFILE_KEY);
}
