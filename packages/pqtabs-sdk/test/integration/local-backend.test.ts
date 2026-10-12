/**
 * INTEGRATION suite. It starts the real PQTABS backend from this repository on a free local port,
 * with a live Arc RPC for chain reads. It makes no mocked backend response. It never relays a spend:
 * every spend check here uses a capability that the backend must refuse, so the SDK must refuse
 * before signing.
 */
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";
import { PqtabsClient } from "../../src/client.js";
import { PolicyRefusedError, PqtabsError } from "../../src/errors.js";
import { type AgentSigner, privateKeySigner } from "../../src/signer.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const backendEntry = resolve(here, "../../../../../backend/dist/src/server.js");
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const RPC = process.env.PQTABS_RPC_URL ?? "https://rpc.mainnet.arc.io";
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
/** A closed capability on the production root. The backend must refuse any spend from it. */
const CLOSED_TAB = "0xE3051e8173fDBEC33B826352CB177a306B9d5109";
const TEST_KEY = `0x${"22".repeat(32)}` as Hex;

let server: ChildProcess | undefined;
let signs = 0;
const countingKey: AgentSigner = (() => {
  const base = privateKeySigner(TEST_KEY);
  return {
    address: base.address,
    signTransferAuthorization: async (authorization) => {
      signs += 1;
      return base.signTransferAuthorization(authorization);
    },
  };
})();

before(async () => {
  if (!existsSync(backendEntry)) {
    throw new Error(`Build the backend first: cd backend && npm run build (missing ${backendEntry})`);
  }
  const indexPath = mkdtempSync(join(tmpdir(), "pqtabs-sdk-it-"));
  server = spawn(process.execPath, [backendEntry], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ARC_RPC_URL: RPC,
      MERCHANT_PAYEE: PAYEE,
      INDEX_PATH: indexPath,
      // Keep the backend from using hosted-only paths or any model key.
      GROQ_API_KEY: "",
      RENDER_SERVICE_ID: "",
      DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr?.on("data", () => {});
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error("the local backend did not start");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
});

after(() => {
  server?.kill();
});

const client = () => new PqtabsClient({ backendUrl: BASE, rpcUrl: RPC, timeoutMs: 45_000 });

test("local backend: health and chain configuration are Arc mainnet", async () => {
  const c = client();
  assert.deepEqual(await c.read.health(), { ok: true });
  const config = await c.read.config();
  assert.equal(config.chainId, 5042);
  assert.equal(config.usdc.toLowerCase(), "0x3600000000000000000000000000000000000000");
});

test("local backend: a research quote is a valid Barkeep price paid to the configured payee", async () => {
  const quote = await client().research.quote("What is the Arc USDC gas token?");
  assert.equal(quote.priceRaw, "360");
  assert.equal(quote.payee.toLowerCase(), PAYEE.toLowerCase());
  assert.equal(quote.expiresInSeconds, 600);
  assert.match(quote.quoteId, /^[0-9a-f-]{36}$/);
});

test("local backend: the policy check refuses a closed capability with real reasons, and signs nothing", async () => {
  const c = client();
  const quote = await c.research.quote("What is the Arc USDC gas token?");
  const policy = await c.research.checkPolicy({ tab: CLOSED_TAB, paymentRequired: quote.paymentRequired });
  assert.equal(policy.allowed, false);
  assert.equal(policy.decision, "REFUSE");
  assert.ok(policy.reasons.includes("capability_inactive"), `reasons were ${policy.reasons.join(",")}`);
});

test("local backend: a spend from a closed capability is refused before any signature", async () => {
  const before = signs;
  await assert.rejects(
    client().spend.research({ tab: CLOSED_TAB, signer: countingKey, maxPriceRaw: "1000", task: "What is Arc?" }),
    (error: unknown) => error instanceof PolicyRefusedError && error.reasons.length > 0,
  );
  assert.equal(signs, before, "the signer must not be called when the backend refuses");
});

test("local backend: an unknown quote id is reported as a backend error, not a result", async () => {
  await assert.rejects(
    client().research.recoverResult({ quoteId: "00000000-0000-4000-8000-000000000000", txHash: `0x${"ef".repeat(32)}`, tab: CLOSED_TAB }),
    (error: unknown) => error instanceof PqtabsError && error.code === "backend_error" && error.errorCode === "unknown_quote",
  );
});
