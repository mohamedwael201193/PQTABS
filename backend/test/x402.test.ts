import assert from "node:assert/strict";
import test from "node:test";
import { arcPaymentAccept, decideHttpPayment, readSettlement, readVerify } from "../src/index/x402.js";
import type { SpendFacts } from "../src/index/decide.js";

/** Captured 2026-10-08 from HTTP 402 on https://arcrouter.co/v1/chat/completions. Header matched this body. */
const quoted = {
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: {
    url: "https://arcrouter.co/v1/chat/completions",
    description: "ArcRouter llama-3.3-70b-instruct inference, pay per call. The amount is a ceiling for this request (full input plus max_tokens of output). The unused part is refunded to the payer.",
    mimeType: "application/json",
  },
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
  extensions: {},
};

const floor = {
  ...quoted,
  accepts: quoted.accepts.map((item) => (item.network === "eip155:5042" ? { ...item, amount: "4" } : item)),
};

const facts = (): Omit<SpendFacts, "amount" | "payee" | "serviceAvailable"> => ({
  now: 100n,
  signer: "0x54113A5C0195821c42CB831d280A73670951166D",
  tabAgent: "0x54113A5C0195821c42CB831d280A73670951166D",
  payees: ["0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9"],
  maxPerCall: 10n,
  balance: 100n,
  expiry: 200n,
  open: true,
});

test("the live Arc quote is the only price, and that price can refuse the payment", () => {
  const ceiling = decideHttpPayment(402, quoted, facts());
  assert.equal(ceiling.decision, "REFUSE");
  assert.equal(ceiling.reason.includes("max_per_call"), true);
  assert.equal(ceiling.price, "12");
  assert.equal(ceiling.network, "eip155:5042");
  assert.equal(ceiling.payee, "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9");
  assert.equal(ceiling.resource, "https://arcrouter.co/v1/chat/completions");

  const smaller = decideHttpPayment(402, floor, facts());
  assert.equal(smaller.decision, "ALLOW");
  assert.equal(smaller.price, "4");
});

test("a merchant outside the capability is refused, and a non-402 is not a price", () => {
  const wrong = decideHttpPayment(402, quoted, {
    ...facts(),
    maxPerCall: 100n,
    payees: ["0xC485B657C140C9677846f3E9ca6a3158e5623044"],
  });
  assert.equal(wrong.decision, "REFUSE");
  assert.equal(wrong.reason.includes("wrong_payee"), true);

  const down = decideHttpPayment(403, quoted, facts());
  assert.equal(down.decision, "NO_PAYMENT");
  assert.deepEqual(down.reason, ["service_unavailable"]);
  assert.equal(down.price, "");

  const baseOnly = { ...quoted, accepts: [quoted.accepts[1]] };
  const missing = decideHttpPayment(402, baseOnly, facts());
  assert.equal(missing.decision, "NO_PAYMENT");
  assert.deepEqual(missing.reason, ["no_arc_exact"]);
});

test("a facilitator verify is not a settlement", () => {
  assert.deepEqual(readVerify({ isValid: false, invalidReason: "invalid_exact_evm_signature" }).reason, ["invalid_exact_evm_signature"]);
  assert.deepEqual(readVerify({ isValid: false, invalidReason: "invalid_exact_evm_token_name_mismatch" }).reason, ["invalid_exact_evm_token_name_mismatch"]);
  assert.deepEqual(readVerify({ isValid: true, payer: "0x56377522376b5273a97313992c7970B106cB3837" }).reason, ["verify_is_not_settlement"]);
  assert.equal(readSettlement({ success: false, errorReason: "invalid_exact_evm_signature", transaction: "" }).decision, "NO_PAYMENT");
  assert.equal(readSettlement({ success: true, transaction: "0x" + "ab".repeat(32) }).decision, "ALLOW");
  assert.equal(readVerify({ isValid: false, invalidReason: "invalid_exact_evm_insufficient_balance" }).decision, "NO_PAYMENT");
});

test("the Arc accept carries the EIP-3009 method the facilitator requires", () => {
  const accept = arcPaymentAccept(quoted);
  assert.ok(accept);
  const extra = accept.extra as { name: string; version: string; assetTransferMethod: string };
  assert.equal(extra.name, "USDC");
  assert.equal(extra.version, "2");
  assert.equal(extra.assetTransferMethod, "eip3009");
  assert.equal(accept.amount, "12");
  assert.equal(accept.network, "eip155:5042");
  assert.equal(arcPaymentAccept({ ...quoted, accepts: [quoted.accepts[1]] }), null);
});
