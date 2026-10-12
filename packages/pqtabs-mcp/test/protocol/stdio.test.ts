/**
 * PROTOCOL suite. It starts the built stdio server exactly as an MCP host would, and talks to it with
 * the official MCP client. Read-only calls go to the live backend and Arc. The paid tool is listed but
 * never called here.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const cli = resolve(here, "../../src/cli.js");
const ROOT_A = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf";
const SETTLED_TX = "0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15";
const SETTLED_TAB = "0x7D627201477f192DBB3dC5E7e993aeF6701F302d";
const SETTLED_PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3";
const TEST_KEY = `0x${"44".repeat(32)}`;

let client: Client | undefined;

function connected(): Client {
  if (!client) throw new Error("the protocol client is not connected");
  return client;
}


async function start(env: Record<string, string>): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli],
    env: {
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      PQTABS_STATE_DIR: mkdtempSync(join(tmpdir(), "pqtabs-mcp-proto-")),
      ...env,
    },
    stderr: "pipe",
  });
  const c = new Client({ name: "pqtabs-protocol-test", version: "0.0.0" });
  await c.connect(transport);
  return c;
}

after(async () => {
  await client?.close();
});

before(async () => {
  client = await start({});
});

test("protocol: the server advertises the read tools, with schemas and safety annotations", async () => {
  const { tools } = await connected().listTools();
  const names = tools.map((tool) => tool.name);
  for (const expected of [
    "pqtabs_status",
    "pqtabs_get_portfolio",
    "pqtabs_list_capabilities",
    "pqtabs_create_research_quote",
    "pqtabs_check_spend_policy",
    "pqtabs_get_receipt",
    "pqtabs_recover_result",
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
  assert.equal(names.includes("pqtabs_run_paid_research"), false, "no agent key, so no paid tool");
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object", `${tool.name} input schema`);
    assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);
    assert.ok(tool.annotations, `${tool.name} needs annotations`);
  }
  const status = tools.find((tool) => tool.name === "pqtabs_status");
  assert.equal(status?.annotations?.readOnlyHint, true);
  const check = tools.find((tool) => tool.name === "pqtabs_check_spend_policy");
  assert.equal(check?.annotations?.readOnlyHint, false, "check_spend_policy creates a quote record");
});

test("protocol: status is read from the live backend and Arc RPC", async () => {
  const result = await connected().callTool({ name: "pqtabs_status", arguments: {} });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const data = result.structuredContent as { backendOk: boolean; sdkRpcChainId: number; onArc: boolean; usdc: string };
  assert.equal(data.backendOk, true);
  assert.equal(data.sdkRpcChainId, 5042);
  assert.equal(data.onArc, true);
  assert.equal(data.usdc.toLowerCase(), "0x3600000000000000000000000000000000000000");
});

test("protocol: the portfolio of the disposable root is returned with its capabilities", async () => {
  const result = await connected().callTool({ name: "pqtabs_get_portfolio", arguments: { root: ROOT_A } });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const data = result.structuredContent as { root: string; tabCount: number; tabs: unknown[] };
  assert.equal(data.root.toLowerCase(), ROOT_A.toLowerCase());
  assert.ok(data.tabCount >= 1);
  assert.equal(data.tabs.length, data.tabCount);
});

test("protocol: a settled receipt verifies through the tool against Arc, read-only", async () => {
  const result = await connected().callTool({
    name: "pqtabs_get_receipt",
    arguments: { txHash: SETTLED_TX, tab: SETTLED_TAB, payee: SETTLED_PAYEE, amountRaw: "360" },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  const data = result.structuredContent as { status: string; blockNumber?: string; explorerUrl: string; chainId: number };
  assert.equal(data.status, "settled");
  assert.equal(data.blockNumber, "25523733");
  assert.equal(data.chainId, 5042);
  assert.equal(data.explorerUrl, `https://explorer.arc.io/tx/${SETTLED_TX}`);
});

test("protocol: an invalid input is rejected by the schema, not sent to the backend", async () => {
  const result = await connected().callTool({ name: "pqtabs_get_portfolio", arguments: { root: "not-an-address" } });
  assert.equal(result.isError, true);
});

test("protocol: with an agent key set, the paid tool is listed, with its confirmation guard, and nothing is paid", async () => {
  const keyed = await start({ PQTABS_AGENT_PRIVATE_KEY: TEST_KEY });
  try {
    const { tools } = await keyed.listTools();
    const paid = tools.find((tool) => tool.name === "pqtabs_run_paid_research");
    assert.ok(paid, "the paid tool is listed when a key is set");
    assert.ok(paid?.inputSchema.required?.includes("confirmSpend"));
    const status = await keyed.callTool({ name: "pqtabs_status", arguments: {} });
    const data = status.structuredContent as { paidResearchEnabled: boolean; agentAddress?: string };
    assert.equal(data.paidResearchEnabled, true);
    assert.match(data.agentAddress ?? "", /^0x[0-9a-fA-F]{40}$/);
  } finally {
    await keyed.close();
  }
});

test("protocol: a malformed agent key stops the server with a message that does not echo the key", async () => {
  const child = spawn(process.execPath, [cli], {
    env: { PATH: process.env.PATH ?? "", SYSTEMROOT: process.env.SYSTEMROOT ?? "", PQTABS_AGENT_PRIVATE_KEY: "0xdeadbeef" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const code = await new Promise<number | null>((resolve) => child.on("exit", (exitCode) => resolve(exitCode)));
  assert.equal(code, 1);
  assert.match(stderr, /not a 32-byte hex key/);
  assert.equal(stderr.includes("deadbeef"), false, "the bad key must not be echoed");
});
