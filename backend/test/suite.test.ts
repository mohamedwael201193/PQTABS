import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const UNIT = [
  "accounting.test.js",
  "answer-quality.test.js",
  "arc-ranges.test.js",
  "decide.test.js",
  "dev-session.test.js",
  "http.test.js",
  "index.test.js",
  "portfolio-scan.test.js",
  "research.test.js",
  "rpc-error.test.js",
  "spend-blob.test.js",
  "spend-ledger.test.js",
  "suite.test.js",
  "usdc-event.test.js",
  "validate.test.js",
  "x402.test.js",
];
const LIVE = ["live.test.js"];

describe("suite accounting", () => {
  it("puts every backend test in exactly one command", () => {
    const files = readdirSync(new URL("../../test", import.meta.url))
      .filter((name) => name.endsWith(".test.ts"))
      .map((name) => name.replace(/\.ts$/, ".js"))
      .sort();
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts: { test: string; "test:live": string };
    };
    assert.equal(pkg.scripts.test.includes("live.test.js"), false);
    assert.equal(pkg.scripts["test:live"].includes("live.test.js"), true);
    const named = [...pkg.scripts.test.matchAll(/dist\/test\/([a-z0-9-]+\.test\.js)/g)].map((match) => match[1]);
    const live = [...pkg.scripts["test:live"].matchAll(/dist\/test\/([a-z0-9-]+\.test\.js)/g)].map((match) => match[1]);
    assert.deepEqual(named.sort(), UNIT);
    assert.deepEqual(live, LIVE);
    assert.deepEqual([...named, ...live].sort(), files);
  });
});
