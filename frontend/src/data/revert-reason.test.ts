import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, toBytes } from "viem";
import { capabilityRevertMessage, revertErrorName, revertPayload } from "./revert-reason.ts";
import { shouldRetrySameSignature } from "./wallet-read.ts";

const HASH = "0x5c631f47ccf83da6d718bffb06a6972c343d08393e8babcd409b4f7079b05425";

test("a mined signature revert names the transaction and is not retried as the same broadcast", () => {
  const data = keccak256(toBytes("InvalidSignature()")).slice(0, 10);
  assert.equal(revertErrorName(data), "InvalidSignature");
  const message = capabilityRevertMessage(data, HASH);
  assert.match(message, /rejected the security-key signature/);
  assert.match(message, new RegExp(HASH));
  assert.equal(/the transaction reverted/i.test(message), false);
  assert.equal(shouldRetrySameSignature(message), false);
});

test("policy, gas, and rate-limit failures stay distinct and do not claim a capability was opened", () => {
  const exposure = capabilityRevertMessage(keccak256(toBytes("ExposureExceeded()")).slice(0, 10), HASH);
  const nonce = capabilityRevertMessage(keccak256(toBytes("BadNonce()")).slice(0, 10), HASH);
  const expiry = capabilityRevertMessage(keccak256(toBytes("ExpiryNotFuture()")).slice(0, 10), HASH);
  const funds = capabilityRevertMessage(keccak256(toBytes("TransferFailed()")).slice(0, 10), HASH);
  const payee = capabilityRevertMessage(keccak256(toBytes("BadPayeeCount()")).slice(0, 10), HASH);
  const deadline = capabilityRevertMessage(keccak256(toBytes("Expired()")).slice(0, 10), HASH);
  const unknown = capabilityRevertMessage(null, HASH);
  for (const message of [exposure, nonce, expiry, funds, payee, deadline, unknown]) {
    assert.match(message, /not opened|reverted this capability/);
    assert.equal(shouldRetrySameSignature(message), false);
    assert.match(message, new RegExp(HASH));
  }
  const gas = "The relayer cannot pay the gas for this action. Nothing was broadcast.";
  const busy = "Network reads are busy. Your last confirmed state is still safe.";
  assert.equal(shouldRetrySameSignature(gas), false);
  assert.equal(shouldRetrySameSignature(busy), true);
  assert.equal(revertPayload({ cause: { data: `${keccak256(toBytes("ZeroAddress()")).slice(0, 10)}` } }), keccak256(toBytes("ZeroAddress()")).slice(0, 10));
});
