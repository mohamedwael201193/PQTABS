import type { Address, PublicClient } from "viem";
import type { PortfolioEvent, PortfolioTab } from "../chain.js";
import { assertOurRoot, rootAbi, tabAbi, usdcAbi, withRpcRetry } from "../chain.js";
import { USDC } from "../constants.js";
import { RequestError } from "../validate.js";
import { readCursor } from "./apply.js";
import { liveReadsPaused, noteRateLimit } from "./lane.js";
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
  swept: boolean | null;
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

const liveCache = new Map<string, { at: number; value: IndexedPortfolio }>();
const inflight = new Map<string, Promise<IndexedPortfolio>>();
const confirmedTabs = new Map<string, PortfolioTab>();

export function tabFromStored(root: Address, row: CapabilityRow): PortfolioTab {
  const cached = confirmedTabs.get(`${root.toLowerCase()}:${row.tab.toLowerCase()}`);
  if (cached) return { ...cached, balanceKnown: true, limitKnown: true };
  const closed = row.close_block != null && row.close_block !== "";
  const swept = row.swept === true;
  return {
    tab: row.tab as Address,
    agent: row.agent as Address,
    cap: row.cap,
    expiry: row.expiry,
    open: !closed,
    needsSweep: closed && !swept,
    owner: root,
    maxPerCall: "0",
    usdc: swept ? "0" : "0",
    payees: [],
    openedTx: row.opened_tx as PortfolioTab["openedTx"],
    openedBlock: String(row.opened_block),
    openedAt: row.opened_at,
    balanceKnown: swept,
    limitKnown: false,
  };
}

export function rememberConfirmedTabs(root: Address, tabs: readonly PortfolioTab[]): void {
  for (const tab of tabs) confirmedTabs.set(`${root.toLowerCase()}:${tab.tab.toLowerCase()}`, tab);
}

export async function readIndexedPortfolio(sql: Sql, client: PublicClient, factory: Address, root: Address): Promise<IndexedPortfolio> {
  const key = root.toLowerCase();
  const pending = inflight.get(key);
  if (pending) return pending;
  const reading = readIndexedPortfolioBody(sql, client, factory, root).finally(() => inflight.delete(key));
  inflight.set(key, reading);
  return reading;
}

async function readIndexedPortfolioBody(sql: Sql, client: PublicClient, factory: Address, root: Address): Promise<IndexedPortfolio> {
  const key = root.toLowerCase();
  const cached = liveCache.get(key);
  if (cached && Date.now() - cached.at < 2_000) return cached.value;
  const cursor = await readCursor(sql);
  const through = cursor ?? 0n;
  const [membership, capabilityRows, activityRows] = await Promise.all([
    sql.query<{ address: string }>("SELECT address FROM roots WHERE lower(address) = lower($1)", [root]),
    sql.query<CapabilityRow>(
      "SELECT tab, agent, cap, expiry, opened_block, opened_tx, opened_at, close_block, swept FROM capabilities WHERE lower(root) = lower($1) ORDER BY opened_block, opened_log_index",
      [root],
    ),
    sql.query<ActivityRow>(
      `SELECT kind, tx_hash, block_number, observed_at, tab, agent, payee, amount, permissionless, swept
       FROM activity WHERE lower(root) = lower($1)
       ORDER BY block_number DESC, log_index DESC`,
      [root],
    ),
  ]);
  const stored = () => storedPortfolio(root, through, capabilityRows, activityRows, null, "");
  if (liveReadsPaused()) return stored();
  let headNumber: bigint | null = null;
  let headTimestamp = "";
  try {
    const head = await client.getBlock({ blockTag: "latest" });
    headNumber = head.number ?? null;
    headTimestamp = head.timestamp.toString();
  } catch (error) {
    if (!isRateLimit(error)) throw error;
    noteRateLimit();
    return storedPortfolio(root, through, capabilityRows, activityRows, null, "");
  }
  const gap = headNumber == null ? 2_001n : headNumber - through;
  if (headNumber == null || gap > 2_000n) {
    return storedPortfolio(root, through, capabilityRows, activityRows, headNumber, headTimestamp, "indexing");
  }
  try {
    if (membership.length === 0 && capabilityRows.length === 0) {
      await assertOurRoot({ public: client, relayer: null, relayerAddress: null, factory }, root, 1);
    }
    const tabs = await liveTabs(client, root, capabilityRows);
    const behind = headNumber - through;
    const value: IndexedPortfolio = {
      tabs,
      activity: activityFrom(activityRows),
      asOf: headTimestamp,
      freshness: behind <= 2n ? "live" : behind <= 120n ? "recent" : "indexing",
      indexedThrough: through.toString(),
      head: headNumber.toString(),
    };
    if (value.freshness === "live" || value.freshness === "recent") liveCache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    if (!isRateLimit(error)) throw error;
    noteRateLimit();
    return storedPortfolio(root, through, capabilityRows, activityRows, headNumber, headTimestamp);
  }
}

function storedPortfolio(
  root: Address,
  through: bigint,
  capabilityRows: readonly CapabilityRow[],
  activityRows: readonly ActivityRow[],
  headNumber: bigint | null,
  headTimestamp: string,
  freshness: Freshness = "degraded",
): IndexedPortfolio {
  const stamps = activityRows.map((row) => row.observed_at).filter((stamp) => stamp && stamp !== "0");
  return {
    tabs: capabilityRows.map((row) => tabFromStored(root, row)),
    activity: activityFrom(activityRows),
    asOf: headTimestamp || stamps[0] || "0",
    freshness,
    indexedThrough: through.toString(),
    head: (headNumber ?? through).toString(),
  };
}

async function liveTabs(client: PublicClient, root: Address, capabilityRows: readonly CapabilityRow[]): Promise<PortfolioTab[]> {
  if (capabilityRows.length === 0) return [];
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
  const details = (await withRpcRetry(() => client.multicall({ contracts: calls, allowFailure: true }), 1)) as readonly CallResult[];
  const tabs = capabilityRows.map((row, index) => {
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
      balanceKnown: true,
      limitKnown: true,
    };
  });
  rememberConfirmedTabs(root, tabs);
  return tabs;
}

function activityFrom(activityRows: readonly ActivityRow[]): PortfolioEvent[] {
  return activityRows.map((row) => ({
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
}

function isRateLimit(error: unknown): boolean {
  if (error instanceof RequestError && error.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.toLowerCase().includes("rate limit") || message.includes("-32005");
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
