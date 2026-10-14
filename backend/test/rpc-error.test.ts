import assert from "node:assert/strict";
import test from "node:test";
import { fallbackRpcUrls, feeOrFloor, gasLimitForRelay, indexedNonceDecision, isTransientRpc, RELAY_GAS_CEILING, readOnArc, relayerCanCover, scanFailureRoots, withRpcRetry } from "../src/chain.js";
import { RequestError } from "../src/validate.js";

test("one rate-limited Arc read becomes a retry sentence", async () => {
  await assert.rejects(
    () => withRpcRetry(async () => {
      throw new Error("HTTP request failed. Status: 429");
    }, 1),
    (error: unknown) => error instanceof RequestError && error.status === 429 && error.message === "Arc is rate limiting reads. Try again in a moment.",
  );
});

test("a -32014 head read (load-balanced node not yet at the block) is retried with backoff and then succeeds", async () => {
  let calls = 0;
  const value = await withRpcRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("Internal error"), { code: -32014 });
    return "block";
  }, 8);
  assert.equal(value, "block");
  assert.equal(calls, 3);
});

test("an exhausted -32014 read becomes a 503 rpc_unavailable, not a payment decision", async () => {
  await assert.rejects(
    () => withRpcRetry(async () => {
      throw new Error("RPC Request failed. Details: -32014 block not imported");
    }, 1),
    (error: unknown) =>
      error instanceof RequestError &&
      error.status === 503 &&
      error.code === "rpc_unavailable" &&
      /Nothing was decided/.test(error.message),
  );
});

test("a non-transient RPC error is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRpcRetry(async () => {
      calls += 1;
      throw new Error("execution reverted");
    }, 8),
    /execution reverted/,
  );
  assert.equal(calls, 1);
});

test("a failed live root scan keeps indexed roots and otherwise stays a typed Arc error", () => {
  const indexed = ["0x44502F6d18DAA9620c2BB3da21b8C3C8033A9787"] as const;
  assert.deepEqual(scanFailureRoots(indexed, new Error("HTTP request failed. Status: 429")), [...indexed]);
  assert.throws(
    () => scanFailureRoots([], new Error("socket hang up")),
    (error: unknown) => error instanceof RequestError && error.status === 503 && /temporarily unavailable/.test(error.message),
  );
  const limited = new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
  assert.throws(() => scanFailureRoots([], limited), (error: unknown) => error === limited);
});

test("isTransientRpc recognises the -32014 code on an error object and in its cause", () => {
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { code: -32014 })), true);
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { cause: { code: -32014 } })), true);
  assert.equal(isTransientRpc(new Error("Details: -32014")), true);
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { code: -32012 })), false);
  assert.equal(isTransientRpc(new Error("execution reverted")), false);
});

test("a rate-limited gas estimate uses the next Arc endpoint, and a revert is not sent", async () => {
  assert.deepEqual(fallbackRpcUrls("https://rpc.drpc.mainnet.arc.io/"), [
    "https://rpc.blockdaemon.mainnet.arc.io",
    "https://rpc.quicknode.mainnet.arc.io",
  ]);
  let primary = 0;
  const gas = await gasLimitForRelay([
    async () => {
      primary += 1;
      throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
    },
    async () => 636_789n,
  ]);
  assert.equal(gas, 636_789n);
  assert.equal(primary, 2);
  await assert.rejects(
    () => gasLimitForRelay([async () => {
      throw new Error("execution reverted");
    }]),
    (error: unknown) => error instanceof Error && error.message === "execution reverted",
  );
});

test("the relayer must cover the gas limit at the 20 gwei floor", () => {
  const balance = 7_674_388_778_742_466n;
  const floor = 20_000_000_000n;
  assert.equal(relayerCanCover(balance, 383_719n, floor), true);
  assert.equal(relayerCanCover(balance, 636_789n, floor), false);
  assert.equal(relayerCanCover(balance, RELAY_GAS_CEILING, floor), false);
});

test("an indexed nonce sends only when it matches the signature", () => {
  assert.equal(indexedNonceDecision(10n, 10n), "send");
  assert.equal(indexedNonceDecision(9n, 10n), "consumed");
  assert.equal(indexedNonceDecision(11n, 10n), "mismatch");
  assert.equal(indexedNonceDecision(10n, null), "unknown");
});

test("a rate-limited root read uses the next public endpoint and a revert does not", async () => {
  let primary = 0;
  const value = await readOnArc(
    async () => {
      primary += 1;
      throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
    },
    async () => "ok",
    1,
  );
  assert.equal(value, "ok");
  assert.equal(primary, 1);
  await assert.rejects(
    () => readOnArc(async () => {
      throw new Error("execution reverted");
    }, async () => "ok", 1),
    (error: unknown) => error instanceof Error && error.message === "execution reverted",
  );
});

test("every rate-limited estimate uses the measured gas ceiling and the 20 gwei floor", async () => {
  const gas = await gasLimitForRelay([
    async () => {
      throw new RequestError(429, "rate_limited", "HTTP 429");
    },
  ]);
  assert.equal(gas, RELAY_GAS_CEILING);
  const prices = await feeOrFloor([
    async () => {
      throw new RequestError(429, "rate_limited", "HTTP 429");
    },
  ]);
  assert.equal(prices.maxFeePerGas, 20_000_000_000n);
});
