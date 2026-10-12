import type { Address, PublicClient } from "viem";
import type { PortfolioEvent, PortfolioTab } from "../chain.js";
import { assertOurRoot, rootAbi, tabAbi, usdcAbi, withRpcRetry } from "../chain.js";
import { USDC } from "../constants.js";
import { RequestError } from "../validate.js";
import { readCursor } from "./apply.js";
import { indexHealth, noteIndexError, noteRateLimit, readsRateLimited } from "./lane.js";
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
  usdc_balance?: string | null;
  max_per_call?: string | null;
  payees?: string | null;
};

type ActivityRow = {
  kind: PortfolioEvent["kind"];
  tx_hash: string;
  block_number: string | number;
  log_index: string | number;
  observed_at: string;
  tab: string | null;
  agent: string | null;
  payee: string | null;
  amount: string | null;
  permissionless: boolean | null;
  swept: boolean | null;
};

const inflight = new Map<string, Promise<IndexedPortfolio>>();

export type CapabilityFigures = {
  balanceKnown: boolean;
  balance: bigint;
  spentKnown: boolean;
  spent: bigint;
};

/**
 * Available and spent for one capability, from chain balance and verified payments only.
 * An open capability was funded with exactly its cap, and only payments reduce it, so spent is cap minus balance.
 * A closed capability has released its cap, so spent is the sum of verified payments.
 * A failed balance read is unknown. It never falls back to a stored value.
 */
export function capabilityFigures(input: {
  cap: bigint;
  open: boolean;
  swept: boolean;
  liveBalance: bigint | null;
  payments: bigint;
}): CapabilityFigures {
  if (input.swept) return { balanceKnown: true, balance: 0n, spentKnown: true, spent: input.payments };
  if (input.liveBalance == null) {
    return { balanceKnown: false, balance: 0n, spentKnown: !input.open, spent: input.open ? 0n : input.payments };
  }
  if (!input.open) return { balanceKnown: true, balance: input.liveBalance, spentKnown: true, spent: input.payments };
  const spent = input.cap > input.liveBalance ? input.cap - input.liveBalance : 0n;
  return { balanceKnown: true, balance: input.liveBalance, spentKnown: true, spent };
}

/** Sum of verified payments per capability. A transfer back to the root is a return, not a payment. */
export function paymentTotals(
  rows: readonly { kind: string; tab: string | null; payee: string | null; amount: string | null }[],
  root: string,
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    if (row.kind !== "spend" || !row.tab || !row.amount || !row.payee) continue;
    if (row.payee.toLowerCase() === root.toLowerCase()) continue;
    if (!/^[0-9]+$/.test(row.amount)) continue;
    const key = row.tab.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0n) + BigInt(row.amount));
  }
  return totals;
}

export function tabFromStored(root: Address, row: CapabilityRow): PortfolioTab {
  const closed = row.close_block != null && row.close_block !== "";
  const swept = row.swept === true;
  const storedBalance = row.usdc_balance;
  const balanceKnown = swept || (storedBalance != null && storedBalance !== "");
  const limitKnown = row.max_per_call != null && row.max_per_call !== "";
  return {
    tab: row.tab as Address,
    agent: row.agent as Address,
    cap: row.cap,
    expiry: row.expiry,
    open: !closed,
    needsSweep: closed && !swept,
    owner: root,
    maxPerCall: limitKnown ? String(row.max_per_call) : "0",
    usdc: swept ? "0" : storedBalance || "0",
    payees: storedPayees(row.payees),
    openedTx: row.opened_tx as PortfolioTab["openedTx"],
    openedBlock: String(row.opened_block),
    openedAt: row.opened_at,
    balanceKnown,
    limitKnown,
    spentRaw: "0",
    spentKnown: false,
  };
}

/** Overlay the chain balance and verified payments on the stored row. The stored balance is never shown as current. */
function withFigures(
  tab: PortfolioTab,
  row: CapabilityRow,
  payments: ReadonlyMap<string, bigint>,
  live: ReadonlyMap<string, bigint>,
): PortfolioTab {
  const key = row.tab.toLowerCase();
  const figures = capabilityFigures({
    cap: BigInt(row.cap),
    open: tab.open,
    swept: row.swept === true,
    liveBalance: row.swept === true ? 0n : (live.get(key) ?? null),
    payments: payments.get(key) ?? 0n,
  });
  return {
    ...tab,
    usdc: figures.balance.toString(),
    balanceKnown: figures.balanceKnown,
    spentRaw: figures.spent.toString(),
    spentKnown: figures.spentKnown,
  };
}

/** One batched read of each unswept capability's USDC balance. A failed row is absent, so it stays unknown. */
async function readLiveBalances(client: PublicClient, rows: readonly CapabilityRow[]): Promise<Map<string, bigint>> {
  const live = new Map<string, bigint>();
  const pending = rows.filter((row) => row.swept !== true);
  if (pending.length === 0 || readsRateLimited()) return live;
  try {
    const results = (await withRpcRetry(
      () =>
        client.multicall({
          allowFailure: true,
          contracts: pending.map((row) => ({
            address: USDC as Address,
            abi: usdcAbi,
            functionName: "balanceOf" as const,
            args: [row.tab as Address] as const,
          })),
        }),
      1,
    )) as readonly CallResult[];
    results.forEach((result, index) => {
      if (result.status === "success" && typeof result.result === "bigint") {
        live.set(pending[index].tab.toLowerCase(), result.result);
      }
    });
  } catch (error) {
    if (isRateLimit(error)) noteRateLimit();
  }
  return live;
}

