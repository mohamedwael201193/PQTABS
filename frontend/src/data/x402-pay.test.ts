import assert from "node:assert/strict";
import test from "node:test";
import { agentCanSign, arcExactAccept, chainExpirySeconds, payeeLabel, paymentDeadline, paymentSignatureHeader, quotedCharge, receiptSettlesSpend, serviceAnswer, servicePayee, serviceTimeoutSeconds, settlementFailure, transactionFromPaymentResponse } from "./x402-pay.ts";

const quoted = {
  x402Version: 2,
  resource: { url: "https://arcrouter.co/v1/chat/completions", mimeType: "application/json" },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:5042",
      asset: "0x3600000000000000000000000000000000000000",
      amount: "12",
      payTo: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
    {
      scheme: "exact",
      network: "eip155:8453",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      amount: "12",
      payTo: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ],
};

test("the payment header names the Arc accept and the EIP-3009 method", () => {
  const header = paymentSignatureHeader(
    quoted,
    {
      from: "0x56377522376b5273a97313992c7970B106cB3837",
      to: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
      value: "12",
      validAfter: "0",
      validBefore: "1893456000",
      nonce: "0x" + "11".repeat(32),
    },
    "0x" + "ab".repeat(213),
  );
  const payload = JSON.parse(atob(header));
  assert.equal(payload.accepted.network, "eip155:5042");
  assert.equal(payload.accepted.extra.assetTransferMethod, "eip3009");
  assert.equal(payload.accepted.extra.name, "USDC");
  assert.equal(payload.accepted.amount, "12");
  assert.equal(payload.payload.authorization.from, "0x56377522376b5273a97313992c7970B106cB3837");
  assert.equal(payload.payload.signature.length, 2 + 213 * 2);
  assert.equal(arcExactAccept({ accepts: [quoted.accepts[1]] }), null);
  assert.equal(servicePayee(quoted), "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9");
  assert.equal(servicePayee({ accepts: [quoted.accepts[1]] }), null);
  assert.equal(quotedCharge("4"), "4");
  assert.equal(quotedCharge(" 12 "), "12");
  assert.equal(quotedCharge("12.5"), "");
  assert.equal(quotedCharge(null), "");
  assert.equal(transactionFromPaymentResponse(btoa(JSON.stringify({ transaction: "0x" + "cd".repeat(32) }))), "0x" + "cd".repeat(32));
  assert.equal(transactionFromPaymentResponse(btoa(JSON.stringify({ success: true }))), "");
  assert.equal(settlementFailure({ error: "invalid_exact_evm_signature", code: "verify_invalid" }), "The service did not settle the payment (invalid_exact_evm_signature). No Arc transaction was recorded.");
  assert.equal(settlementFailure({}), "The service did not settle the payment. No Arc transaction was recorded.");
  const from = "0x56377522376b5273a97313992c7970B106cB3837";
  const to = "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9";
  const log = {
    address: "0x3600000000000000000000000000000000000000",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x" + from.slice(2).toLowerCase().padStart(64, "0"),
      "0x" + to.slice(2).toLowerCase().padStart(64, "0"),
    ],
    data: "0x" + (12).toString(16).padStart(64, "0"),
  };
  const native = { ...log, address: "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE", data: "0x" + (12n * 10n ** 12n).toString(16).padStart(64, "0") };
  assert.equal(receiptSettlesSpend({ status: "success", logs: [log, native] }, { from, to, value: "12" }), true);
  assert.equal(receiptSettlesSpend({ status: "success", logs: [log, log, native] }, { from, to, value: "12" }), false);
  assert.equal(receiptSettlesSpend({ status: "success", logs: [native] }, { from, to, value: "12" }), false);
  assert.equal(receiptSettlesSpend({ status: "reverted", logs: [log] }, { from, to, value: "12" }), false);
  assert.equal(receiptSettlesSpend({ status: "success", logs: [{ ...log, data: "0x" + (24).toString(16).padStart(64, "0") }] }, { from, to, value: "12" }), false);
  assert.equal(agentCanSign("0x074D8F70cbF4B77b0f8BAb13f40c5461eb7C096B", "0x074d8f70cbf4b77b0f8bab13f40c5461eb7c096b"), true);
  assert.equal(agentCanSign("0x074D8F70cbF4B77b0f8BAb13f40c5461eb7C096B", "0x54113A5C0195821c42CB831d280A73670951166D"), false);
  assert.equal(agentCanSign("0x074D8F70cbF4B77b0f8BAb13f40c5461eb7C096B", ""), false);
  assert.equal(chainExpirySeconds("1893456000"), 1893456000);
  assert.throws(() => chainExpirySeconds(""), /could not be read/);
  assert.throws(() => chainExpirySeconds("12.5"), /could not be read/);
  assert.equal(serviceTimeoutSeconds(quoted), 60);
  assert.equal(paymentDeadline(1_000, 9_000, 60), 1_060);
  assert.equal(paymentDeadline(1_000, 1_030, 60), 1_030);
  assert.throws(() => paymentDeadline(1_000, 1_005, 60), /expires too soon/);
  assert.throws(() => paymentDeadline(1_000, 9_000, 0), /usable payment window/);
  assert.equal(serviceAnswer(402, quoted), "");
  assert.equal(serviceAnswer(200, { error: "payment required", accepts: [] }), "");
  assert.equal(serviceAnswer(200, { choices: [{ message: { content: "pong" } }] }), "pong");
  assert.equal(serviceAnswer(200, { choices: [{ message: { content: "  " } }] }), "");
  assert.deepEqual(payeeLabel("0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9"), { name: "ArcRouter", category: "Service" });
  assert.equal(payeeLabel("0x0000000000000000000000000000000000000001").category, "Infrastructure");
});
