/**
 * Test helpers. MOCKED: these fixtures stand in for the backend and the Arc RPC in unit tests only.
 * The integration and live suites never use them.
 */
import { type Hex, pad, toHex } from "viem";
import { ARC_NETWORK, SCHEME, TRANSFER_TOPIC, USDC_ADDRESS } from "../src/constants.js";
import type { ArcReceipt, ReceiptReader } from "../src/rpc.js";
import { type AgentSigner, privateKeySigner } from "../src/signer.js";

export const TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
export const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
export const ROOT = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf";
export const QUOTE_ID = "f9d0f28f-ef19-4cf3-aa37-5361045601f1";
export const TX_HASH = `0x${"cd".repeat(32)}` as Hex;
export const BODY_HASH = `0x${"ab".repeat(32)}` as Hex;
/** Test-only key. It controls no funds and is never used on Arc. */
export const TEST_KEY = `0x${"11".repeat(32)}` as Hex;

export function testSigner(): AgentSigner {
  return privateKeySigner(TEST_KEY);
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function paymentRequired(price = "360", quoteId = QUOTE_ID) {
  return {
    x402Version: 2,
    scheme: SCHEME,
    standardExact: false,
    resource: { url: "https://pqtabs.onrender.com/v1/research", description: "Arc Research answer" },
    accepts: [
      {
        scheme: SCHEME,
        network: ARC_NETWORK,
        asset: USDC_ADDRESS,
        amount: price,
        payTo: PAYEE,
        maxTimeoutSeconds: 600,
        extra: {
          quoteId,
          bodyHash: BODY_HASH,
          service: "Arc Research",
          provider: "Groq",
          model: "openai/gpt-oss-120b",
          maxTokens: 400,
          tariff: true,
          name: "USDC",
          version: "2",
        },
      },
    ],
  };
}

export function quoteBody(price = "360", quoteId = QUOTE_ID) {
  return { paymentRequired: paymentRequired(price, quoteId), quoteId, scheme: SCHEME, standardExact: false, replayed: false };
}

export function decideBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    decision: "ALLOW",
    reason: ["capability_active", "payee_allowlisted", "within_max_per_call", "within_balance", "within_root_exposure", "not_expired"],
    resource: "https://pqtabs.onrender.com/v1/research",
    price: "360",
    asset: USDC_ADDRESS,
    network: ARC_NETWORK,
    payee: PAYEE,
    agent: testSigner().address,
    remaining_capability_balance: "100000",
    maxPerCall: "40000",
    root_exposure: "0",
    maxOpenExposure: "200000",
    expiry: String(nowSeconds() + 3_600),
    capability: TAB,
    cap: "100000",
    ...overrides,
  };
}

export function timeBody() {
  return { asOf: String(nowSeconds()) };
}

export function spendBody(hash: string = TX_HASH, replayed = false) {
  return { hash, scheme: SCHEME, standardExact: false, replayed };
}

export function resultBody(status: "complete" | "result_pending" = "complete") {
  return status === "complete"
    ? { status, result: "Arc settles in USDC [S1].", model: "openai/gpt-oss-120b", txHash: TX_HASH, scheme: SCHEME, standardExact: false }
    : { status, txHash: TX_HASH, scheme: SCHEME, standardExact: false };
}

export function configBody(chainId = 5042) {
  return {
    chainId,
    rpc: "https://rpc.mainnet.arc.io",
    factory: "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323",
    usdc: USDC_ADDRESS,
    barkeep: "0xccebC58DD1F5937B36D5f9F89f0754424f4D443c",
    explorer: "https://explorer.arc.io",
  };
}

/** A successful receipt with exactly one 6-decimal USDC Transfer from the capability to the payee. */
export function settledReceipt(value = 360n, hash: string = TX_HASH): ArcReceipt {
  return {
    transactionHash: hash,
    status: "success",
    blockNumber: 25_534_892n,
    logs: [
      {
        address: USDC_ADDRESS,
        topics: [TRANSFER_TOPIC, pad(TAB.toLowerCase() as Hex, { size: 32 }), pad(PAYEE.toLowerCase() as Hex, { size: 32 })],
        data: pad(toHex(value), { size: 32 }),
      },
    ],
  };
}

/** A fake Arc RPC reader. Each call pops the next scripted response, or repeats the last one. */
export function scriptedReader(script: Array<ArcReceipt | null | Error>, chainId = 5042): ReceiptReader & { calls: number } {
  let index = 0;
  const reader = {
    calls: 0,
    async chainId() {
      return chainId;
    },
    async getReceipt() {
      reader.calls += 1;
      const item = script[Math.min(index, script.length - 1)];
      index += 1;
      if (item instanceof Error) throw item;
      return item ?? null;
    },
  };
  return reader;
}

export type Recorded = { method: string; path: string; body: unknown };

export type Handler = (call: { body: unknown; index: number }) => Response | Promise<Response>;

/**
 * A scripted fetch. Each route name gets its own handler. Every call is recorded.
 * Requests that match no route fail the test loudly.
 */
export function scriptedFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: Recorded[] = [];
  const counts = new Map<string, number>();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body });
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const handler = routes[key];
    if (!handler) throw new Error(`unexpected request ${key}`);
    const list = Array.isArray(handler) ? handler : [handler];
    const chosen = list[Math.min(index, list.length - 1)] as Handler;
    return chosen({ body, index });
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length };
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "test-request", ...headers },
  });
}
