import assert from "node:assert/strict";
import test from "node:test";
import { awaitReceipt, isNotYetMined, isTransientRpcError, ReceiptPendingError } from "./receipt.ts";

const HASH = `0x${"ab".repeat(32)}` as const;

/** A fake clock: sleeping advances time, so deadlines behave without real waiting. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
    sleeps,
  };
}

function rpcCatchingUp() {
  return Object.assign(new Error("RPC Request failed.\n\nDetails: The node is catching up\nCode: -32014"), {
    name: "HttpRequestError",
    code: -32014,
  });
}

function notMined() {
  return Object.assign(new Error(`Transaction receipt with hash "${HASH}" could not be found.`), {
    name: "TransactionReceiptNotFoundError",
  });
}

/** A source that returns each queued item in order: an Error is thrown, anything else is returned. */
function scripted<R>(items: Array<R | Error>) {
  const calls: string[] = [];
  return {
    calls,
    source: {
      async getTransactionReceipt(args: { hash: `0x${string}` }): Promise<R> {
        calls.push(args.hash);
        const next = items.shift();
        if (next === undefined) throw new Error("script exhausted");
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

test("a transient -32014 head error is retried with backoff, then the receipt is returned", async () => {
  const clock = fakeClock();
  const { source, calls } = scripted<{ status: string; blockNumber: bigint }>([
    rpcCatchingUp(),
    rpcCatchingUp(),
    { status: "success", blockNumber: 25523733n },
  ]);
  const receipt = await awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.blockNumber, 25523733n);
  assert.equal(calls.length, 3);
  assert.deepEqual(clock.sleeps, [1_000, 2_000]);
});

test("persistent -32014 is bounded: after the retry budget it reports pending, never a failed payment", async () => {
  const clock = fakeClock();
  const errors = Array.from({ length: 20 }, () => rpcCatchingUp());
  const { source, calls } = scripted<{ status: string }>(errors);
  await assert.rejects(
    () => awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep, maxTransientErrors: 3 }),
    (error: unknown) => {
      assert.ok(error instanceof ReceiptPendingError, "must be a pending error");
      assert.equal(error.reason, "rpc_unavailable");
      assert.equal(error.hash, HASH);
      assert.equal(/reverted|rejected|failed/i.test(error.message), false, "pending must not read as a failure");
      return true;
    },
  );
  assert.equal(calls.length, 4, "one attempt, then 3 retries, then pending");
  assert.deepEqual(clock.sleeps, [1_000, 2_000, 4_000]);
});

test("backoff never exceeds the configured cap", async () => {
  const clock = fakeClock();
  const { source } = scripted<{ status: string }>(Array.from({ length: 12 }, () => rpcCatchingUp()));
  await assert.rejects(() =>
    awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep, maxTransientErrors: 10, maxBackoffMs: 3_000 }),
  );
  assert.ok(clock.sleeps.every((ms) => ms <= 3_000), `backoffs ${clock.sleeps.join(",")} exceed the cap`);
});

test("a reverted receipt is a definitive status and is returned, not hidden as pending", async () => {
  const clock = fakeClock();
  const { source } = scripted<{ status: string }>([{ status: "reverted" }]);
  const receipt = await awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep });
  assert.equal(receipt.status, "reverted");
});

test("a receipt that is not mined yet is polled until it appears", async () => {
  const clock = fakeClock();
  const { source, calls } = scripted<{ status: string }>([notMined(), notMined(), { status: "success" }]);
  const receipt = await awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep, pollMs: 500 });
  assert.equal(receipt.status, "success");
  assert.equal(calls.length, 3);
  assert.deepEqual(clock.sleeps, [500, 500]);
});

test("a transaction that never gets a receipt times out as pending, not as failed", async () => {
  const clock = fakeClock();
  const { source } = scripted<{ status: string }>(Array.from({ length: 500 }, () => notMined()));
  await assert.rejects(
    () => awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep, timeoutMs: 5_000, pollMs: 1_000 }),
    (error: unknown) => {
      assert.ok(error instanceof ReceiptPendingError);
      assert.equal(error.reason, "timeout");
      return true;
    },
  );
  assert.ok(clock.now() <= 5_000, "the wait stays inside the deadline");
});

test("an unrecognised error while waiting is pending at once, never a payment failure", async () => {
  const clock = fakeClock();
  const { source, calls } = scripted<{ status: string }>([new Error("Unexpected JSON shape from provider")]);
  await assert.rejects(
    () => awaitReceipt(source, HASH, { now: clock.now, sleep: clock.sleep }),
    (error: unknown) => {
      assert.ok(error instanceof ReceiptPendingError);
      assert.equal(error.reason, "unknown_error");
      return true;
    },
  );
  assert.equal(calls.length, 1, "no retry loop for an error that is not transient");
});

test("transient detection reads -32014 from the code, a nested cause, or the message", () => {
  assert.equal(isTransientRpcError(rpcCatchingUp()), true);
  assert.equal(isTransientRpcError(new Error("HttpRequestError: ... Code: -32014")), true);
  assert.equal(isTransientRpcError(Object.assign(new Error("wrapped"), { cause: { code: -32014 } })), true);
  assert.equal(isTransientRpcError(new Error("HTTP request failed. Status: 429 Too Many Requests")), true);
  assert.equal(isTransientRpcError(new Error("Transaction reverted: insufficient balance")), false);
});

test("not-yet-mined detection matches viem's receipt-not-found error only", () => {
  assert.equal(isNotYetMined(notMined()), true);
  assert.equal(isNotYetMined(rpcCatchingUp()), false);
});
