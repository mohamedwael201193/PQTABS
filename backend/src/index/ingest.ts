import { type Address, decodeEventLog, type Hex, type PublicClient, parseAbiItem } from "viem";
import { withRpcRetry } from "../chain.js";
import { FACTORY_BLOCK, USDC } from "../constants.js";
import { applyEvents, type IndexEvent, readCursor } from "./apply.js";
import { ingestRead } from "./lane.js";
import type { Sql } from "./sql.js";

const PAGE = 2_000n;

const rootCreated = parseAbiItem(
  "event RootCreated(address indexed registrar, address indexed root, bytes32 vk, uint256 maxOpenExposure)",
);
const tabOpened = parseAbiItem(
  "event TabOpened(address indexed tab, address indexed agent, uint256 cap, uint64 expiry, uint256 openExposure)",
);
const tabClosed = parseAbiItem("event TabClosed(address indexed tab, uint256 capReleased, bool swept, bool permissionless)");
const moved = parseAbiItem("event TreasuryTransfer(address indexed to, uint256 amount)");
const rotated = parseAbiItem("event KeyRotated(bytes32 vk)");
const spent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const decodedAbi = [rootCreated, tabOpened, tabClosed, moved, rotated] as const;

type RawLog = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hex | null;
};

export function startIngest(sql: Sql, client: PublicClient, factory: Address): void {
  const times = new Map<string, string>();
  const run = async () => {
    while (true) {
      try {
        const head = await ingestRead(() => withRpcRetry(() => client.getBlock({ blockTag: "latest" }), 1));
        if (head.number == null) throw new Error("Arc did not return a block number.");
        const cursor = await readCursor(sql);
        const from = cursor == null ? FACTORY_BLOCK : cursor + 1n;
        if (from > head.number) {
          await sleep(2_000);
          continue;
        }
        const to = from + PAGE - 1n > head.number ? head.number : from + PAGE - 1n;
        await indexWindow(sql, client, factory, from, to, times);
        await sleep(2_000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const limited = message.includes("429") || message.includes("rate limit") || message.includes("-32005");
        await sleep(limited ? 4_000 + Math.floor(Math.random() * 1_500) : 2_000);
      }
    }
  };
  void run();
}

let ingestTail: Promise<unknown> = Promise.resolve();

export async function indexWindow(
  sql: Sql,
  client: PublicClient,
  factory: Address,
  from: bigint,
  to: bigint,
  times: Map<string, string>,
): Promise<void> {
  const run = ingestTail.then(() => indexWindowBody(sql, client, factory, from, to, times));
  ingestTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function indexWindowBody(
  sql: Sql,
  client: PublicClient,
  factory: Address,
  from: bigint,
  to: bigint,
  times: Map<string, string>,
): Promise<void> {
  const factoryLogs = await ingestRead(() => withRpcRetry(() => client.getLogs({ address: factory, fromBlock: from, toBlock: to }), 1));
  const created = decodeLogs(factoryLogs);
  const knownRoots = await sql.query<{ address: string }>("SELECT address FROM roots");
  const roots = uniqueAddresses([...knownRoots.map((row) => row.address as Address), ...created.flatMap((event) => (event.kind === "root" ? [event.root] : []))]);
  const rootLogs = roots.length === 0 ? [] : await ingestRead(() => withRpcRetry(() => client.getLogs({ address: roots, fromBlock: from, toBlock: to }), 1));
  const rootEvents = decodeLogs(rootLogs);
  const knownTabs = await sql.query<{ tab: string }>("SELECT tab FROM capabilities");
  const tabs = uniqueAddresses([
    ...knownTabs.map((row) => row.tab as Address),
    ...rootEvents.flatMap((event) => (event.kind === "opened" && event.tab ? [event.tab] : [])),
  ]);
  const spendLogs =
    tabs.length === 0
      ? []
      : await ingestRead(() =>
          withRpcRetry(() => client.getLogs({ address: USDC, event: spent, args: { from: tabs }, fromBlock: from, toBlock: to }), 1),
        );
  const spends = spendLogs.flatMap((log) => {
    if (log.blockNumber == null || log.logIndex == null || log.transactionHash == null || !log.args.from || !log.args.to) return [];
    return [
      {
        block: log.blockNumber,
        logIndex: log.logIndex,
        tx: log.transactionHash,
        timestamp: "",
        root: factory,
        kind: "spend" as const,
        tab: log.args.from,
        payee: log.args.to,
        amount: log.args.value?.toString(),
      },
    ];
  });
  const events = [...created, ...rootEvents, ...spends];
  for (const event of events) {
    event.timestamp = await blockTime(client, event.block, times);
  }
  await applyEvents(sql, events, to);
}

function decodeLogs(logs: readonly RawLog[]): IndexEvent[] {
  const events: IndexEvent[] = [];
  for (const log of logs) {
    if (log.blockNumber == null || log.logIndex == null || log.transactionHash == null || log.topics.length === 0) continue;
    const topics = [log.topics[0], ...log.topics.slice(1)] as [Hex, ...Hex[]];
    let decoded: ReturnType<typeof decodeEventLog<typeof decodedAbi>>;
    try {
      decoded = decodeEventLog({ abi: decodedAbi, data: log.data, topics });
    } catch {
      continue;
    }
    const base = { block: log.blockNumber, logIndex: log.logIndex, tx: log.transactionHash, timestamp: "", root: log.address };
    if (decoded.eventName === "RootCreated") {
      events.push({
        ...base,
        kind: "root",
        root: decoded.args.root,
        registrar: decoded.args.registrar,
        verifyingKey: decoded.args.vk,
        amount: decoded.args.maxOpenExposure.toString(),
      });
    } else if (decoded.eventName === "TabOpened") {
      events.push({
        ...base,
        kind: "opened",
        tab: decoded.args.tab,
        agent: decoded.args.agent,
        amount: decoded.args.cap.toString(),
        expiry: decoded.args.expiry.toString(),
      });
    } else if (decoded.eventName === "TabClosed") {
      events.push({
        ...base,
        kind: "closed",
        tab: decoded.args.tab,
        amount: decoded.args.capReleased.toString(),
        swept: decoded.args.swept,
        permissionless: decoded.args.permissionless,
      });
    } else if (decoded.eventName === "TreasuryTransfer") {
      events.push({ ...base, kind: "transfer", payee: decoded.args.to, amount: decoded.args.amount.toString() });
    } else if (decoded.eventName === "KeyRotated") {
      events.push({ ...base, kind: "rotated", verifyingKey: decoded.args.vk });
    }
  }
  return events;
}

async function blockTime(client: PublicClient, blockNumber: bigint, cache: Map<string, string>): Promise<string> {
  const key = blockNumber.toString();
  const cached = cache.get(key);
  if (cached) return cached;
  const block = await ingestRead(() => withRpcRetry(() => client.getBlock({ blockNumber }), 1));
  const stamp = block.timestamp.toString();
  cache.set(key, stamp);
  return stamp;
}

function uniqueAddresses(values: readonly Address[]): Address[] {
  const seen = new Set<string>();
  const out: Address[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
