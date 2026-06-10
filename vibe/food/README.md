# NutriHex

FC/FIFA-style stat cards for food. Every ingredient, packaged product, or meal gets a six-axis hexagon — PRO / CAR / FAT / FIB / VIT / MIN, scored 0–99 per 100 g. Axes are neutral composition magnitudes: butter maxes FAT, lentils max FIB. You interpret.

## What it does

- **Ingredients** — 761 foods curated from USDA FoodData Central (SR Legacy), instant and offline. Macros plus 11 vitamins and 8 minerals per 100 g. SR Legacy was chosen over the newer Foundation Foods release because Foundation entries often lack fiber/vitamin panels (measured incrementally), which made hexes misleading.
- **Products** — live search of Open Food Facts (the database Yuka uses). Packaged products come with Nutri-Score, NOVA group, and additive-count badges. Most products lack micro data, so VIT/MIN show unscored.
- **Compare** — pin any card (⚔) and pick a rival; the two hexes overlay gold-vs-teal with per-axis values.
- **My Meals** — combine ingredients with gram amounts into a dish; the dish gets its own hex (per 100 g, so meals compare fairly against anything). Saved in localStorage.
- **Axis filters** — chips under the search box (protein / carbs / fat / fiber / vitamins / minerals) filter any list to foods heavy in that nutrient (axis ≥ 50), ranked strongest-first — e.g. find protein-dense alternatives to chicken.
- **My Diet** — set daily targets (presets: balanced / high-protein / keto, or custom). Flip any card to “% of my day” to see how a portion covers your needs; VIT/MIN use standard adult RDAs.

## Scoring

Macro axes use a sqrt curve against a per-100 g reference max (protein 40 g, carbs 80 g, fat 80 g, fiber 15 g) so mid-range foods still differentiate. VIT/MIN axes average %-of-RDA across the nutrient group, each nutrient capped at 100%.

## Stack

On phones the results list becomes a dropdown over the stage (open while searching, closed on selection) so the hex card stays the focal point.

Static ES modules, no build, no keys. `js/data.js` is generated from the USDA SR Legacy bulk JSON download, curated to common ingredients with per-category quotas and name heuristics (prefer raw/basic items; skip baby foods, fast foods, commodity variants).
