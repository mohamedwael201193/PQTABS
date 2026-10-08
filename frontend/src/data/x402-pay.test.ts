import assert from "node:assert/strict";
import test from "node:test";
import { arcExactAccept, paymentSignatureHeader, transactionFromPaymentResponse } from "./x402-pay.ts";

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
  assert.equal(transactionFromPaymentResponse(btoa(JSON.stringify({ transaction: "0x" + "cd".repeat(32) }))), "0x" + "cd".repeat(32));
  assert.equal(transactionFromPaymentResponse(btoa(JSON.stringify({ success: true }))), "");
});
