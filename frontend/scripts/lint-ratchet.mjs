// Lint ratchet: fails when ESLint finds more problems than the committed baseline for any file and rule.
// Existing problems are recorded in lint-baseline.json and are not fixed here. New problems fail CI.
// Run `node scripts/lint-ratchet.mjs --update` only after a reviewed fix lowers the counts, or to record a new baseline.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "lint-baseline.json");
const update = process.argv.includes("--update");

const eslintBin = join(root, "node_modules", "eslint", "bin", "eslint.js");
const run = spawnSync(process.execPath, [eslintBin, ".", "-f", "json"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (!run.stdout) {
  console.error("ESLint produced no output.", run.stderr);
  process.exit(2);
}
const results = JSON.parse(run.stdout);

/** @type {Record<string, Record<string, number>>} */
const current = {};
for (const result of results) {
  const file = relative(root, result.filePath).replaceAll("\\", "/");
  for (const message of result.messages) {
    const rule = message.ruleId ?? "fatal";
    const key = `${message.severity === 2 ? "error" : "warning"}:${rule}`;
    current[file] ??= {};
    current[file][key] = (current[file][key] ?? 0) + 1;
  }
}

if (update) {
  const sorted = Object.fromEntries(Object.keys(current).sort().map((file) => [file, current[file]]));
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  console.log(`Wrote ${baselinePath} with ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error("lint-baseline.json is missing. Run node scripts/lint-ratchet.mjs --update once and review the result.");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const regressions = [];
let baselineTotal = 0;
let currentTotal = 0;
for (const rules of Object.values(baseline)) {
  for (const count of Object.values(rules)) baselineTotal += count;
}
for (const [file, rules] of Object.entries(current)) {
  for (const [key, count] of Object.entries(rules)) {
    currentTotal += count;
    const allowed = baseline[file]?.[key] ?? 0;
    if (count > allowed) regressions.push(`${file}  ${key}  ${allowed} -> ${count}`);
  }
}

console.log(`ESLint problems: ${currentTotal} now, ${baselineTotal} in baseline.`);
if (regressions.length > 0) {
  console.error("New or increased lint problems (fix them, do not raise the baseline):");
  for (const line of regressions) console.error(`  ${line}`);
  process.exit(1);
}
const improved = Object.entries(baseline).flatMap(([file, rules]) =>
  Object.entries(rules).filter(([key, count]) => (current[file]?.[key] ?? 0) < count).map(([key, count]) => `${file}  ${key}  ${count} -> ${current[file]?.[key] ?? 0}`),
);
if (improved.length > 0) console.log(`Improved (lower the baseline with --update after review):\n  ${improved.join("\n  ")}`);
console.log("Lint ratchet passed: no new problems.");
