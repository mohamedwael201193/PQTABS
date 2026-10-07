import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  type PublicClient,
  parseAbiItem,
  type WalletClient,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, FACTORY, FACTORY_BLOCK, MIN_FEE, RPC_URL, USDC } from "./constants.js";
import { RequestError } from "./validate.js";

export const arc = defineChain({
  id: CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

const rootAbi = [
  { type: "function", name: "pqVk", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "nextNonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "maxOpenExposure", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "openExposure", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "tabs",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { name: "cap", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "open", type: "bool" },
      { name: "needsSweep", type: "bool" },
    ],
  },
] as const;

const factoryAbi = [
  { type: "function", name: "registrarOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "rootCount", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rootAt", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const tabAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "maxPerCall", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "expiry", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "isValidSignature",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }, { type: "bytes" }],
    outputs: [{ type: "bytes4" }],
  },
  { type: "function", name: "payees", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
] as const;

const usdcAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export type Clients = {
  public: PublicClient;
  relayer: WalletClient | null;
  relayerAddress: Address | null;
  factory: Address;
};

export function loadClients(env: NodeJS.ProcessEnv = process.env): Clients {
  const rpc = env.ARC_RPC_URL || RPC_URL;
  const factory = (env.FACTORY_ADDRESS || FACTORY) as Address;
  const publicClient = createPublicClient({ chain: arc, transport: http(rpc) });
  const key = env.RELAYER_PRIVATE_KEY;
  if (!key) {
    return { public: publicClient, relayer: null, relayerAddress: null, factory };
  }
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const relayer = createWalletClient({ account, chain: arc, transport: http(rpc) });
  return { public: publicClient, relayer, relayerAddress: account.address, factory };
}

export async function fee(client: PublicClient): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const gasPrice = await client.getGasPrice();
  const maxFeePerGas = gasPrice > MIN_FEE ? gasPrice : MIN_FEE;
  const maxPriorityFeePerGas = maxFeePerGas < 1_000_000_000n ? maxFeePerGas : 1_000_000_000n;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export async function assertOurRoot(clients: Clients, root: Address): Promise<void> {
  const [registrar, factory] = await Promise.all([
    withRpcRetry(() => clients.public.readContract({ address: clients.factory, abi: factoryAbi, functionName: "registrarOf", args: [root] })),
    withRpcRetry(() => clients.public.readContract({ address: root, abi: rootAbi, functionName: "factory" })),
  ]);
  if (registrar === "0x0000000000000000000000000000000000000000" || factory.toLowerCase() !== clients.factory.toLowerCase()) {
    throw new RequestError(400, "unknown_root", "that address is not a root of this factory");
  }
}

export async function relay(
  clients: Clients,
  to: Address,
  data: Hex,
  seen: Map<string, Hex>,
): Promise<{ hash: Hex; simulated: true }> {
  if (!clients.relayer || !clients.relayerAddress) {
    throw new RequestError(503, "relayer_unconfigured", "relay is not configured");
  }
  const account = clients.relayer.account as PrivateKeyAccount;
  const cached = seen.get(data);
  if (cached) return { hash: cached, simulated: true };
  try {
    await withRpcRetry(() => clients.public.estimateGas({ account, to, data }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "simulation failed";
    throw new RequestError(400, "simulation_failed", message.slice(0, 300));
  }
  const prices = await fee(clients.public);
  const hash = await clients.relayer.sendTransaction({
    account,
    chain: arc,
    to,
    data,
    maxFeePerGas: prices.maxFeePerGas,
    maxPriorityFeePerGas: prices.maxPriorityFeePerGas,
  });
  seen.set(data, hash);
  return { hash, simulated: true };
}

const openedEvent = parseAbiItem(
  "event TabOpened(address indexed tab, address indexed agent, uint256 cap, uint64 expiry, uint256 openExposure)",
);
const closedEvent = parseAbiItem(
  "event TabClosed(address indexed tab, uint256 capReleased, bool swept, bool permissionless)",
);
const movedEvent = parseAbiItem("event TreasuryTransfer(address indexed to, uint256 amount)");
const rotatedEvent = parseAbiItem("event KeyRotated(bytes32 vk)");
const spentEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type PortfolioTab = {
  tab: Address;
  agent: Address;
  cap: string;
  expiry: string;
  open: boolean;
  needsSweep: boolean;
  owner: Address;
  maxPerCall: string;
  usdc: string;
  payees: Address[];
  openedTx: Hex;
  openedBlock: string;
  openedAt: string;
};

export type PortfolioEvent = {
  kind: "opened" | "closed" | "transfer" | "rotated" | "spend";
  tx: Hex;
  block: string;
  timestamp: string;
  tab?: Address;
  agent?: Address;
  amount?: string;
  to?: Address;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRpcRetry<T>(read: () => Promise<T>): Promise<T> {
  let pause = 750;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await read();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const limited = message.includes("429") || message.includes("rate limit");
      if (!limited || attempt === 7) {
        if (limited) throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
        throw error;
      }
      await sleep(pause);
      pause = Math.min(pause * 2, 8_000);
    }
  }
  throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
}

function errorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const record = error as { message?: string; details?: string; shortMessage?: string; cause?: { message?: string } };
  return [record.message, record.shortMessage, record.details, record.cause?.message].filter(Boolean).join(" ");
}

