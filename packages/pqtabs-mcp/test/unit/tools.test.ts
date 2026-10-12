/**
 * MOCKED unit tests for the MCP tools. The backend and RPC are scripted, so each tool's refusal and
 * error behavior can be forced. The official MCP client talks to the server over an in-memory transport.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type ArcReceipt, MemoryAttemptStore, PqtabsClient, privateKeySigner, type ReceiptReader } from "pqtabs-sdk";
import { createPqtabsServer } from "../../src/server.js";

const TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const QUOTE_ID = "f9d0f28f-ef19-4cf3-aa37-5361045601f1";
const TX = `0x${"cd".repeat(32)}`;
const KEY = `0x${"33".repeat(32)}`;
const USDC = "0x3600000000000000000000000000000000000000";

function quote() {
  return {
    paymentRequired: {
      x402Version: 2,
      scheme: "pqtabs-barkeep",
      standardExact: false,
      resource: { url: "https://pqtabs.onrender.com/v1/research", description: "Arc Research answer" },
      accepts: [
        {
          scheme: "pqtabs-barkeep",
          network: "eip155:5042",
          asset: USDC,
          amount: "360",
          payTo: PAYEE,
          maxTimeoutSeconds: 600,
          extra: {
            quoteId: QUOTE_ID,
            bodyHash: `0x${"ab".repeat(32)}`,
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
    },
    quoteId: QUOTE_ID,
    scheme: "pqtabs-barkeep",
    standardExact: false,
    replayed: false,
  };
}

function route(map: Record<string, () => Response>) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const handler = map[`${init?.method ?? "GET"} ${url.pathname}`];
    if (!handler) throw new Error(`unexpected ${init?.method} ${url.pathname}`);
    return handler();
  }) as typeof fetch;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const backend = (overrides: Record<string, () => Response> = {}) => ({
  "GET /ready": () => json(200, { ok: true, chainId: 5042, factory: "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323", relayer: true }),
  "GET /v1/config": () =>
    json(200, {
      chainId: 5042,
      rpc: "https://rpc.mainnet.arc.io",
      factory: "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323",
      usdc: USDC,
      barkeep: "0xccebC58DD1F5937B36D5f9F89f0754424f4D443c",
      explorer: "https://explorer.arc.io",
    }),
  "POST /v1/research/quote": () => json(200, quote()),
  "POST /v1/x402/decide": () =>
    json(200, {
      decision: "REFUSE",
      reason: ["capability_inactive", "balance"],
      resource: "https://pqtabs.onrender.com/v1/research",
      price: "360",
      asset: USDC,
      network: "eip155:5042",
      payee: PAYEE,
      agent: "0xFd059f0a995e6852c2138215177f00858588fAb7",
      remaining_capability_balance: "0",
      maxPerCall: "40000",
      root_exposure: "0",
      maxOpenExposure: "200000",
      expiry: "1791322070",
      capability: TAB,
      cap: "100000",
    }),
  ...overrides,
});

function reader(chainId: number, receipt: ArcReceipt | null = null): ReceiptReader {
  return {
    async chainId() {
      return chainId;
    },
    async getReceipt() {
      return receipt;
    },
  };
}

async function connect(options: { fetch: typeof fetch; rpcChainId?: number; signer?: boolean }) {
  const pq = new PqtabsClient({
    backendUrl: "https://backend.test",
    fetch: options.fetch,
    receiptReader: reader(options.rpcChainId ?? 5042),
    attemptStore: new MemoryAttemptStore(),
    sleep: async () => {},
  });
  const signer = options.signer ? privateKeySigner(KEY as `0x${string}`) : undefined;
  const server = createPqtabsServer({ client: pq, signer });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "unit-test", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

function textOf(result: unknown): string {
  const content = ((result as { content?: unknown }).content ?? []) as Array<{ type: string; text?: string }>;
  return content.map((item) => item.text ?? "").join("\n");
}

test("MOCKED: without an agent key the paid tool is not offered, and the read tools are", async () => {
  const { client, close } = await connect({ fetch: route(backend()) });
  try {
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "pqtabs_check_spend_policy",
      "pqtabs_create_research_quote",
      "pqtabs_get_portfolio",
      "pqtabs_get_receipt",
      "pqtabs_list_capabilities",
      "pqtabs_recover_result",
      "pqtabs_status",
    ]);
    assert.equal(names.includes("pqtabs_run_paid_research"), false);
  } finally {
    await close();
  }
});

test("MOCKED: with an agent key the paid tool is offered and marked as state-changing", async () => {
  const { client, close } = await connect({ fetch: route(backend()), signer: true });
  try {
    const { tools } = await client.listTools();
    const paid = tools.find((tool) => tool.name === "pqtabs_run_paid_research");
    assert.ok(paid, "the paid tool is registered when a signer is configured");
    assert.equal(paid.annotations?.readOnlyHint, false);
    assert.equal(paid.annotations?.destructiveHint, true);
    assert.equal(paid.inputSchema.type, "object");
    assert.ok(paid.inputSchema.required?.includes("confirmSpend"));
    const read = tools.find((tool) => tool.name === "pqtabs_get_portfolio");
    assert.equal(read?.annotations?.readOnlyHint, true);
  } finally {
    await close();
  }
});

test("MOCKED: status reports the RPC chain it actually read, and does not claim Arc when the RPC is elsewhere", async () => {
  const { client, close } = await connect({ fetch: route(backend()), rpcChainId: 1 });
  try {
    const result = await client.callTool({ name: "pqtabs_status", arguments: {} });
    assert.notEqual(result.isError, true);
    const data = result.structuredContent as { sdkRpcChainId: number; onArc: boolean };
    assert.equal(data.sdkRpcChainId, 1);
    assert.equal(data.onArc, false);
  } finally {
    await close();
  }
});

test("MOCKED: a policy check returns REFUSE with the backend's reasons and moves no money", async () => {
  const { client, close } = await connect({ fetch: route(backend()) });
  try {
    const result = await client.callTool({ name: "pqtabs_check_spend_policy", arguments: { tab: TAB, task: "What is Arc?" } });
    assert.notEqual(result.isError, true);
    const data = result.structuredContent as { allowed: boolean; decision: string; reasons: string[]; chainId: number };
    assert.equal(data.allowed, false);
    assert.equal(data.decision, "REFUSE");
    assert.deepEqual(data.reasons, ["capability_inactive", "balance"]);
    assert.equal(data.chainId, 5042);
  } finally {
    await close();
  }
});

test("MOCKED: a paid run refused by policy is an error result that says nothing was signed", async () => {
  const { client, close } = await connect({ fetch: route(backend()), signer: true });
  try {
    const result = await client.callTool({
      name: "pqtabs_run_paid_research",
      arguments: { tab: TAB, task: "What is Arc?", maxPriceRaw: "1000", confirmSpend: true },
    });
    assert.equal(result.isError, true);
    const body = JSON.parse(textOf(result)) as { error: string; reasons: string[]; nothingSigned: boolean };
    assert.equal(body.error, "policy_refused");
    assert.deepEqual(body.reasons, ["capability_inactive", "balance"]);
    assert.equal(body.nothingSigned, true);
    assert.equal(textOf(result).includes(KEY.slice(2)), false, "the agent key must never appear in a tool result");
  } finally {
    await close();
  }
});

test("MOCKED: the paid tool refuses to run without confirmSpend set to true", async () => {
  const { client, close } = await connect({ fetch: route(backend()), signer: true });
  try {
    const result = await client.callTool({
      name: "pqtabs_run_paid_research",
      arguments: { tab: TAB, task: "What is Arc?", maxPriceRaw: "1000", confirmSpend: false },
    });
    assert.equal(result.isError, true);
  } finally {
    await close();
  }
});

test("MOCKED: a receipt that is not the expected payment is reported as a mismatch, not settled", async () => {
  const receipt: ArcReceipt = { transactionHash: TX, status: "success", blockNumber: 1n, logs: [] };
  const pq = new PqtabsClient({
    backendUrl: "https://backend.test",
    fetch: route(backend()),
    receiptReader: reader(5042, receipt),
    attemptStore: new MemoryAttemptStore(),
    sleep: async () => {},
  });
  const server = createPqtabsServer({ client: pq });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "unit-test", version: "0.0.0" });
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({
      name: "pqtabs_get_receipt",
      arguments: { txHash: TX, tab: TAB, payee: PAYEE, amountRaw: "360" },
    });
    const data = result.structuredContent as { status: string; reason?: string };
    assert.equal(data.status, "mismatch");
    assert.equal(data.reason, "no_matching_transfer");
  } finally {
    await client.close();
    await server.close();
  }
});

test("MOCKED: a backend outage is a retryable error result, not a crash or a fake success", async () => {
  const down = route({
    ...backend(),
    "GET /v1/config": () => json(503, { error: "unavailable", detail: "down" }),
  });
  const { client, close } = await connect({ fetch: down });
  try {
    const result = await client.callTool({ name: "pqtabs_status", arguments: {} });
    assert.equal(result.isError, true);
    const body = JSON.parse(textOf(result)) as { error: string; retryable: boolean };
    assert.equal(body.error, "backend_unavailable");
    assert.equal(body.retryable, true);
  } finally {
    await close();
  }
});
