import assert from "node:assert/strict";
import test from "node:test";
import { compareChainActivity } from "./activity-order.ts";

test("activity follows block and log index, not a later timestamp", () => {
  const older = { block: "10", logIndex: "2", at: "later" };
  const newer = { block: "10", logIndex: "9", at: "earlier" };
  const nextBlock = { block: "11", logIndex: "0", at: "earlier" };
  const rows = [older, newer, nextBlock].sort(compareChainActivity);
  assert.deepEqual(rows.map((row) => `${row.block}:${row.logIndex}`), ["11:0", "10:9", "10:2"]);
});

test("a row without a block stays after a chain row", () => {
  const rows = [{ block: undefined, logIndex: undefined }, { block: "1", logIndex: "0" }].sort(compareChainActivity);
  assert.equal(rows[0].block, "1");
});
