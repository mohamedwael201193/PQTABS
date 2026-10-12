import assert from "node:assert/strict";
import test from "node:test";
import { closedCapabilityMessage, explorerTxUrl, replayCheckMessage, signedRejectionMessage, signedRejectionToast, stepIndex } from "./task-phase.ts";

test("the first task starts at the quote, not at a previous settlement", () => {
  assert.equal(stepIndex("READY"), 0);
  assert.equal(stepIndex("FETCHING_QUOTE"), 0);
  assert.equal(stepIndex("POLICY_REFUSED"), 1);
  assert.equal(stepIndex("AUTHORIZING"), 2);
  assert.equal(stepIndex("VERIFYING_PAYMENT"), 3);
  assert.equal(stepIndex("SETTLEMENT_PENDING"), 3);
  assert.equal(stepIndex("FAILED_NO_SETTLEMENT"), 3);
  assert.equal(stepIndex("SETTLED"), 4);
  assert.equal(closedCapabilityMessage().includes("Nothing was signed"), true);
  assert.equal(replayCheckMessage().startsWith("Replay check:"), true);
  assert.equal(replayCheckMessage().includes("Run task"), false);
});

test("a transaction link exists only for a 32-byte hash", () => {
  assert.equal(explorerTxUrl("https://explorer.arc.io", ""), null);
  assert.equal(explorerTxUrl("https://explorer.arc.io", "0xabc"), null);
  assert.equal(
    explorerTxUrl("https://explorer.arc.io/", "0x626b2f124be7b52b803440e8f08043f348e78f5aa1d8019ff257e95061a32757"),
    "https://explorer.arc.io/tx/0x626b2f124be7b52b803440e8f08043f348e78f5aa1d8019ff257e95061a32757",
  );
});

test("a facilitator rejection names the signature and the absence of a transaction", () => {
  const message = signedRejectionMessage("The service did not settle the payment (invalid_exact_evm_signature). No Arc transaction was recorded.");
  assert.match(message, /Signature rejected before broadcast/);
  assert.match(message, /invalid_exact_evm_signature/);
  assert.match(message, /A local signature was created/);
  assert.match(message, /No transaction was sent/);
  assert.equal(message.includes("No Arc transaction was recorded. No Arc"), false);
  const busy = signedRejectionMessage("simulation failed (rate_limited)");
  assert.match(busy, /Arc is busy/);
  assert.equal(busy.includes("Signature rejected"), false);
  assert.equal(signedRejectionToast("rate_limited", true), "Arc is busy. Nothing was sent.");
  assert.equal(signedRejectionToast("invalid_exact_evm_signature", true), "Signature rejected before broadcast.");
  assert.equal(signedRejectionToast("closed", false), "Payment blocked.");
});
