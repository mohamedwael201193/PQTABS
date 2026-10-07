import assert from "node:assert/strict";
import test from "node:test";
import { decideOpen, decideSpend, type SpendFacts } from "../src/index/decide.js";

const base = (): SpendFacts => ({
  now: 100n,
  amount: 5n,
  payee: "0xC485B657C140C9677846f3E9ca6a3158e5623044",
  signer: "0x54113A5C0195821c42CB831d280A73670951166D",
  tabAgent: "0x54113A5C0195821c42CB831d280A73670951166D",
  payees: ["0xC485B657C140C9677846f3E9ca6a3158e5623044"],
  maxPerCall: 10n,
  balance: 20n,
  expiry: 200n,
  open: true,
  serviceAvailable: true,
});

test("a valid spend is allowed only from the real inputs", () => {
  const allowed = decideSpend(base());
  assert.equal(allowed.decision, "ALLOW");
  assert.equal(decideSpend({ ...base(), amount: 11n }).reason.includes("max_per_call"), true);
  assert.equal(decideSpend({ ...base(), amount: 21n }).reason.includes("balance"), true);
  assert.equal(decideSpend({ ...base(), payee: "0x0000000000000000000000000000000000000001" }).reason.includes("wrong_payee"), true);
  assert.equal(decideSpend({ ...base(), now: 200n }).reason.includes("expired"), true);
  assert.equal(decideSpend({ ...base(), signer: "0x0000000000000000000000000000000000000002" }).reason.includes("wrong_agent"), true);
  assert.equal(decideSpend({ ...base(), open: false }).reason.includes("capability_inactive"), true);
  assert.equal(decideSpend({ ...base(), serviceAvailable: false }).decision, "NO_PAYMENT");
  assert.equal(decideOpen({ cap: 50n, openExposure: 80n, maxOpenExposure: 100n }).reason.includes("exposure"), true);
  assert.equal(decideOpen({ cap: 20n, openExposure: 80n, maxOpenExposure: 100n }).decision, "ALLOW");
});
