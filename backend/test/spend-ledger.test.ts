import assert from "node:assert/strict";
import test from "node:test";
import { recallSpend, rememberSpend } from "../src/index/spend-ledger.js";
import { openMemory } from "../src/index/sql.js";

const hash = "0x1352cc1963ee0e62c0c04ff634412c4257327755a9d5cf58eefe113d14b2e4a5";

test("the same authorization returns the stored hash and does not replace it", async () => {
  const sql = await openMemory();
  assert.equal(await recallSpend(sql, "0xabc"), null);
  await rememberSpend(sql, "0xabc", hash);
  await rememberSpend(sql, "0xabc", "0x" + "11".repeat(32));
  assert.equal(await recallSpend(sql, "0xabc"), hash);
  await sql.close();
});
