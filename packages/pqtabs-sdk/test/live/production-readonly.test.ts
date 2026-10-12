/**
 * LIVE suite. Read-only against https://pqtabs.onrender.com and the Arc mainnet RPC.
 * It never signs, never relays, never opens or closes a capability, and never moves funds.
 * It proves the SDK reads the real protocol state and verifies a real, already-settled receipt.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PqtabsClient } from "../../src/client.js";
import { PqtabsError } from "../../src/errors.js";

const ROOT_A = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf";
const CLOSED_TAB = "0xE3051e8173fDBEC33B826352CB177a306B9d5109";
/** A settled 360-raw Arc Research payment, recorded in guide.md (VERIFIED on 2026-10-12). */
const SETTLED_TX = "0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15";
const SETTLED_TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const SETTLED_PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";

const client = () => new PqtabsClient();

test("live: backend health, readiness, and config are Arc mainnet", async () => {
  const c = client();
  assert.deepEqual(await c.read.health(), { ok: true });
  const ready = await c.read.ready();
  assert.equal(ready.ok, true);
  assert.equal(ready.chainId, 5042);
  const config = await c.read.config();
  assert.equal(config.chainId, 5042);
  assert.equal(config.usdc.toLowerCase(), "0x3600000000000000000000000000000000000000");
});

test("live: the Arc RPC is on chain 5042", async () => {
  const reader = (await import("../../src/rpc.js")).viemReceiptReader("https://rpc.mainnet.arc.io", 20_000, fetch);
  assert.equal(await reader.chainId(), 5042);
});

test("live: the root portfolio returns capabilities with the expected shape", async () => {
  const portfolio = await client().read.portfolio(ROOT_A);
  assert.equal(portfolio.root.toLowerCase(), ROOT_A.toLowerCase());
  assert.ok(portfolio.tabs.length >= 1, "the disposable root has at least one capability");
  for (const tab of portfolio.tabs) {
    assert.match(tab.tab, /^0x[0-9a-fA-F]{40}$/);
    assert.match(tab.cap, /^[0-9]+$/);
  }
});

test("live: a closed capability is refused by the real backend policy check, with a reason", async () => {
  const c = client();
  const quote = await c.research.quote("What is the Arc USDC gas token?");
  const policy = await c.research.checkPolicy({ tab: CLOSED_TAB, paymentRequired: quote.paymentRequired });
  assert.equal(policy.allowed, false);
  assert.equal(policy.decision, "REFUSE");
  assert.ok(policy.reasons.length > 0);
});

test("live: a settled research receipt verifies against Arc, read-only", async () => {
  const check = await client().research.verifyReceipt({
    txHash: SETTLED_TX,
    tab: SETTLED_TAB,
    payee: SETTLED_PAYEE,
    valueRaw: "360",
  });
  assert.equal(check.status, "settled", JSON.stringify(check));
  assert.equal(check.status === "settled" ? check.blockNumber : "", "25523733");
});

test("live: the same receipt does not match a different amount", async () => {
  const check = await client().research.verifyReceipt({
    txHash: SETTLED_TX,
    tab: SETTLED_TAB,
    payee: SETTLED_PAYEE,
    valueRaw: "361",
  });
  assert.equal(check.status, "mismatch");
});

test("live: an unknown quote id is reported as a backend error", async () => {
  await assert.rejects(
    client().research.recoverResult({
      quoteId: "00000000-0000-4000-8000-000000000000",
      txHash: SETTLED_TX,
      tab: SETTLED_TAB,
    }),
    (error: unknown) => error instanceof PqtabsError && error.errorCode === "unknown_quote",
  );
});
