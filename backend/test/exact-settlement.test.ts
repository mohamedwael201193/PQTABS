import assert from "node:assert/strict";
import test from "node:test";
import { USDC } from "../src/constants.js";
import { checkSettlement, exactAccept, exactPayer, type SettlementReport, settleWithFacilitator } from "../src/index/exact-settlement.js";

const expected = {
  quoteId: "11111111-1111-4111-8111-111111111111",
  payee: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  amount: "360",
  expiresAt: 1_000,
  now: 900,
};

function report(over: Partial<SettlementReport> = {}): SettlementReport {
  return {
    status: "completed",
    network: "eip155:5042",
    asset: USDC,
    payee: expected.payee,
    amount: "360",
    txHash: `0x${"ab".repeat(32)}`,
    quoteId: expected.quoteId,
    ...over,
  };
}

test("an exact accept names Arc mainnet, USDC, and the quote", () => {
  const row = exactAccept({
    id: expected.quoteId,
    bodyHash: `0x${"11".repeat(32)}`,
    price: "360",
    payee: expected.payee,
    ttlSeconds: 600,
  });
  assert.equal(row.scheme, "exact");
  assert.equal(row.network, "eip155:5042");
  assert.equal(row.asset, USDC);
  assert.equal(row.amount, "360");
  assert.equal(row.extra.quoteId, expected.quoteId);
  assert.equal(row.extra.assetTransferMethod, "eip3009");
  const payload = {
    x402Version: 2,
    payload: { authorization: { from: "0x5C7a54eEaF29310E758Fc6f010eCE827897D183e", to: row.payTo, value: row.amount } },
  };
  assert.equal(exactPayer(payload, row), "0x5C7a54eEaF29310E758Fc6f010eCE827897D183e");
  assert.equal(exactPayer(payload, { ...row, amount: "1" }), null);
});

test("settle posts verify and then settle, and a rejected verify does not settle", async () => {
  const row = exactAccept({
    id: expected.quoteId,
    bodyHash: `0x${"11".repeat(32)}`,
    price: "360",
    payee: expected.payee,
    ttlSeconds: 600,
  });
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/verify")) {
      return new Response(JSON.stringify({ isValid: true, payer: "0x5C7a54eEaF29310E758Fc6f010eCE827897D183e" }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, transaction: `0x${"ab".repeat(32)}`, payer: "0xabc" }), { status: 200 });
  };
  const settled = await settleWithFacilitator(row, { payload: {} }, fetchImpl, { X402_EXACT_FACILITATOR: "https://facilitator.example" });
  assert.equal(settled.ok, true);
  assert.deepEqual(calls, ["https://facilitator.example/verify", "https://facilitator.example/settle"]);
  const refused = await settleWithFacilitator(
    row,
    { payload: {} },
    async () => new Response(JSON.stringify({ isValid: false, invalidReason: "invalid_exact_evm_signature" }), { status: 200 }),
    { X402_EXACT_FACILITATOR: "https://facilitator.example" },
  );
  assert.deepEqual(refused, { ok: false, reason: "invalid_exact_evm_signature" });
});

test("a matching settlement is accepted once", () => {
  const seen = new Set<string>();
  const first = checkSettlement(expected, report(), seen);
  assert.equal(first.ok, true);
  seen.add(report().txHash.toLowerCase());
  const again = checkSettlement(expected, report(), seen);
  assert.deepEqual(again, { ok: false, reason: "replay" });
});

test("settlement mismatches are refused", () => {
  const seen = new Set<string>();
  assert.deepEqual(checkSettlement(expected, report({ status: "failed" }), seen), { ok: false, reason: "failed" });
  assert.deepEqual(checkSettlement(expected, report({ network: "eip155:8453" }), seen), { ok: false, reason: "wrong_network" });
  assert.deepEqual(checkSettlement(expected, report({ asset: "0x0000000000000000000000000000000000000001" }), seen), { ok: false, reason: "wrong_asset" });
  assert.deepEqual(checkSettlement(expected, report({ payee: "0x00000000000000000000000000000000000000b1" }), seen), { ok: false, reason: "wrong_payee" });
  assert.deepEqual(checkSettlement(expected, report({ amount: "359" }), seen), { ok: false, reason: "underpayment" });
  assert.deepEqual(checkSettlement(expected, report({ quoteId: "22222222-2222-4222-8222-222222222222" }), seen), { ok: false, reason: "wrong_quote" });
  assert.deepEqual(checkSettlement(expected, report({ txHash: "0x1234" }), seen), { ok: false, reason: "bad_tx" });
  assert.deepEqual(checkSettlement({ ...expected, now: 2_000 }, report(), seen), { ok: false, reason: "expired" });
});
