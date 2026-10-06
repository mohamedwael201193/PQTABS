import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { RateLimiter } from "../src/limit.js";
import { encodeExecute, encodeReclaim, encodeRetrySweep, encodeSpend, RequestError } from "../src/validate.js";

const TAB = getAddress("0xE3051e8173fDBEC33B826352CB177a306B9d5109");
const PAYEE = getAddress("0xC485B657C140C9677846f3E9ca6a3158e5623044");

describe("calldata allowlist", () => {
  it("builds the four relay selectors and nothing else", () => {
    const execute = encodeExecute("0x01", 1n, 2n, `0x${"11".repeat(7856)}`);
    const reclaim = encodeReclaim(TAB);
    const retry = encodeRetrySweep(TAB);
    const spend = encodeSpend({
      tab: TAB,
      to: PAYEE,
      value: 10_000n,
      validAfter: 0n,
      validBefore: 1893456000n,
      nonce: `0x${"22".repeat(32)}`,
      signature: `0x${"33".repeat(213)}`,
    });
    assert.equal(execute.slice(0, 10), "0xe25bdff2");
    assert.equal(reclaim.slice(0, 10), "0xfc772c8b");
    assert.equal(retry.slice(0, 10), "0xd3df89c2");
    assert.equal(spend.slice(0, 10), "0xcf092995");
    assert.equal(spend.toLowerCase().includes(TAB.slice(2).toLowerCase()), true);
    assert.equal(spend.toLowerCase().includes(PAYEE.slice(2).toLowerCase()), true);
  });

  it("rejects a short PQ signature, a short spend blob, and a zero amount", () => {
    assert.throws(() => encodeExecute("0x01", 0n, 1n, "0x11"), (error: unknown) => error instanceof RequestError && error.code === "bad_signature_length");
    assert.throws(
      () =>
        encodeSpend({
          tab: TAB,
          to: PAYEE,
          value: 1n,
          validAfter: 0n,
          validBefore: 10n,
          nonce: `0x${"22".repeat(32)}`,
          signature: "0x33",
        }),
      (error: unknown) => error instanceof RequestError && error.code === "bad_signature_length",
    );
    assert.throws(
      () =>
        encodeSpend({
          tab: TAB,
          to: PAYEE,
          value: 0n,
          validAfter: 0n,
          validBefore: 10n,
          nonce: `0x${"22".repeat(32)}`,
          signature: `0x${"33".repeat(213)}`,
        }),
      (error: unknown) => error instanceof RequestError && error.code === "bad_amount",
    );
  });
});

describe("rate limit", () => {
  it("stops the ninth relay inside one minute", () => {
    let clock = 1_000;
    const limiter = new RateLimiter(() => clock);
    for (let i = 0; i < 8; i++) assert.equal(limiter.allow("a", "relay"), true);
    assert.equal(limiter.allow("a", "relay"), false);
    assert.equal(limiter.allow("b", "relay"), true);
    clock += 61_000;
    assert.equal(limiter.allow("a", "relay"), true);
  });
});
