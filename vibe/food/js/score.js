// Axis scoring: turn a per-100g nutrient object into six 0-99 stats, FC-card style.
// Axes are neutral composition magnitudes — high FAT means fatty, not bad.

export const RDA = {
  // adult daily reference values
  vitA: 900, // µg RAE
  vitC: 90, // mg
  vitD: 20, // µg
  vitE: 15, // mg
  vitK: 120, // µg
  vitB1: 1.2, // mg
  vitB2: 1.3, // mg
  vitB3: 16, // mg
  vitB6: 1.7, // mg
  folate: 400, // µg
  vitB12: 2.4, // µg
  calcium: 1000, // mg
  iron: 18, // mg
  magnesium: 420, // mg
  phosphorus: 700, // mg
  potassium: 3400, // mg
  zinc: 11, // mg
  selenium: 55, // µg
  copper: 0.9, // mg
};

export const VITAMINS = ["vitA", "vitC", "vitD", "vitE", "vitK", "vitB1", "vitB2", "vitB3", "vitB6", "folate", "vitB12"];
export const MINERALS = ["calcium", "iron", "magnesium", "phosphorus", "potassium", "zinc", "selenium", "copper"];

export const AXES = [
  { key: "PRO", label: "Protein" },
  { key: "CAR", label: "Carbs" },
  { key: "FAT", label: "Fat" },
  { key: "FIB", label: "Fiber" },
  { key: "VIT", label: "Vitamins" },
  { key: "MIN", label: "Minerals" },
];

// reference "max" per 100g for each macro axis — sqrt curve so mid-range foods still differentiate
const REF = { protein: 40, carbs: 80, fat: 80, fiber: 15, vitPct: 60, minPct: 60 };

function curve(x) {
  return Math.round(99 * Math.sqrt(Math.max(0, Math.min(x, 1))));
}

// average % of RDA per 100g across a nutrient group, each capped at 100%
export function rdaPct(n, keys) {
  let sum = 0;
  for (const k of keys) {
    const v = n[k] || 0;
    sum += Math.min(100, (v / RDA[k]) * 100);
  }
  return sum / keys.length;
}

export function axisScores(n) {
  return {
    PRO: curve((n.protein || 0) / REF.protein),
    CAR: curve((n.carbs || 0) / REF.carbs),
    FAT: curve((n.fat || 0) / REF.fat),
    FIB: curve((n.fiber || 0) / REF.fiber),
    VIT: curve(rdaPct(n, VITAMINS) / REF.vitPct),
    MIN: curve(rdaPct(n, MINERALS) / REF.minPct),
  };
}

// "% of your day" mode: axes show how much of the daily target a portion covers, capped at 99
export function dayScores(n, grams, targets) {
  const f = grams / 100;
  const pct = (v, target) => Math.min(99, Math.round(((v || 0) * f * 100) / target));
  return {
    PRO: pct(n.protein, targets.protein),
    CAR: pct(n.carbs, targets.carbs),
    FAT: pct(n.fat, targets.fat),
    FIB: pct(n.fiber, targets.fiber),
    VIT: Math.min(99, Math.round(rdaPct(n, VITAMINS) * f)),
    MIN: Math.min(99, Math.round(rdaPct(n, MINERALS) * f)),
  };
}

// combine [{food, grams}] into one nutrient object (totals + per-100g)
export function combine(parts) {
  const total = {};
  let weight = 0;
  const numericKeys = new Set();
  for (const { food, grams } of parts) {
    weight += grams;
    for (const [k, v] of Object.entries(food)) {
      if (typeof v !== "number") continue;
      numericKeys.add(k);
      total[k] = (total[k] || 0) + (v * grams) / 100;
    }
  }
  const per100 = {};
  for (const k of numericKeys) per100[k] = weight ? (total[k] / weight) * 100 : 0;
  return { total, per100, weight };
}
