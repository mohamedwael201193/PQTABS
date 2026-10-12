import assert from "node:assert/strict";
import test from "node:test";
import type { DecisionRecord } from "./decision-record.ts";
import { savedPaymentRecord } from "./saved-payment.ts";

const settled = (): DecisionRecord => ({
  task: "Summarize settlement",
  service: "Pollinations / gpt-oss-20b",
  resource: "https://arcrouter.co/v1/chat/completions",
  price: "32",
  asset: "0x3600000000000000000000000000000000000000",
  network: "eip155:5042",
  payee: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
  agent: "0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865",
  capability: "0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321",
  remaining_capability_balance: "10000",
  maxPerCall: "10000",
  root_exposure: "10000",
  maxOpenExposure: "10000",
  expiry: "1792370500",
  decision: "ALLOW",
  reason: ["capability_active"],
  registrar: "0xd462cc45b06Ae45daCd93F7B3979758C7b4a2cc0",
  agentId: null,
  txHash: "0x1352cc1963ee0e62c0c04ff634412c4257327755a9d5cf58eefe113d14b2e4a5",
  receipt: { status: "success", blockNumber: "25501696" },
  result: "Settled.",
  charge: "32",
  at: "2026-10-12T01:10:00.000Z",
});

test("a settled decision becomes one spend row", () => {
  const row = savedPaymentRecord(settled(), Date.parse("2026-10-12T02:10:00.000Z"));
  assert.equal(row?.kind, "payment");
  assert.equal(row?.amountUsd, 0.000032);
  assert.match(row?.summary ?? "", /0\.000032 USDC to ArcRouter/);
  assert.equal(row?.hoursAgo, 1);
});

test("a refusal is not a payment", () => {
  assert.equal(savedPaymentRecord({ ...settled(), decision: "NOT_SETTLED", txHash: "" }), null);
});
