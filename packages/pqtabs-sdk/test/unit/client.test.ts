/**
 * MOCKED unit tests for the client. The fetch and the Arc RPC are scripted, so each safety property
 * can be forced. Production proof comes from the live suite, not from these tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hex } from "viem";
import { PqtabsClient } from "../../src/client.js";
import { PolicyRefusedError, PqtabsError, RateLimitedError } from "../../src/errors.js";
import type { AgentSigner, TransferAuthorization } from "../../src/signer.js";
import { decodeSpendBlob } from "../../src/spend-blob.js";
import { MemoryAttemptStore } from "../../src/store.js";
import {
  configBody,
  decideBody,
  json,
  PAYEE,
  paymentRequired,
  QUOTE_ID,
  quoteBody,
  resultBody,
  scriptedFetch,
  scriptedReader,
  settledReceipt,
  spendBody,
  TAB,
  TX_HASH,
  testSigner,
  timeBody,
} from "../helpers.js";

const noSleep = async () => {};

function countingSigner(base: AgentSigner) {
  let signs = 0;
  const signer: AgentSigner = {
    address: base.address,
    signTransferAuthorization: async (authorization: TransferAuthorization) => {
      signs += 1;
      return base.signTransferAuthorization(authorization);
    },
  };
  return { signer, signs: () => signs };
}

function clientFor(options: {
  fetch: typeof fetch;
  reader: ReturnType<typeof scriptedReader>;
  store?: MemoryAttemptStore;
  receiptTimeoutMs?: number;
}) {
  return new PqtabsClient({
    backendUrl: "https://backend.test",
    rpcUrl: "https://rpc.test",
    fetch: options.fetch,
    receiptReader: options.reader,
    attemptStore: options.store ?? new MemoryAttemptStore(),
    sleep: noSleep,
    receiptPollMs: 1,
    receiptTimeoutMs: options.receiptTimeoutMs ?? 50,
    timeoutMs: 1_000,
  });
}

function happyRoutes(overrides: Record<string, Parameters<typeof scriptedFetch>[0][string]> = {}) {
  return {
    "GET /v1/config": () => json(200, configBody()),
    "POST /v1/research/quote": () => json(200, quoteBody()),
    "POST /v1/x402/decide": () => json(200, decideBody()),
    "GET /v1/time": () => json(200, timeBody()),
    "POST /v1/relay/spend": () => json(200, spendBody()),
    "POST /v1/research/result": () => json(200, resultBody("complete")),
    ...overrides,
  };
}

test("MOCKED happy path: quote, preflight, one signature, one relay, verified receipt, complete result", async () => {
  const base = testSigner();
  const { signer, signs } = countingSigner(base);
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]) });

  const outcome = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "What is Arc?" });

  assert.equal(outcome.status, "complete");
  if (outcome.status !== "complete") return;
  assert.equal(outcome.result, "Arc settles in USDC [S1].");
  assert.equal(outcome.txHash, TX_HASH);
  assert.equal(outcome.amountRaw, "360");
  assert.equal(outcome.payee, PAYEE);
  assert.equal(outcome.quoteId, QUOTE_ID);
  assert.equal(signs(), 1);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1);
  assert.equal(fetchMock.count("POST /v1/research/result"), 1);
});

test("MOCKED: the relayed authorization is the 213-byte blob for this payee, value, and capability", async () => {
  const base = testSigner();
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]) });
  await client.spend.research({ tab: TAB, signer: base, maxPriceRaw: "1000", task: "q" });
  const relay = fetchMock.calls.find((c) => c.path === "/v1/relay/spend");
  const body = relay?.body as { tab: string; to: string; value: string; signature: Hex };
  assert.equal(body.tab, TAB);
  assert.equal(body.to, PAYEE);
  assert.equal(body.value, "360");
  const decoded = decodeSpendBlob(body.signature);
  assert.equal(decoded.to, PAYEE);
  assert.equal(decoded.value, 360n);
  assert.equal(decoded.validAfter, 0n);
});

test("MOCKED: a backend REFUSE stops before any signature or relay, and returns the reason", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/x402/decide": () => json(200, decideBody({ decision: "REFUSE", reason: ["balance", "expired"] })) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons.join() === "balance,expired",
  );
  assert.equal(signs(), 0);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 0);
});

test("MOCKED: a signer that is not the capability agent is refused before signing", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/x402/decide": () => json(200, decideBody({ agent: "0x0000000000000000000000000000000000000009" })) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "signer_mismatch",
  );
  assert.equal(signs(), 0);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 0);
});

test("MOCKED: a price above maxPriceRaw is refused before the decision is even requested", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "100", task: "q" }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "exceeds_max_price",
  );
  assert.equal(signs(), 0);
  assert.equal(fetchMock.count("POST /v1/x402/decide"), 0);
});

test("MOCKED: a pinned expectedPayee that the quote does not pay is refused", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q", expectedPayee: "0x0000000000000000000000000000000000000005" }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "wrong_payee",
  );
  assert.equal(signs(), 0);
});

test("MOCKED: a backend on another chain is refused before anything is signed", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes({ "GET /v1/config": () => json(200, configBody(1)) }));
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "chain_mismatch",
  );
  assert.equal(signs(), 0);
});

test("MOCKED: an RPC on another chain is refused before anything is signed", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([], 11155111) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "chain_mismatch",
  );
  assert.equal(signs(), 0);
});

test("MOCKED: an RPC 429 while waiting for the receipt is not a payment failure; the receipt arrives later", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const rateLimit = new PqtabsError("rpc_rate_limited", "Arc RPC is rate limiting reads.", { status: 429, retryable: true });
  const client = clientFor({
    fetch: fetchMock.fetch,
    reader: scriptedReader([rateLimit, null, settledReceipt(360n)]),
    receiptTimeoutMs: 5_000,
  });
  const outcome = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(outcome.status, "complete");
  assert.equal(signs(), 1);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1);
});

test("MOCKED: a relay 429 sends the same authorization again and never signs a second time", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({
      "POST /v1/relay/spend": [
        () => json(429, { error: "rate_limited", detail: "Too many requests. Nothing was sent." }, { "retry-after": "1" }),
        () => json(200, spendBody()),
      ],
    }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]) });
  const outcome = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(outcome.status, "complete");
  const relays = fetchMock.calls.filter((c) => c.path === "/v1/relay/spend");
  assert.equal(relays.length, 2);
  assert.deepEqual(relays[0]?.body, relays[1]?.body, "the retry must carry the identical authorization");
  assert.equal(signs(), 1);
});

test("MOCKED: an ambiguous relay failure (503) is retried with the same authorization, so it cannot charge twice", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({
      "POST /v1/relay/spend": [() => json(503, { error: "unavailable", detail: "try again" }), () => json(200, spendBody())],
    }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]) });
  const outcome = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(outcome.status, "complete");
  assert.equal(signs(), 1);
  const relays = fetchMock.calls.filter((c) => c.path === "/v1/relay/spend");
  assert.deepEqual(relays[0]?.body, relays[1]?.body);
});

test("MOCKED: a backend policy refusal during relay is a refusal, and the stored authorization is not spent", async () => {
  const { signer } = countingSigner(testSigner());
  const store = new MemoryAttemptStore();
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/relay/spend": () => json(400, { error: "policy_refused", detail: "balance", requestId: "x" }) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]), store });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons[0] === "balance",
  );
  const stored = await store.get(QUOTE_ID);
  assert.ok(stored, "the authorization is kept for an audited retry");
  assert.equal(stored?.txHash, undefined, "nothing was broadcast, so no transaction hash exists");
});

test("MOCKED: a reverted receipt never produces a result, and the result is not even requested", async () => {
  const { signer } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([{ ...settledReceipt(360n), status: "reverted" }]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "receipt_mismatch",
  );
  assert.equal(fetchMock.count("POST /v1/research/result"), 0);
});

test("MOCKED: a receipt that is not this payment (wrong amount) never produces a result", async () => {
  const { signer } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(359n)]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "receipt_mismatch",
  );
  assert.equal(fetchMock.count("POST /v1/research/result"), 0);
});

test("MOCKED: no receipt before the deadline is settlement_pending, and resume settles without relaying again", async () => {
  const store = new MemoryAttemptStore();
  const base = testSigner();
  const { signer, signs } = countingSigner(base);
  const fetchMock = scriptedFetch(happyRoutes());

  const first = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([null]), store, receiptTimeoutMs: 5 });
  const pending = await first.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(pending.status, "settlement_pending");
  if (pending.status !== "settlement_pending") return;
  assert.equal(pending.txHash, TX_HASH);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1);

  const second = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]), store });
  const resumed = await second.spend.resume({ quoteId: QUOTE_ID, tab: TAB });
  assert.equal(resumed.status, "complete");
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1, "resume must not relay or pay again");
  assert.equal(signs(), 1, "resume must not sign again");
});

test("MOCKED: a second paid run for the same quote reuses the stored authorization and does not pay twice", async () => {
  const store = new MemoryAttemptStore();
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n), settledReceipt(360n)]), store });
  const quote = paymentRequired("360");
  const first = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", paymentRequired: quote });
  const second = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", paymentRequired: quote });
  assert.equal(first.status, "complete");
  assert.equal(second.status, "complete");
  assert.equal(signs(), 1);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1);
});

test("MOCKED: a result that is still pending is returned as result_pending, and recovery later does not charge", async () => {
  const { signer } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/research/result": [() => json(200, resultBody("result_pending")), () => json(200, resultBody("complete"))] }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n), settledReceipt(360n)]) });
  const pending = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(pending.status, "result_pending");
  const recovered = await client.research.recoverResult({
    quoteId: QUOTE_ID,
    txHash: TX_HASH,
    tab: TAB,
    payee: PAYEE,
    valueRaw: "360",
  });
  assert.equal(recovered.status, "complete");
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1, "recovery never relays");
});

test("MOCKED: when the answer fetch fails after a matched receipt, the run reports result_pending, not a failure", async () => {
  const { signer } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/research/result": () => json(503, { error: "unavailable", detail: "model is down" }) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([settledReceipt(360n)]) });
  const outcome = await client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" });
  assert.equal(outcome.status, "result_pending");
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 1);
});

test("MOCKED: an authorization whose deadline has already passed is not relayed", async () => {
  const store = new MemoryAttemptStore();
  const { signer } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(happyRoutes({ "POST /v1/relay/spend": () => json(200, spendBody()) }));
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]), store });
  // Store an attempt whose validBefore is in the past, as a stale resume would find it.
  await store.put({
    quoteId: QUOTE_ID,
    tab: TAB,
    payee: PAYEE,
    value: "360",
    validBefore: "1",
    nonce: `0x${"42".repeat(32)}`,
    authorization: `0x${"00".repeat(213)}`,
    signerAddress: signer.address,
    paymentRequired: paymentRequired("360"),
    createdAt: new Date().toISOString(),
  });
  await assert.rejects(
    client.spend.resume({ quoteId: QUOTE_ID, tab: TAB }),
    (error: unknown) => error instanceof PqtabsError && error.code === "authorization_expired",
  );
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 0);
});

test("MOCKED: a capability that expires too soon is refused before signing", async () => {
  const { signer, signs } = countingSigner(testSigner());
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/x402/decide": () => json(200, decideBody({ expiry: String(Math.floor(Date.now() / 1000) + 3) })) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.research({ tab: TAB, signer, maxPriceRaw: "1000", task: "q" }),
    (error: unknown) => error instanceof PqtabsError && error.code === "authorization_expired",
  );
  assert.equal(signs(), 0);
});

test("MOCKED: resume of an unknown quote says so and does not sign or relay", async () => {
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.spend.resume({ quoteId: "00000000-0000-4000-8000-000000000000", tab: TAB }),
    (error: unknown) => error instanceof PqtabsError && error.code === "attempt_not_found",
  );
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 0);
});

test("MOCKED: a backend response with a missing field is a schema mismatch, not a guess", async () => {
  const fetchMock = scriptedFetch(happyRoutes({ "POST /v1/x402/decide": () => json(200, { decision: "ALLOW" }) }));
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(
    client.research.checkPolicy({ tab: TAB, paymentRequired: paymentRequired("360") }),
    (error: unknown) => error instanceof PqtabsError && error.code === "schema_mismatch",
  );
});

test("MOCKED: checkPolicy returns REFUSE and its reasons without throwing, and moves no money", async () => {
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/x402/decide": () => json(200, decideBody({ decision: "REFUSE", reason: ["capability_inactive"] })) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  const result = await client.research.checkPolicy({ tab: TAB, paymentRequired: paymentRequired("360") });
  assert.equal(result.allowed, false);
  assert.deepEqual(result.reasons, ["capability_inactive"]);
  assert.equal(fetchMock.count("POST /v1/relay/spend"), 0);
});

test("MOCKED: a quote id that does not match its price is refused as invalid", async () => {
  const fetchMock = scriptedFetch(
    happyRoutes({ "POST /v1/research/quote": () => json(200, { ...quoteBody(), quoteId: "11111111-1111-4111-8111-111111111111" }) }),
  );
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(client.research.quote("q"), (error: unknown) => error instanceof PqtabsError && error.code === "quote_invalid");
});

test("MOCKED: a hung backend times out as a retryable error, not a payment", async () => {
  const hangingFetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })) as unknown as typeof fetch;
  const client = new PqtabsClient({
    backendUrl: "https://backend.test",
    fetch: hangingFetch,
    receiptReader: scriptedReader([]),
    sleep: noSleep,
    timeoutMs: 20,
  });
  await assert.rejects(client.read.health(), (error: unknown) => error instanceof PqtabsError && error.code === "timeout" && error.retryable);
});

test("MOCKED: a cancelled call is reported as aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchMock = scriptedFetch(happyRoutes());
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(client.read.health({ signal: controller.signal }), (error: unknown) => error instanceof PqtabsError && error.code === "aborted");
});

test("MOCKED: a plain-http backend is refused unless it is localhost", () => {
  assert.throws(() => new PqtabsClient({ backendUrl: "http://example.com" }), (error: unknown) => error instanceof PqtabsError && error.code === "invalid_config");
  assert.doesNotThrow(() => new PqtabsClient({ backendUrl: "http://localhost:8080" }));
});

test("MOCKED: a rate-limit error from a read carries the wait", async () => {
  const fetchMock = scriptedFetch({ "GET /health": () => json(429, { error: "rate_limited", detail: "wait" }, { "retry-after": "7" }) });
  const client = clientFor({ fetch: fetchMock.fetch, reader: scriptedReader([]) });
  await assert.rejects(client.read.health(), (error: unknown) => error instanceof RateLimitedError && error.retryAfterSeconds === 7);
});
