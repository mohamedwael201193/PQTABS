import assert from "node:assert/strict";
import test from "node:test";
import { probeAmount, probePayment, probeRefusal, replayRefusal, spentAuthorization, unavailableServiceRefusal } from "./refusal-probe.ts";

const PAYEE = "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9";

test("the per-payment check is one unit above the live limit", () => {
  assert.equal(probeAmount("above_per_payment", "10000", "9988"), "10001");
  const payment = probePayment("above_per_payment", PAYEE, "10001");
  assert.equal(payment.accepts[0].amount, "10001");
  assert.equal(payment.accepts[0].network, "eip155:5042");
  assert.equal(payment.accepts[0].payTo, PAYEE);
});

test("the balance check stays within the per-payment limit", () => {
  assert.equal(probeAmount("above_balance", "10000", "9988"), "9989");
  assert.equal(probeAmount("above_balance", "10000", "10000"), null);
});

test("a wrong network is not an Arc exact quote", () => {
  const payment = probePayment("wrong_network", PAYEE, "1");
  assert.equal(payment.accepts[0].network, "eip155:1");
});

test("a refusal without a hash is blocked, and an allow is not", () => {
  assert.deepEqual(probeRefusal(200, { decision: "REFUSE", reason: ["max_per_call"] }), {
    decision: "REFUSE",
    reason: ["max_per_call"],
  });
  assert.equal(probeRefusal(200, { decision: "ALLOW", reason: ["capability_active"] }), null);
  assert.equal(probeRefusal(200, { decision: "REFUSE", reason: ["wrong_payee"], hash: "0x" + "ab".repeat(32) }), null);
  assert.deepEqual(probeRefusal(400, { error: "bad_signature_length", detail: "spend blob must be 213 bytes" }), {
    decision: "REFUSE",
    reason: ["bad_signature_length"],
  });
  assert.deepEqual(probeRefusal(400, { error: "policy_refused", detail: "no_arc_exact" }), {
    decision: "NO_PAYMENT",
    reason: ["no_arc_exact"],
  });
  assert.deepEqual(probeRefusal(400, { error: "policy_refused", detail: "wrong_agent" }), {
    decision: "REFUSE",
    reason: ["wrong_agent"],
  });
});

test("an unreachable service is a refusal, and a priced 402 is not", () => {
  assert.deepEqual(unavailableServiceRefusal(null), { decision: "NO_PAYMENT", reason: ["service_unavailable"] });
  assert.deepEqual(unavailableServiceRefusal(503), { decision: "NO_PAYMENT", reason: ["service_unavailable"] });
  assert.equal(unavailableServiceRefusal(402), null);
  assert.equal(unavailableServiceRefusal(200), null);
});

test("a used transfer authorization is a replay, and an unused nonce is not", () => {
  const from = "136f6f23946ef71a63913c9ea59701a2c3c9f094".padStart(64, "0");
  const value = "c".padStart(64, "0");
  const nonce = "8ce404234ca27c2abef0d68ae3efeb31d70c244a7070a4ddc2ec43e1db824e76";
  const input = `0xcf092995${from}${"0".repeat(64)}${value}${"0".repeat(128)}${nonce}`;
  assert.deepEqual(spentAuthorization(input), {
    from: "0x136f6f23946ef71a63913c9ea59701a2c3c9f094",
    to: "0x0000000000000000000000000000000000000000",
    value: "12",
    nonce: `0x${nonce}`,
  });
  assert.equal(spentAuthorization("0x1234"), null);
  assert.deepEqual(replayRefusal(true), { decision: "REFUSE", reason: ["replay"] });
  assert.equal(replayRefusal(false), null);
});
