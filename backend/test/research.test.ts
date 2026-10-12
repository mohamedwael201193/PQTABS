import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  buildResearchQuote,
  dedicatedPayee,
  oneUsdcTransfer,
  parseBarkeepPayment,
  quoteAgrees,
  researchBodyHash,
  researchDelivery,
} from "../src/index/research.js";
import { openQuote, rememberQuote, saveDelivery } from "../src/index/research-store.js";
import { openMemory } from "../src/index/sql.js";

const PAYEE = getAddress("0x1111111111111111111111111111111111111111");
const RELAYER = "0x5C7a54eEaF29310E758Fc6f010eCE827897D183e";
const TAB = "0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321";
const NOW = 1_700_000_000;

function quote() {
  return buildResearchQuote({
    id: "11111111-1111-4111-8111-111111111111",
    task: "What does Arc settlement mean?",
    payee: PAYEE,
    price: 32n,
    now: NOW,
    resourceUrl: "https://pqtabs.onrender.com/v1/research",
  });
}

function log(from: string, to: string, value: bigint, address = "0x3600000000000000000000000000000000000000") {
  return {
    address,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      `0x${from.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`,
      `0x${to.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`,
    ],
    data: `0x${value.toString(16).padStart(64, "0")}`,
  };
}

test("a barkeep quote names the merchant, the tariff, and not the exact scheme", () => {
  const built = quote();
  assert.equal(built.paymentRequired.scheme, "pqtabs-barkeep");
  assert.equal(built.paymentRequired.standardExact, false);
  assert.equal(built.paymentRequired.accepts[0].scheme, "pqtabs-barkeep");
  assert.equal(built.paymentRequired.accepts[0].amount, "32");
  assert.equal(built.paymentRequired.accepts[0].payTo, PAYEE);
  assert.equal(built.paymentRequired.accepts[0].extra.tariff, true);
  assert.equal(built.paymentRequired.accepts[0].extra.maxTokens, 400);
  const parsed = parseBarkeepPayment(built.paymentRequired);
  assert.equal(parsed?.quoteId, built.id);
  assert.equal(parsed?.price, "32");
  assert.equal(parseBarkeepPayment({ ...built.paymentRequired, scheme: "exact", standardExact: true, accepts: [{ ...built.paymentRequired.accepts[0], scheme: "exact" }] }), null);
});

test("the relayer and the zero address are not a merchant", () => {
  assert.equal(dedicatedPayee(undefined, []), null);
  assert.equal(dedicatedPayee("0x0000000000000000000000000000000000000000", []), null);
  assert.equal(dedicatedPayee(RELAYER, [RELAYER]), null);
  assert.equal(dedicatedPayee(PAYEE, [RELAYER]), PAYEE);
});

test("a changed price, payee, or expired quote does not agree", () => {
  const built = quote();
  const parsed = parseBarkeepPayment(built.paymentRequired);
  assert.ok(parsed);
  const stored = { price: built.price, payee: built.payee, body_hash: built.bodyHash, expires_at: String(built.expiresAt) };
  assert.equal(quoteAgrees(stored, parsed, PAYEE, "32", NOW + 10), "ok");
  assert.equal(quoteAgrees(stored, parsed, PAYEE, "31", NOW + 10), "quote_mismatch");
  assert.equal(quoteAgrees(stored, parsed, RELAYER, "32", NOW + 10), "quote_mismatch");
  assert.equal(quoteAgrees({ ...stored, body_hash: researchBodyHash("other", "32", PAYEE, 400) }, parsed, PAYEE, "32", NOW + 10), "quote_mismatch");
  assert.equal(quoteAgrees(stored, parsed, PAYEE, "32", built.expiresAt), "quote_expired");
});

test("one 6-decimal transfer matches, and the native twin or a revert does not", () => {
  const native = "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE";
  const good = { status: "success", logs: [log(TAB, PAYEE, 32n), log(TAB, PAYEE, 32n * 10n ** 12n, native)] };
  assert.equal(oneUsdcTransfer(good, { from: TAB, to: PAYEE, value: "32" }), true);
  assert.equal(oneUsdcTransfer({ status: "success", logs: [log(RELAYER, PAYEE, 32n)] }, { from: TAB, to: PAYEE, value: "32" }), false);
  assert.equal(oneUsdcTransfer({ status: "reverted", logs: [log(TAB, PAYEE, 32n)] }, { from: TAB, to: PAYEE, value: "32" }), false);
  assert.equal(oneUsdcTransfer({ status: "success", logs: [log(TAB, PAYEE, 32n), log(TAB, PAYEE, 32n)] }, { from: TAB, to: PAYEE, value: "32" }), false);
});

test("an empty model response stays pending and the same open quote is reused", async () => {
  assert.equal(researchDelivery(true, ""), "result_pending");
  assert.equal(researchDelivery(true, "Arc mainnet is live."), "complete");
  assert.equal(researchDelivery(false, "text"), "unpaid");
  const sql = await openMemory();
  const built = quote();
  await rememberQuote(sql, built);
  await rememberQuote(sql, built);
  const again = await openQuote(sql, built.bodyHash, NOW + 10);
  assert.equal(again?.id, built.id);
  await saveDelivery(sql, built.id, `0x${"ab".repeat(32)}`, "result_pending", "", "");
  const pending = await openQuote(sql, built.bodyHash, NOW + 10);
  assert.equal(pending, null);
  await sql.close();
});
