// Runs every src/**/*.test.ts with Node's test runner and type stripping. Works the same on Windows and Linux.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function testFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(path));
    else if (entry.name.endsWith(".test.ts")) found.push(path);
  }
  return found;
}

const files = testFiles(join(root, "src")).map((file) => relative(root, file).replaceAll("\\", "/")).sort();
if (files.length === 0) {
  console.error("No frontend test files were found under src/.");
  process.exit(2);
}
console.log(`Running ${files.length} frontend test files.`);
const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
