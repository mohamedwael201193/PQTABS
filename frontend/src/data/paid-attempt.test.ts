import assert from "node:assert/strict";
import test from "node:test";
import { readAttempt, reconcileAttempt, writeAttempt, type PaidAttempt } from "./paid-attempt.ts";

const attempt = (patch: Partial<PaidAttempt> = {}): PaidAttempt => ({
  tab: "0x586E42Da69529A4665D4644e6FDe5fdAa4aeA321",
  task: "Summarize what Arc mainnet settlement means for an agent payment.",
  price: "32",
  payee: "0x6Bf001BB5f5E75396d92163325ca01FdEBe2e9A9",
  nonce: "0x" + "ab".repeat(32),
  validBefore: "200",
  signature: "0x" + "11".repeat(213),
  txHash: "",
  settled: false,
  ...patch,
});

const request = {
  tab: attempt().tab,
  task: attempt().task,
  price: "32",
  payee: attempt().payee,
};

test("a retry resubmits the same authorization and a settled task asks before a new charge", () => {
  assert.equal(reconcileAttempt(attempt(), request, false, 100), "reuse");
  assert.equal(reconcileAttempt(attempt({ txHash: "0x" + "aa".repeat(32) }), request, false, 100), "reuse");
  assert.equal(reconcileAttempt(attempt({ settled: true, txHash: "0x" + "aa".repeat(32) }), request, false, 100), "confirm");
  assert.equal(reconcileAttempt(attempt({ settled: true, txHash: "0x" + "aa".repeat(32) }), request, true, 100), "sign");
  assert.equal(reconcileAttempt(attempt({ price: "64" }), request, false, 100), "sign");
  assert.equal(reconcileAttempt(attempt({ validBefore: "50" }), request, false, 100), "sign");
});

test("the stored attempt survives a new storage object", () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  };
  writeAttempt(storage, attempt({ txHash: "0x" + "aa".repeat(32) }));
  const loaded = readAttempt(storage, attempt().tab);
  assert.equal(loaded?.txHash, "0x" + "aa".repeat(32));
  assert.equal(reconcileAttempt(loaded, request, false, 100), "reuse");
});