function isRangeError(error: unknown): boolean {
  if (error instanceof RequestError) return false;
  return /range too large|block range|too many|exceed|query returned more|10000|50000|response size/i.test(errorText(error));
}

async function windows<T>(
  latest: bigint,
  span: bigint,
  read: (from: bigint, to: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = FACTORY_BLOCK; from <= latest; from += span) {
    const to = from + span - 1n > latest ? latest : from + span - 1n;
    rows.push(...(await withRpcRetry(() => read(from, to))));
  }
  return rows;
}

async function ranged<T>(
  latest: bigint,
  read: (from: bigint, to: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  try {
    return await windows(latest, 10_000n, read);
  } catch (error) {
    if (!isRangeError(error)) throw error;
    return windows(latest, 4_000n, read);
  }
}

async function blockTime(client: PublicClient, blockNumber: bigint, cache: Map<string, string>): Promise<string> {
  const key = blockNumber.toString();
  const cached = cache.get(key);
  if (cached) return cached;
  const block = await withRpcRetry(() => client.getBlock({ blockNumber }));
  const stamp = block.timestamp.toString();
  cache.set(key, stamp);
  return stamp;
}

type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

type PortfolioRead = { tabs: PortfolioTab[]; activity: PortfolioEvent[]; asOf: string };

const portfolioInflight = new Map<string, Promise<PortfolioRead>>();

function callValue(results: readonly CallResult[], index: number, label: string): unknown {
  const row = results[index];
  if (!row || row.status === "failure") {
    throw row && row.status === "failure" ? row.error : new Error(`${label} missing`);
  }
  return row.result;
}

function payeeList(results: readonly CallResult[], index: number): Address[] {
  const row = results[index];
  if (!row || row.status === "failure") return [];
  return [...(row.result as readonly Address[])];
}

export function readPortfolio(clients: Clients, root: Address): Promise<PortfolioRead> {
  const key = `${clients.factory.toLowerCase()}:${root.toLowerCase()}`;
  const existing = portfolioInflight.get(key);
  if (existing) return existing;
  const pending = readPortfolioOnce(clients, root).finally(() => {
    portfolioInflight.delete(key);
  });
  portfolioInflight.set(key, pending);
  return pending;
}

async function readPortfolioOnce(clients: Clients, root: Address): Promise<PortfolioRead> {
  await assertOurRoot(clients, root);
  const client = clients.public;
  const head = await withRpcRetry(() => client.getBlock({ blockTag: "latest" }));
  if (head.number == null) throw new Error("Arc did not return a block number.");
  const latest = head.number;
  const opened = await ranged(latest, (from, to) =>
    client.getLogs({ address: root, event: openedEvent, fromBlock: from, toBlock: to }),
  );
  const times = new Map<string, string>();
  const openedRows = opened.filter((log) => log.args.tab && log.args.agent);
  const calls: {
    address: Address;
    abi: typeof rootAbi | typeof tabAbi | typeof usdcAbi;
    functionName: string;
    args?: readonly [Address];
  }[] = openedRows.flatMap((log) => {
    const tab = log.args.tab as Address;
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
  const details = calls.length === 0 ? [] : await withRpcRetry(() => client.multicall({ contracts: calls, allowFailure: true }));
  const tabs: PortfolioTab[] = [];
  for (let index = 0; index < openedRows.length; index++) {
    const log = openedRows[index];
    const tab = log.args.tab as Address;
    const base = index * 7;
    const state = callValue(details as readonly CallResult[], base, "tabs") as readonly [bigint, bigint, boolean, boolean];
    const owner = callValue(details as readonly CallResult[], base + 1, "owner") as Address;
    const onchainAgent = callValue(details as readonly CallResult[], base + 2, "agent") as Address;
    const maxPerCall = callValue(details as readonly CallResult[], base + 3, "maxPerCall") as bigint;
    const expiry = callValue(details as readonly CallResult[], base + 4, "expiry") as bigint;
    const balance = callValue(details as readonly CallResult[], base + 5, "balance") as bigint;
    tabs.push({
      tab,
      agent: onchainAgent,
      cap: state[0].toString(),
      expiry: expiry.toString(),
      open: state[2],
      needsSweep: state[3],
      owner,
      maxPerCall: maxPerCall.toString(),
      usdc: balance.toString(),
      payees: payeeList(details as readonly CallResult[], base + 6),
      openedTx: log.transactionHash,
      openedBlock: log.blockNumber.toString(),
      openedAt: await blockTime(client, log.blockNumber, times),
    });
  }

  const closed = await ranged(latest, (from, to) => client.getLogs({ address: root, event: closedEvent, fromBlock: from, toBlock: to }));
  const moved = await ranged(latest, (from, to) => client.getLogs({ address: root, event: movedEvent, fromBlock: from, toBlock: to }));
  const rotated = await ranged(latest, (from, to) => client.getLogs({ address: root, event: rotatedEvent, fromBlock: from, toBlock: to }));
  const spends =
    tabs.length === 0
      ? []
      : await ranged(latest, (from, to) =>
          client.getLogs({
            address: USDC,
            event: spentEvent,
            args: { from: tabs.map((row) => row.tab) },
            fromBlock: from,
            toBlock: to,
          }),
        );

  const activity: PortfolioEvent[] = [];
  for (const log of opened) {
    if (!log.args.tab) continue;
    activity.push({
      kind: "opened",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      timestamp: await blockTime(client, log.blockNumber, times),
      tab: log.args.tab,
      agent: log.args.agent,
      amount: log.args.cap?.toString(),
    });
  }
  for (const log of closed) {
    if (!log.args.tab) continue;
    activity.push({
      kind: "closed",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      timestamp: await blockTime(client, log.blockNumber, times),
      tab: log.args.tab,
      amount: log.args.capReleased?.toString(),
    });
  }
  for (const log of moved) {
    activity.push({
      kind: "transfer",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      timestamp: await blockTime(client, log.blockNumber, times),
      to: log.args.to,
      amount: log.args.amount?.toString(),
    });
  }
  for (const log of rotated) {
    activity.push({
      kind: "rotated",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      timestamp: await blockTime(client, log.blockNumber, times),
    });
  }
  for (const log of spends) {
    activity.push({
      kind: "spend",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      timestamp: await blockTime(client, log.blockNumber, times),
      tab: log.args.from,
      to: log.args.to,
      amount: log.args.value?.toString(),
    });
  }
  activity.sort((a, b) => Number(b.block) - Number(a.block));
  return { tabs, activity, asOf: head.timestamp.toString() };
}

export { factoryAbi, rootAbi, tabAbi, usdcAbi };
