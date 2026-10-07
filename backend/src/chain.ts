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
    clients.public.readContract({ address: clients.factory, abi: factoryAbi, functionName: "registrarOf", args: [root] }),
    clients.public.readContract({ address: root, abi: rootAbi, functionName: "factory" }),
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
    await clients.public.estimateGas({ account, to, data });
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

async function chunked<T>(client: PublicClient, read: (from: bigint, to: bigint) => Promise<readonly T[]>): Promise<T[]> {
  const latest = await client.getBlockNumber();
  const span = 4_000n;
  const rows: T[] = [];
  for (let from = FACTORY_BLOCK; from <= latest; from += span) {
    const to = from + span - 1n > latest ? latest : from + span - 1n;
    rows.push(...(await read(from, to)));
  }
  return rows;
}

async function blockTime(client: PublicClient, blockNumber: bigint, cache: Map<string, string>): Promise<string> {
  const key = blockNumber.toString();
  const cached = cache.get(key);
  if (cached) return cached;
  const block = await client.getBlock({ blockNumber });
  const stamp = block.timestamp.toString();
  cache.set(key, stamp);
  return stamp;
}

export async function readPortfolio(clients: Clients, root: Address): Promise<{ tabs: PortfolioTab[]; activity: PortfolioEvent[] }> {
  await assertOurRoot(clients, root);
  const client = clients.public;
  const opened = await chunked(client, (from, to) =>
    client.getLogs({ address: root, event: openedEvent, fromBlock: from, toBlock: to }),
  );
  const times = new Map<string, string>();
  const tabs: PortfolioTab[] = [];
  for (const log of opened) {
    const tab = log.args.tab;
    const agent = log.args.agent;
    if (!tab || !agent) continue;
    const [state, owner, onchainAgent, maxPerCall, expiry, balance, payees] = await Promise.all([
      client.readContract({ address: root, abi: rootAbi, functionName: "tabs", args: [tab] }),
      client.readContract({ address: tab, abi: tabAbi, functionName: "owner" }),
      client.readContract({ address: tab, abi: tabAbi, functionName: "agent" }),
      client.readContract({ address: tab, abi: tabAbi, functionName: "maxPerCall" }),
      client.readContract({ address: tab, abi: tabAbi, functionName: "expiry" }),
      client.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [tab] }),
      client.readContract({ address: tab, abi: tabAbi, functionName: "payees" }).catch(() => [] as Address[]),
    ]);
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
      payees: [...payees],
      openedTx: log.transactionHash,
      openedBlock: log.blockNumber.toString(),
      openedAt: await blockTime(client, log.blockNumber, times),
    });
    void agent;
  }

  const closed = await chunked(client, (from, to) => client.getLogs({ address: root, event: closedEvent, fromBlock: from, toBlock: to }));
  const moved = await chunked(client, (from, to) => client.getLogs({ address: root, event: movedEvent, fromBlock: from, toBlock: to }));
  const rotated = await chunked(client, (from, to) => client.getLogs({ address: root, event: rotatedEvent, fromBlock: from, toBlock: to }));
  const spends = [];
  for (const tab of tabs) {
    spends.push(
      ...(await chunked(client, (from, to) =>
        client.getLogs({ address: USDC, event: spentEvent, args: { from: tab.tab }, fromBlock: from, toBlock: to }),
      )),
    );
  }

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
  return { tabs, activity };
}

export { factoryAbi, rootAbi, tabAbi, usdcAbi };
