import type { Address, PublicClient } from "viem";
import type { PortfolioEvent, PortfolioTab } from "../chain.js";
import { assertOurRoot, rootAbi, tabAbi, usdcAbi, withRpcRetry } from "../chain.js";
import { USDC } from "../constants.js";
import { readCursor } from "./apply.js";
import { indexWindow } from "./ingest.js";
import type { Sql } from "./sql.js";

export type Freshness = "live" | "recent" | "indexing" | "degraded";

export type IndexedPortfolio = {
  tabs: PortfolioTab[];
  activity: PortfolioEvent[];
  asOf: string;
  freshness: Freshness;
  indexedThrough: string;
  head: string;
};

type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

type CapabilityRow = {
  tab: string;
  agent: string;
  cap: string;
  expiry: string;
  opened_block: string | number;
  opened_tx: string;
  opened_at: string;
  close_block: string | number | null;
};

type ActivityRow = {
  kind: PortfolioEvent["kind"];
  tx_hash: string;
  block_number: string | number;
  observed_at: string;
  tab: string | null;
  agent: string | null;
  payee: string | null;
  amount: string | null;
  permissionless: boolean | null;
  swept: boolean | null;
};

export async function readIndexedPortfolio(sql: Sql, client: PublicClient, factory: Address, root: Address): Promise<IndexedPortfolio> {
  const cursor = await readCursor(sql);
  const through = cursor ?? 0n;
  let headNumber: bigint | null = null;
  let headTimestamp = "";
  try {
    const head = await client.getBlock({ blockTag: "latest" });
    headNumber = head.number;
    headTimestamp = head.timestamp.toString();
  } catch {
    headNumber = null;
  }
  const gap = headNumber == null ? 31n : headNumber - through;
  if (headNumber == null || gap > 30n) {
    return {
      tabs: [],
      activity: [],
      asOf: headTimestamp || "0",
      freshness: "indexing",
      indexedThrough: through.toString(),
      head: (headNumber ?? through).toString(),
    };
  }
  await assertOurRoot({ public: client, relayer: null, relayerAddress: null, factory }, root);
  let next = cursor;
  if (next != null && gap > 0n) {
    await indexWindow(sql, client, factory, next + 1n, headNumber, new Map());
    next = await readCursor(sql);
  }
  const caughtUp = next ?? 0n;
  const behind = headNumber - caughtUp;
  const freshness: Freshness = behind <= 2n ? "live" : behind <= 30n ? "recent" : "indexing";
  const capabilityRows = await sql.query<CapabilityRow>(
    "SELECT tab, agent, cap, expiry, opened_block, opened_tx, opened_at, close_block FROM capabilities WHERE lower(root) = lower($1) ORDER BY opened_block, opened_log_index",
    [root],
  );
  const activityRows = await sql.query<ActivityRow>(
    `SELECT kind, tx_hash, block_number, observed_at, tab, agent, payee, amount, permissionless, swept
     FROM activity WHERE lower(root) = lower($1)
     ORDER BY block_number DESC, log_index DESC`,
    [root],
  );
  const calls = capabilityRows.flatMap((row) => {
    const tab = row.tab as Address;
    return [
      { address: root, abi: rootAbi, functionName: "tabs", args: [tab] as const },
      { address: tab, abi: tabAbi, functionName: "owner" },
      { address: tab, abi: tabAbi, functionName: "agent" },
      { address: tab, abi: tabAbi, functionName: "maxPerCall" },
      { address: tab, abi: tabAbi, functionName: "expiry" },
      { address: USDC as Address, abi: usdcAbi, functionName: "balanceOf", args: [tab] as const },
      { address: tab, abi: tabAbi, functionName: "payees" },
    ];
  });
  const details =
    calls.length === 0
      ? []
      : ((await withRpcRetry(() => client.multicall({ contracts: calls, allowFailure: true }))) as readonly CallResult[]);
  const tabs: PortfolioTab[] = capabilityRows.map((row, index) => {
    const base = index * 7;
    const state = callValue(details, base, "tabs") as readonly [bigint, bigint, boolean, boolean];
    return {
      tab: row.tab as Address,
      agent: callValue(details, base + 2, "agent") as Address,
      cap: state[0].toString(),
      expiry: (callValue(details, base + 4, "expiry") as bigint).toString(),
      open: state[2],
      needsSweep: state[3],
      owner: callValue(details, base + 1, "owner") as Address,
      maxPerCall: (callValue(details, base + 3, "maxPerCall") as bigint).toString(),
      usdc: (callValue(details, base + 5, "balance") as bigint).toString(),
      payees: payeeList(details, base + 6),
      openedTx: row.opened_tx as PortfolioTab["openedTx"],
      openedBlock: String(row.opened_block),
      openedAt: row.opened_at,
    };
  });
  const activity: PortfolioEvent[] = activityRows.map((row) => ({
    kind: row.kind,
    tx: row.tx_hash as PortfolioEvent["tx"],
    block: String(row.block_number),
    timestamp: row.observed_at,
    tab: row.tab ? (row.tab as Address) : undefined,
    agent: row.agent ? (row.agent as Address) : undefined,
    amount: row.amount ?? undefined,
    to: row.payee ? (row.payee as Address) : undefined,
    permissionless: row.kind === "closed" ? row.permissionless === true : undefined,
    swept: row.kind === "closed" ? row.swept === true : undefined,
  }));
  return {
    tabs,
    activity,
    asOf: headTimestamp,
    freshness,
    indexedThrough: caughtUp.toString(),
    head: headNumber.toString(),
  };
}

function callValue(results: readonly CallResult[], index: number, label: string): unknown {
  const row = results[index];
  if (!row || row.status === "failure") throw row && row.status === "failure" ? row.error : new Error(`${label} missing`);
  return row.result;
}

function payeeList(results: readonly CallResult[], index: number): Address[] {
  const row = results[index];
  if (!row || row.status === "failure") return [];
  return [...(row.result as readonly Address[])];
}
