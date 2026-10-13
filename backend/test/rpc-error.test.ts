import assert from "node:assert/strict";
import test from "node:test";
import { isTransientRpc, withRpcRetry } from "../src/chain.js";
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

test("isTransientRpc recognises the -32014 code on an error object and in its cause", () => {
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { code: -32014 })), true);
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { cause: { code: -32014 } })), true);
  assert.equal(isTransientRpc(new Error("Details: -32014")), true);
  assert.equal(isTransientRpc(Object.assign(new Error("x"), { code: -32012 })), false);
  assert.equal(isTransientRpc(new Error("execution reverted")), false);
});
