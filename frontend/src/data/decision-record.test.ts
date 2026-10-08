import assert from "node:assert/strict";
import test from "node:test";
import { decisionRecord, decisionsForRegistrar, settledDecision, type DecisionFacts } from "./decision-record.ts";

const facts = (): DecisionFacts => ({
  task: "Reply with one word: pong",
  service: "https://arcrouter.co/v1/chat/completions",
  resource: "https://arcrouter.co/v1/chat/completions",
  price: "12",
  asset: "0x3600000000000000000000000000000000000000",
  network: "eip155:5042",
  payee: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
  agent: "0x54113A5C0195821c42CB831d280A73670951166D",
  capability: "0x56377522376b5273a97313992c7970B106cB3837",
  remaining_capability_balance: "0",
  maxPerCall: "10000",
  root_exposure: "0",
  maxOpenExposure: "200000",
  expiry: "1791432461",
  decision: "REFUSE",
  reason: ["capability_inactive", "wrong_payee", "balance"],
  registrar: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
});

test("a refusal keeps the inputs and does not invent a transaction", () => {
  const record = decisionRecord(facts(), "2026-10-08T02:00:00.000Z");
  assert.equal(record.decision, "REFUSE");
  assert.deepEqual(record.reason, ["capability_inactive", "wrong_payee", "balance"]);
  assert.equal(record.txHash, "");
  assert.equal(record.receipt, null);
  assert.equal(record.result, "");
  assert.equal(record.agentId, null);
  assert.equal(record.price, "12");
  assert.equal(record.root_exposure, "0");
});

test("an allow without a receipt is not settled", () => {
  const record = decisionRecord({ ...facts(), decision: "ALLOW", reason: ["capability_active"] }, "2026-10-08T02:00:00.000Z");
  assert.equal(record.decision, "NOT_SETTLED");
  assert.deepEqual(record.reason, ["capability_active", "receipt_missing"]);
  assert.equal(record.txHash, "");
});

test("a settled allow keeps the receipt and a refusal cannot use that path", () => {
  const allowed = { ...facts(), decision: "ALLOW" as const, reason: ["capability_active"] };
  const record = settledDecision(
    allowed,
    { txHash: "0x" + "ab".repeat(32), receipt: { status: "success", blockNumber: "24623356" }, result: "pong" },
    "2026-10-08T02:00:00.000Z",
  );
  assert.equal(record.decision, "ALLOW");
  assert.equal(record.txHash, "0x" + "ab".repeat(32));
  assert.equal(record.receipt?.status, "success");
  assert.equal(record.result, "pong");
  assert.throws(() => settledDecision(facts(), { txHash: "0x" + "ab".repeat(32), receipt: { status: "success", blockNumber: "1" }, result: "pong" }, "t"));
  assert.throws(() => settledDecision(allowed, { txHash: "0xabc", receipt: { status: "success", blockNumber: "1" }, result: "pong" }, "t"));
});

test("one registrar's decision is not listed for another", () => {
  const own = decisionRecord(facts(), "2026-10-08T02:00:00.000Z");
  const other = decisionRecord({ ...facts(), registrar: "0xBDfCeE82Bd42FEfA58ee850B3709636a8B6b0034" }, "2026-10-08T02:01:00.000Z");
  const visible = decisionsForRegistrar([own, other], "0xBDFCEE82BD42FEFA58EE850B3709636A8B6B0034");
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.at, "2026-10-08T02:01:00.000Z");
});
