import assert from "node:assert/strict";
import test from "node:test";
import { ranged } from "../src/chain.js";

/**
 * Arc's public eth_getLogs rejects a range above 10,000 blocks with -32012 (see the Arc RPC reference).
 * ranged() reads with 9,999-block windows and falls back to 4,000-block windows on a range error.
 * These tests prove each block is read exactly once in either mode, and that other errors are not retried as ranges.
 */

test("a -32012 range rejection falls back to smaller windows that cover every block once", async () => {
  const spans: [bigint, bigint][] = [];
  const rows = await ranged(100n, 25_000n, async (from, to) => {
    spans.push([from, to]);
    if (to - from + 1n > 4_000n && spans.length === 1) {
      throw new Error("RPC Request failed. Details: -32012 block range exceeds the limit");
    }
    return [{ from, to }];
  });

  const fallback = spans.slice(1);
  assert.ok(fallback.length > 0, "the fallback must read again");
  assert.equal(spans[0][0], 100n, "the first attempt starts at the requested start");
  for (const [from, to] of fallback) {
    assert.ok(to - from + 1n <= 4_000n, `fallback window ${from}..${to} must be 4,000 blocks or fewer`);
  }

  let expected = 100n;
  for (const [from, to] of fallback) {
    assert.equal(from, expected, "fallback windows are contiguous with no gap or overlap");
    expected = to + 1n;
  }
  assert.equal(expected - 1n, 25_000n, "fallback windows reach the latest block");
  assert.equal(rows.length, fallback.length, "one result per fallback window, none from the rejected attempt");
});

test("an error that is not a range rejection is thrown and not retried as smaller windows", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      ranged(100n, 25_000n, async () => {
        calls += 1;
        throw new Error("RPC Request failed. Details: invalid params");
      }),
    /invalid params/,
  );
  assert.equal(calls, 1);
});

test("a range that fits one window is read once and returns its rows", async () => {
  const spans: [bigint, bigint][] = [];
  const rows = await ranged(500n, 900n, async (from, to) => {
    spans.push([from, to]);
    return [`${from}-${to}`];
  });
  assert.deepEqual(spans, [[500n, 900n]]);
  assert.deepEqual(rows, ["500-900"]);
});
