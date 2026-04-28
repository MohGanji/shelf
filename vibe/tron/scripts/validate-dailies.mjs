/**
 * Validates all bundled daily-* level JSON files (no regeneration).
 * Run from repo root: node vibe/tron/scripts/validate-dailies.mjs
 * Or: cd vibe/tron && node scripts/validate-dailies.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateLevel } from "../js/levels/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEVELS_DIR = path.resolve(__dirname, "../levels");

function main() {
  const names = fs
    .readdirSync(LEVELS_DIR)
    .filter((n) => n.startsWith("daily-") && n.endsWith(".json"))
    .sort();

  /** @type {string[]} */
  const failures = [];

  for (const name of names) {
    const fp = path.join(LEVELS_DIR, name);
    const raw = fs.readFileSync(fp, "utf8");
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      failures.push(`${name}: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const v = validateLevel(json);
    if (!v.valid) {
      failures.push(`${name}: ${v.errors.join("; ")}`);
    }
  }

  console.log(`Checked ${names.length} daily level file(s) in ${LEVELS_DIR}`);

  if (failures.length > 0) {
    console.error("\nValidation failed:\n");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("All daily levels pass validateLevel.");
}

main();
