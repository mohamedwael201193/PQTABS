import assert from "node:assert/strict";
import test from "node:test";
import { spendKind } from "./spend-kind.ts";

const root = "0x44502F6d18DAA9620c2BB3da21b8C3C8033A9787";

test("USDC returned to the root is a reclaim, not an agent payment", () => {
  assert.equal(spendKind(root, root), "reclaim");
  assert.equal(spendKind("0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9", root), "payment");
});
