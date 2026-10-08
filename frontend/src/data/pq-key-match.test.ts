import assert from "node:assert/strict";
import test from "node:test";
import { backupMatchesRoot, backupRefusal } from "./pq-key-match.ts";

const chain = "0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50";

test("the same verifying key matches regardless of case", () => {
  assert.equal(backupMatchesRoot(chain.toUpperCase(), chain), "match");
});

test("a different verifying key does not match", () => {
  const other = "0x" + "ab".repeat(32);
  assert.equal(backupMatchesRoot(other, chain), "mismatch");
  assert.equal(backupRefusal("mismatch"), "This backup belongs to an older security key.");
});

test("a missing chain key is not treated as a match", () => {
  assert.equal(backupMatchesRoot(chain, ""), "missing");
  assert.equal(backupMatchesRoot(chain, undefined), "missing");
  assert.match(backupRefusal("missing"), /Nothing was signed/);
});
