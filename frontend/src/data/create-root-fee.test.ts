import assert from "node:assert/strict";
import test from "node:test";
import { createRootAccountRefusal, createRootFeeRefusal, delegatedAccount, quotedCreateRootFee } from "./create-root-fee.ts";

test("a low gas price still quotes the Arc minimum with wallet headroom", () => {
  const low = quotedCreateRootFee(546_558n, 194_000_000n);
  const floor = quotedCreateRootFee(546_558n, 20_000_000_000n);
  assert.equal(low, floor);
  assert.ok(low > 10_931_175_000_000_000n);
});

test("a delegated wallet is refused before the network fee", () => {
  const code = "0xef0100d28a3810279e6241b9a42395880bf154f23469e7";
  assert.equal(delegatedAccount(code), "0xd28a3810279e6241b9a42395880bf154f23469e7");
  assert.match(createRootAccountRefusal(code) ?? "", /forwards incoming Arc USDC/);
  assert.equal(createRootAccountRefusal("0x"), null);
});

test("an empty Arc balance does not open the wallet", () => {
  const refusal = createRootFeeRefusal(0n, 10_931_175_000_000_000n);
  assert.match(refusal ?? "", /Arc USDC/);
  assert.match(refusal ?? "", /Nothing was broadcast/);
  assert.equal(createRootFeeRefusal(10_931_175_000_000_000n, 10_931_175_000_000_000n), null);
});
