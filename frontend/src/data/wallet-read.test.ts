import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetrySameSignature, shouldRetryWalletRead } from "./wallet-read.ts";

test("a generic Arc failure retries once", () => {
  assert.equal(shouldRetryWalletRead(0, "The request could not be completed."), true);
  assert.equal(shouldRetryWalletRead(0, "Arc is temporarily unavailable. Your funds are safe. Try again."), true);
  assert.equal(shouldRetryWalletRead(1, "The request could not be completed."), false);
  assert.equal(shouldRetryWalletRead(0, "That address is not a root of this factory."), false);
  assert.equal(shouldRetrySameSignature("Network reads are busy. Your last confirmed state is still safe."), true);
  assert.equal(shouldRetrySameSignature("Arc rejected the signature. Nothing was submitted."), false);
});
