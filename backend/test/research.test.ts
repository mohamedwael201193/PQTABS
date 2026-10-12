import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  askGroq,
  buildResearchQuote,
  dedicatedPayee,
  oneUsdcTransfer,
  parseBarkeepPayment,
  quoteAgrees,
  RESEARCH_SYSTEM_PROMPT,
  researchBodyHash,
  researchDelivery,
  researchTariff,
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
  assert.equal(built.paymentRequired.accepts[0].extra.provider, "Groq");
  assert.equal(built.paymentRequired.accepts[0].extra.maxTokens, 400);
  assert.equal(researchTariff({}), 360n);
  const parsed = parseBarkeepPayment(built.paymentRequired);
  assert.equal(parsed?.quoteId, built.id);
  assert.equal(parsed?.price, "32");
  assert.equal(parseBarkeepPayment({ ...built.paymentRequired, scheme: "exact", standardExact: true, accepts: [{ ...built.paymentRequired.accepts[0], scheme: "exact" }] }), null);
});

test("the relayer and the zero address are not a merchant", () => {
  const root = "0x2d0FdFafCC7E46226D3db00Ae976aA8F53996b95";
  const registrar = "0xd462cc45b06Ae45daCd93F7B3979758C7b4a2cc0";
  const compromised = "0x18398aA1dFdA63F30529c46E90ac41c1E75F7Ecf";
  const merchant = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
  assert.equal(dedicatedPayee(undefined, []), null);
  assert.equal(dedicatedPayee("0x0000000000000000000000000000000000000000", []), null);
  assert.equal(dedicatedPayee(RELAYER, [RELAYER]), null);
  assert.equal(dedicatedPayee(root, [root, registrar, compromised]), null);
  assert.equal(dedicatedPayee(registrar, [root, registrar, compromised]), null);
  assert.equal(dedicatedPayee(compromised, [root, registrar, compromised]), null);
  assert.equal(dedicatedPayee(merchant, [RELAYER, root, registrar, compromised]), getAddress(merchant));
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

test("a missing key, a provider error, or an empty completion is not an answer", async () => {
  let called = 0;
  const blocked = await askGroq("What is Arc?", {}, async () => {
    called += 1;
    return new Response("no");
  });
  assert.equal(blocked.text, "");
  assert.equal(called, 0);
  const denied = await askGroq("What is Arc?", { GROQ_API_KEY: "present", GROQ_MODEL: "openai/gpt-oss-120b" }, async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
  assert.equal(denied.text, "");
  const empty = await askGroq("What is Arc?", { GROQ_API_KEY: "present" }, async () => new Response(JSON.stringify({ choices: [{ message: { content: "  " } }] }), { status: 200 }));
  assert.equal(empty.text, "");
  const answered = await askGroq("What is Arc?", { GROQ_API_KEY: "present", GROQ_BASE_URL: "https://api.groq.com/openai/v1" }, async (_url, init) => {
    const header = new Headers(init?.headers).get("authorization") ?? "";
    assert.equal(header.startsWith("Bearer "), true);
    assert.equal(header.includes("present"), true);
    return new Response(JSON.stringify({ model: "openai/gpt-oss-120b", choices: [{ message: { content: "Arc mainnet chain ID is 5042 [S1]." } }] }), { status: 200 });
  });
  assert.equal(answered.text, "Arc mainnet chain ID is 5042 [S1].");
  assert.equal(answered.model, "openai/gpt-oss-120b");
});

test("the Groq request carries the verified Arc facts, the user task, the token cap, and low reasoning effort", async () => {
  const sent: { messages: { role: string; content: string }[]; max_tokens: number; reasoning_effort: string; model: string }[] = [];
  await askGroq("Is Arc proof of stake?", { GROQ_API_KEY: "present" }, async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: "No. Arc uses Malachite BFT [S4]." } }] }), { status: 200 });
  });
  assert.equal(sent.length, 1);
  const body = sent[0];
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[0].content, RESEARCH_SYSTEM_PROMPT);
  assert.match(body.messages[0].content, /Malachite/);
  assert.match(body.messages[0].content, /Proof-of-Authority validator set/);
  assert.match(body.messages[0].content, /\[S8\] \(NOT live\)/);
  assert.match(body.messages[0].content, /USDC is the native gas token/);
  assert.equal(body.messages[1].role, "user");
  assert.equal(body.messages[1].content, "Is Arc proof of stake?");
  assert.equal(body.max_tokens, 400);
  assert.equal(body.reasoning_effort, "low");
});