function storedPayees(value: string | null | undefined): Address[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Address => typeof item === "string");
  } catch {
    return [];
  }
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
  const [cursor, membership, capabilityRows, activityRows] = await Promise.all([
    readCursor(sql),
    sql.query<{ address: string }>("SELECT address FROM roots WHERE lower(address) = lower($1)", [root]),
    sql.query<CapabilityRow>(
      "SELECT tab, agent, cap, expiry, opened_block, opened_tx, opened_at, close_block, swept, usdc_balance, max_per_call, payees FROM capabilities WHERE lower(root) = lower($1) ORDER BY opened_block, opened_log_index",
      [root],
    ),
    sql.query<ActivityRow>(
      `SELECT kind, tx_hash, block_number, log_index, observed_at, tab, agent, payee, amount, permissionless, swept
       FROM activity WHERE lower(root) = lower($1)
       ORDER BY block_number DESC, log_index DESC`,
      [root],
    ),
  ]);
  const through = cursor ?? 0n;
  if (membership.length === 0 && capabilityRows.length === 0) {
    try {
      await assertOurRoot({ public: client, relayer: null, relayerAddress: null, factory }, root, 1);
    } catch (error) {
      if (isRateLimit(error)) {
        noteRateLimit();
        throw new RequestError(503, "unavailable", "Arc is temporarily unavailable. Your funds are safe. Try again.");
      }
      throw error;
    }
  }
  const health = indexHealth();
  const headNumber = health.chainHead;
  const gap = headNumber == null ? null : headNumber - through;
  const freshness: Freshness =
    gap == null ? "degraded" : gap <= 2n ? "live" : gap <= 120n ? "recent" : health.lastError ? "degraded" : "indexing";
  const stamps = activityRows.map((row) => row.observed_at).filter((stamp) => stamp && stamp !== "0");
  const payments = paymentTotals(activityRows, root);
  const live = await readLiveBalances(client, capabilityRows);
  return {
    tabs: capabilityRows.map((row) => withFigures(tabFromStored(root, row), row, payments, live)),
    activity: activityFrom(activityRows),
    asOf: health.chainTime || stamps[0] || "0",
    freshness,
    indexedThrough: through.toString(),
    head: (headNumber ?? through).toString(),
  };
}

let lastReconcile = 0;

/** Background check of volatile balances. Portfolio reads do not call this. */
export async function reconcileVolatile(sql: Sql, client: PublicClient): Promise<void> {
  if (Date.now() - lastReconcile < 30_000) return;
  const health = indexHealth();
  if (health.busy) return;
  const cursor = await readCursor(sql);
  if (health.chainHead != null && cursor != null && health.chainHead - cursor > 2_000n) return;
  lastReconcile = Date.now();
  const roots = await sql.query<{ address: string }>("SELECT address FROM roots");
  const tabs = await sql.query<{ tab: string; root: string }>("SELECT tab, root FROM capabilities");
  const calls = [
    ...roots.flatMap((row) => {
      const account = row.address as Address;
      return [
        { address: account, abi: rootAbi, functionName: "openExposure" },
        { address: account, abi: rootAbi, functionName: "nextNonce" },
        { address: USDC as Address, abi: usdcAbi, functionName: "balanceOf", args: [account] as const },
      ];
    }),
    ...tabs.flatMap((row) => {
      const tab = row.tab as Address;
      const account = row.root as Address;
      return [
        { address: account, abi: rootAbi, functionName: "tabs", args: [tab] as const },
        { address: tab, abi: tabAbi, functionName: "maxPerCall" },
        { address: USDC as Address, abi: usdcAbi, functionName: "balanceOf", args: [tab] as const },
        { address: tab, abi: tabAbi, functionName: "payees" },
      ];
    }),
  ];
  if (calls.length === 0) return;
  try {
    const details = (await withRpcRetry(() => client.multicall({ contracts: calls, allowFailure: true }), 1)) as readonly CallResult[];
    let index = 0;
    for (const row of roots) {
      const openExposure = (callValue(details, index, "openExposure") as bigint).toString();
      const nextNonce = (callValue(details, index + 1, "nextNonce") as bigint).toString();
      const usdc = (callValue(details, index + 2, "usdc") as bigint).toString();
      index += 3;
      await sql.query("UPDATE roots SET open_exposure = $2, next_nonce = $3, usdc_balance = $4 WHERE lower(address) = lower($1)", [
        row.address,
        openExposure,
        nextNonce,
        usdc,
      ]);
    }
    for (const row of tabs) {
      const maxPerCall = (callValue(details, index + 1, "maxPerCall") as bigint).toString();
      const usdc = (callValue(details, index + 2, "usdc") as bigint).toString();
      const payees = JSON.stringify(payeeList(details, index + 3));
      index += 4;
      await sql.query("UPDATE capabilities SET usdc_balance = $2, max_per_call = $3, payees = $4 WHERE lower(tab) = lower($1)", [
        row.tab,
        usdc,
        maxPerCall,
        payees,
      ]);
    }
  } catch (error) {
    if (!isRateLimit(error)) noteIndexError(error instanceof Error ? error.message : "reconcile_failed");
    else {
      noteRateLimit();
      noteIndexError("Arc is rate limiting reads.");
    }
  }
}

function activityFrom(activityRows: readonly ActivityRow[]): PortfolioEvent[] {
  return activityRows.map((row) => ({
    kind: row.kind,
    tx: row.tx_hash as PortfolioEvent["tx"],
    block: String(row.block_number),
    logIndex: String(row.log_index),
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
