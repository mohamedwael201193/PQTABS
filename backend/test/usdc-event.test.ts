import assert from "node:assert/strict";
import test from "node:test";
import { USDC } from "../src/constants.js";
import { NATIVE_USDC_EMITTER, erc20SpendRaw } from "../src/index/usdc-event.js";

test("an ERC-20 USDC transfer is stored once and its native twin is ignored", () => {
  const erc20 = erc20SpendRaw(USDC, 7n);
  const twin = erc20SpendRaw(NATIVE_USDC_EMITTER, 7n * 1_000_000_000_000n);
  assert.equal(erc20, "7");
  assert.equal(twin, null);
  const counted = [erc20, twin].filter((amount): amount is string => amount != null);
  assert.deepEqual(counted, ["7"]);
});
