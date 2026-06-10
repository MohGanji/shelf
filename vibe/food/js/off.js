// Open Food Facts live search — packaged products, same database Yuka uses.
// No API key; values normalised to the same per-100g nutrient shape as the bundled dataset.

const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "nutriments",
  "additives_n",
  "nova_group",
  "nutriscore_grade",
  "image_small_url",
].join(",");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// OFF stores micros in grams; convert to the units our dataset uses
function toNutrients(nutr) {
  const g = (k) => num(nutr[k + "_100g"]);
  const mg = (k) => (g(k) !== undefined ? g(k) * 1000 : undefined);
  const ug = (k) => (g(k) !== undefined ? g(k) * 1e6 : undefined);
  const out = {
    kcal: num(nutr["energy-kcal_100g"]),
    protein: g("proteins"),
    carbs: g("carbohydrates"),
    fat: g("fat"),
    fiber: g("fiber"),
    sugar: g("sugars"),
    satfat: g("saturated-fat"),
    sodium: mg("sodium"),
    vitA: ug("vitamin-a"),
    vitC: mg("vitamin-c"),
    vitD: ug("vitamin-d"),
    vitE: mg("vitamin-e"),
    vitK: ug("vitamin-k"),
    vitB1: mg("vitamin-b1"),
    vitB2: mg("vitamin-b2"),
    vitB6: mg("vitamin-b6"),
    vitB12: ug("vitamin-b12"),
    folate: ug("folates"),
    calcium: mg("calcium"),
    iron: mg("iron"),
    magnesium: mg("magnesium"),
    phosphorus: mg("phosphorus"),
    potassium: mg("potassium"),
    zinc: mg("zinc"),
    selenium: ug("selenium"),
    copper: mg("copper"),
  };
  if (out.kcal === undefined) {
    const kj = num(nutr["energy_100g"]);
    if (kj !== undefined) out.kcal = kj / 4.184;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  if (out.kcal !== undefined) out.kcal = Math.round(out.kcal);
  return out;
}

export async function searchProducts(query, signal) {
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "24",
    fields: FIELDS,
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
  const data = await res.json();
  return (data.products || [])
    .filter((p) => p.product_name && p.nutriments)
    .map((p) => {
      const n = toNutrients(p.nutriments);
      return {
        name: p.product_name + (p.brands ? ` — ${p.brands.split(",")[0]}` : ""),
        cat: "product",
        source: "off",
        code: p.code,
        image: p.image_small_url || null,
        additives: typeof p.additives_n === "number" ? p.additives_n : null,
        nova: p.nova_group || null,
        nutriscore: p.nutriscore_grade && p.nutriscore_grade !== "unknown" ? p.nutriscore_grade : null,
        hasMicros: ["vitC", "calcium", "iron", "potassium"].some((k) => n[k] !== undefined),
        ...n,
      };
    })
    .filter((p) => p.kcal !== undefined || p.protein !== undefined);
}
