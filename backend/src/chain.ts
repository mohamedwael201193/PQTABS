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
import { CHAIN_ID, FACTORY, FACTORY_BLOCK, FACTORY_NEXT, MIN_FEE, RPC_URL, USDC } from "./constants.js";
import { liveReadsPaused, noteRateLimit } from "./index/lane.js";
import { erc20SpendRaw } from "./index/usdc-event.js";
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
  /** Null only in tests that build a partial client. Production always sets it. */
  factoryNext?: Address | null;
};

export function loadClients(env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Clients {
  const rpc = env.ARC_RPC_URL || RPC_URL;
  const factory = (env.FACTORY_ADDRESS || FACTORY) as Address;
  const factoryNext = (env.FACTORY_NEXT_ADDRESS || FACTORY_NEXT) as Address;
  const publicClient = createPublicClient({
    chain: arc,
    transport: http(rpc, {
      timeout: 10_000,
      fetchFn: signal
        ? (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal })
        : undefined,
    }),
  });
  const key = env.RELAYER_PRIVATE_KEY;
  if (!key) {
    return { public: publicClient, relayer: null, relayerAddress: null, factory, factoryNext };
  }
  const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
  const relayer = createWalletClient({ account, chain: arc, transport: http(rpc) });
  return { public: publicClient, relayer, relayerAddress: account.address, factory, factoryNext };
}

/** A mined capability open used 636,789 gas. This ceiling is only for a rate-limited estimate. */
export const RELAY_GAS_CEILING = 1_200_000n;

/** Public Arc endpoints from the RPC reference. Used only after the primary read is rate-limited. */
export const PUBLIC_RPC_FALLBACKS = [
  "https://rpc.drpc.mainnet.arc.io",
  "https://rpc.blockdaemon.mainnet.arc.io",
  "https://rpc.quicknode.mainnet.arc.io",
] as const;

export function pricesFrom(gasPrice: bigint): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const maxFeePerGas = gasPrice > MIN_FEE ? gasPrice : MIN_FEE;
  const maxPriorityFeePerGas = maxFeePerGas < 1_000_000_000n ? maxFeePerGas : 1_000_000_000n;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

export function fallbackRpcUrls(primary: string | undefined): string[] {
  const current = (primary ?? "").trim().toLowerCase().replace(/\/$/, "");
  const seen = new Set(current ? [current] : []);
  const urls: string[] = [];
  for (const url of PUBLIC_RPC_FALLBACKS) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

/**
 * Asks each endpoint twice. A revert is returned immediately. If every endpoint
 * is rate-limiting the estimate, the caller may still broadcast under RELAY_GAS_CEILING.
 */
export async function gasLimitForRelay(readers: readonly (() => Promise<bigint>)[]): Promise<bigint> {
  let sawLimit = false;
  for (const read of readers) {
    try {
      return await withRpcRetry(read, 2);
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      sawLimit = true;
    }
  }
  if (sawLimit) return RELAY_GAS_CEILING;
  throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
}

/** Arc drops a transaction under 20 gwei. A busy gas-price read uses that floor. */
export async function feeOrFloor(
  readers: readonly (() => Promise<bigint>)[],
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  for (const read of readers) {
    try {
      return pricesFrom(await withRpcRetry(read, 2));
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
    }
  }
  return pricesFrom(MIN_FEE);
}

export async function fee(client: PublicClient): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  return pricesFrom(await client.getGasPrice());
}

function clientFor(url: string): PublicClient {
  return createPublicClient({
    chain: arc,
    transport: http(url, {
      timeout: 10_000,
      fetchOptions: { headers: { "user-agent": "pqtabs" } },
    }),
  });
}

/** Primary read first. A rate limit or a lagging node tries the other public Arc endpoints once each. */
export async function readOnArc<T>(
  primary: () => Promise<T>,
  fallback: (client: PublicClient) => Promise<T>,
  attempts = 2,
): Promise<T> {
  try {
    return await withRpcRetry(primary, attempts);
  } catch (error) {
    if (!isRateLimitError(error) && !isTransientRpc(error)) throw error;
  }
  let last: unknown = null;
  for (const url of fallbackRpcUrls(process.env.ARC_RPC_URL || RPC_URL)) {
    try {
      return await withRpcRetry(() => fallback(clientFor(url)), 1);
    } catch (error) {
      if (!isRateLimitError(error) && !isTransientRpc(error)) throw error;
      last = error;
    }
  }
  if (last instanceof RequestError) throw last;
  throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
}

/**
 * True when a read came back with no data. That is what an address without contract code returns, so it means
 * "not a root", not an RPC failure. Transient and rate-limit errors are not matched here and keep their retry path.
 */
function isNoCodeRead(error: unknown): boolean {
  let node: unknown = error;
  for (let depth = 0; node && typeof node === "object" && depth < 6; depth++) {
    if ((node as { name?: unknown }).name === "ContractFunctionZeroDataError") return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}

export async function listFactoryRoots(client: PublicClient, factories: readonly Address[], registrar: Address): Promise<Address[]> {
  const roots: Address[] = [];
  const seen = new Set<string>();
  for (const factory of factories) {
    const count = await withRpcRetry(
      () => client.readContract({ address: factory, abi: factoryAbi, functionName: "rootCount", args: [registrar] }),
      3,
    );
    for (let index = 0n; index < count; index++) {
      const root = await withRpcRetry(
        () => client.readContract({ address: factory, abi: factoryAbi, functionName: "rootAt", args: [registrar, index] }),
        3,
      );
      const key = root.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      roots.push(root);
    }
  }
  return roots;
}

/** A failed live scan must not hide roots the index already stored, and must not become a generic 500. */
export function scanFailureRoots(indexed: readonly Address[], error: unknown): Address[] {
  if (indexed.length > 0) return [...indexed];
  if (error instanceof RequestError) throw error;
  throw new RequestError(503, "unavailable", "Arc is temporarily unavailable. Your funds are safe. Try again.");
}

function knownFactories(clients: Clients): Address[] {
  const next = clients.factoryNext;
  return next ? [clients.factory, next] : [clients.factory];
}

export async function assertOurRoot(clients: Clients, root: Address, attempts = 2): Promise<void> {
  const readFactory = (client: PublicClient) =>
    client.readContract({ address: root, abi: rootAbi, functionName: "factory" }).catch((error: unknown) => {
      if (isNoCodeRead(error)) return null;
      throw error;
    });
  const home = await readOnArc(() => readFactory(clients.public), readFactory, attempts);
  const recorded = typeof home === "string" ? home : null;
  const factory = recorded && knownFactories(clients).find((item) => item.toLowerCase() === recorded.toLowerCase());
  if (!factory) throw new RequestError(400, "unknown_root", "that address is not a root of this factory");
  const registrar = await readOnArc(
    () => clients.public.readContract({ address: factory, abi: factoryAbi, functionName: "registrarOf", args: [root] }),
    (client) => client.readContract({ address: factory, abi: factoryAbi, functionName: "registrarOf", args: [root] }),
    attempts,
  );
  if (registrar === "0x0000000000000000000000000000000000000000") {
    throw new RequestError(400, "unknown_root", "that address is not a root of this factory");
  }
}

export async function rootNonce(clients: Clients, root: Address): Promise<bigint> {
  return readOnArc(
    () => clients.public.readContract({ address: root, abi: rootAbi, functionName: "nextNonce" }),
    (client) => client.readContract({ address: root, abi: rootAbi, functionName: "nextNonce" }),
    2,
  );
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
  const primary = process.env.ARC_RPC_URL || RPC_URL;
  const fallbacks = fallbackRpcUrls(primary);
  let gas: bigint;
  try {
    gas = await gasLimitForRelay([
      () => clients.public.estimateGas({ account, to, data }),
      ...fallbacks.map((url) => () => clientFor(url).estimateGas({ account, to, data })),
    ]);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "simulation_failed", errorText(error).slice(0, 300));
  }
  const prices = await feeOrFloor([
    () => clients.public.getGasPrice(),
    ...fallbacks.map((url) => () => clientFor(url).getGasPrice()),
  ]);
  const hash = await broadcast(account, to, data, gas, prices, [primary, ...fallbacks]);
  seen.set(data, hash);
  return { hash, simulated: true };
}

async function broadcast(
  account: PrivateKeyAccount,
  to: Address,
  data: Hex,
  gas: bigint,
  prices: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  urls: readonly string[],
): Promise<Hex> {
  let sawLimit = false;
  for (const url of urls) {
    const wallet = createWalletClient({
      account,
      chain: arc,
      transport: http(url, { timeout: 10_000, fetchOptions: { headers: { "user-agent": "pqtabs" } } }),
    });
    try {
      return await wallet.sendTransaction({
        account,
        chain: arc,
        to,
        data,
        gas,
        maxFeePerGas: prices.maxFeePerGas,
        maxPriorityFeePerGas: prices.maxPriorityFeePerGas,
      });
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      sawLimit = true;
    }
  }
  if (sawLimit) throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
  throw new RequestError(503, "rpc_unavailable", "Arc did not accept the transaction. Nothing was broadcast.");
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
  /** False when this response did not read the capability balance from Arc. */
  balanceKnown?: boolean;
  /** False when this response did not read the per-payment limit from Arc. */
  limitKnown?: boolean;
  /** Raw USDC spent: cap minus the chain balance while open, otherwise the sum of verified payments. */
  spentRaw?: string;
  /** False when spent cannot be stated for this response, for example when the balance read failed. */
  spentKnown?: boolean;
};

export type PortfolioEvent = {
  kind: "opened" | "closed" | "transfer" | "rotated" | "spend";
  tx: Hex;
  block: string;
  logIndex?: string;
  timestamp: string;
  tab?: Address;
  agent?: Address;
  amount?: string;
  to?: Address;
  permissionless?: boolean;
  swept?: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Arc's load-balanced RPC returns -32014 for a block that the serving backend has not imported yet.
 * The Arc RPC reference says to back off briefly and retry. Any other error is not retried here.
 */
export function isTransientRpc(error: unknown): boolean {
  const record = error && typeof error === "object" ? (error as { code?: unknown; cause?: { code?: unknown } }) : null;
  if (record && (record.code === -32014 || record.cause?.code === -32014)) return true;
  return /-32014/.test(error instanceof Error ? error.message : String(error));
}

export async function withRpcRetry<T>(read: () => Promise<T>, attempts = 8): Promise<T> {
  let pause = 750;
  const tries = Math.max(1, attempts);
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await read();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const limited = message.includes("429") || message.includes("rate limit");
      const transient = isTransientRpc(error);
      if (!limited && !transient) throw error;
      if (attempt === tries - 1) {
        if (limited) throw new RequestError(429, "rate_limited", "Arc is rate limiting reads. Try again in a moment.");
        throw new RequestError(503, "rpc_unavailable", "Arc's RPC node is catching up. Try again in a moment. Nothing was decided from this read.");
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
  return /-32012|range too large|block range|too many|exceed|query returned more|10000|50000|response size/i.test(errorText(error));
}

async function windows<T>(
  start: bigint,
  latest: bigint,
  span: bigint,
  read: (from: bigint, to: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = start; from <= latest; from += span) {
    const to = from + span - 1n > latest ? latest : from + span - 1n;
    rows.push(...(await withRpcRetry(() => read(from, to))));
  }
  return rows;
}

/** Read blocks start..latest in windows Arc accepts. Falls back to smaller windows on a range error. */
export async function ranged<T>(
  start: bigint,
  latest: bigint,
  read: (from: bigint, to: bigint) => Promise<readonly T[]>,
): Promise<T[]> {
  try {
    return await windows(start, latest, 9_999n, read);
  } catch (error) {
    if (!isRangeError(error)) throw error;
    return windows(start, latest, 4_000n, read);
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

/** How long one live portfolio read is reused. Balances are never older than this. */
export const PORTFOLIO_TTL_MS = 10_000;
/** How many roots keep an incremental scan in memory. Oldest roots are dropped first. */
const SCAN_ROOTS_MAX = 64;

/** Test seam for the portfolio cache clock. */
export const portfolioClock = { now: (): number => Date.now() };

const portfolioCache = new Map<string, { at: number; value: PortfolioRead }>();
const portfolioScans = new Map<string, PortfolioScan>();

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof RequestError && error.status === 429) return true;
  const message = errorText(error);
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

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

/**
 * Live portfolio read. This is the fallback used when the Postgres index is not ready.
 * It is bounded three ways: a short cache, one scan at a time per root, and no scan while Arc is rate limiting.
 * Each root keeps its logs and block times, so a later read scans only the blocks after the last one it saw.
 */
export function readPortfolio(clients: Clients, root: Address): Promise<PortfolioRead> {
  const key = `${clients.factory.toLowerCase()}:${root.toLowerCase()}`;
  const cached = portfolioCache.get(key);
  if (cached && portfolioClock.now() - cached.at < PORTFOLIO_TTL_MS) return Promise.resolve(cached.value);
  const existing = portfolioInflight.get(key);
  if (existing) return existing;
  if (liveReadsPaused()) {
    return Promise.reject(new RequestError(503, "unavailable", "Arc is temporarily unavailable. Your funds are safe. Try again."));
  }
  const pending = readPortfolioOnce(clients, root)
    .then((value) => {
      portfolioCache.set(key, { at: portfolioClock.now(), value });
      return value;
    })
    .catch((error: unknown) => {
      if (isRateLimitError(error)) noteRateLimit();
      throw error;
    })
    .finally(() => {
      portfolioInflight.delete(key);
    });
  portfolioInflight.set(key, pending);
  return pending;
}

/** Logs for one root from `from` through `latest`. Spend logs need the capability list, so they are read separately. */
async function readRootLogs(client: PublicClient, root: Address, from: bigint, latest: bigint) {
  const opened = await ranged(from, latest, (a, b) => client.getLogs({ address: root, event: openedEvent, fromBlock: a, toBlock: b }));
  const closed = await ranged(from, latest, (a, b) => client.getLogs({ address: root, event: closedEvent, fromBlock: a, toBlock: b }));
  const moved = await ranged(from, latest, (a, b) => client.getLogs({ address: root, event: movedEvent, fromBlock: a, toBlock: b }));
  const rotated = await ranged(from, latest, (a, b) => client.getLogs({ address: root, event: rotatedEvent, fromBlock: a, toBlock: b }));
  return { opened, closed, moved, rotated };
}

async function readSpends(client: PublicClient, from: bigint, latest: bigint, tabs: readonly Address[]) {
  if (tabs.length === 0) return [];
  return ranged(from, latest, (a, b) =>
    client.getLogs({
      address: USDC,
      event: spentEvent,
      args: { from: [...tabs] },
      fromBlock: a,
      toBlock: b,
    }),
  );
}

type RootLogs = Awaited<ReturnType<typeof readRootLogs>>;
type SpendLogs = Awaited<ReturnType<typeof readSpends>>;

/** Everything read for one root through `through`. */
type PortfolioScan = RootLogs & {
  spends: SpendLogs;
  through: bigint;
  tabs: Address[];
  times: Map<string, string>;
};

/** Scan only the blocks after the last scan. A scan that fails is not stored, so the next read retries it. */
async function scanFor(client: PublicClient, root: Address, latest: bigint, prior: PortfolioScan | undefined): Promise<PortfolioScan> {
  if (prior && prior.through >= latest) return prior;
  const from = prior ? prior.through + 1n : FACTORY_BLOCK;
  const logs = await readRootLogs(client, root, from, latest);
  const knownTabs = new Map<string, Address>();
  for (const tab of prior?.tabs ?? []) knownTabs.set(tab.toLowerCase(), tab);
  for (const log of logs.opened) {
    if (log.args.tab && log.args.agent) knownTabs.set(log.args.tab.toLowerCase(), log.args.tab);
  }
  const tabs = [...knownTabs.values()];
  const spends = await readSpends(client, from, latest, tabs);
  return {
    through: latest,
    tabs,
    opened: [...(prior?.opened ?? []), ...logs.opened],
    closed: [...(prior?.closed ?? []), ...logs.closed],
    moved: [...(prior?.moved ?? []), ...logs.moved],
    rotated: [...(prior?.rotated ?? []), ...logs.rotated],
    spends: [...(prior?.spends ?? []), ...spends],
    times: prior?.times ?? new Map<string, string>(),
  };
}

function rememberScan(key: string, scan: PortfolioScan): void {
  portfolioScans.delete(key);
  portfolioScans.set(key, scan);
  while (portfolioScans.size > SCAN_ROOTS_MAX) {
    const oldest = portfolioScans.keys().next().value;
    if (oldest === undefined) break;
    portfolioScans.delete(oldest);
  }
}

async function readPortfolioOnce(clients: Clients, root: Address): Promise<PortfolioRead> {
  await assertOurRoot(clients, root);
  const client = clients.public;
  const head = await withRpcRetry(() => client.getBlock({ blockTag: "latest" }));
  if (head.number == null) throw new Error("Arc did not return a block number.");
  const latest = head.number;
  const scanKey = root.toLowerCase();
  const scan = await scanFor(client, root, latest, portfolioScans.get(scanKey));
  rememberScan(scanKey, scan);
  const { opened, closed, moved, rotated, spends, times } = scan;
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

  const activity: PortfolioEvent[] = [];
  for (const log of opened) {
    if (!log.args.tab) continue;
    activity.push({
      kind: "opened",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      logIndex: log.logIndex == null ? undefined : String(log.logIndex),
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
      logIndex: log.logIndex == null ? undefined : String(log.logIndex),
      timestamp: await blockTime(client, log.blockNumber, times),
      tab: log.args.tab,
      amount: log.args.capReleased?.toString(),
      permissionless: log.args.permissionless === true,
      swept: log.args.swept === true,
    });
  }
  for (const log of moved) {
    activity.push({
      kind: "transfer",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      logIndex: log.logIndex == null ? undefined : String(log.logIndex),
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
      logIndex: log.logIndex == null ? undefined : String(log.logIndex),
      timestamp: await blockTime(client, log.blockNumber, times),
    });
  }
  for (const log of spends) {
    if (log.args.value == null) continue;
    const amount = erc20SpendRaw(log.address, log.args.value);
    if (amount == null) continue;
    activity.push({
      kind: "spend",
      tx: log.transactionHash,
      block: log.blockNumber.toString(),
      logIndex: log.logIndex == null ? undefined : String(log.logIndex),
      timestamp: await blockTime(client, log.blockNumber, times),
      tab: log.args.from,
      to: log.args.to,
      amount,
    });
  }
  activity.sort((a, b) => {
    const block = BigInt(b.block) - BigInt(a.block);
    if (block !== 0n) return block > 0n ? 1 : -1;
    const log = BigInt(b.logIndex ?? "-1") - BigInt(a.logIndex ?? "-1");
    if (log !== 0n) return log > 0n ? 1 : -1;
    return 0;
  });
  return { tabs, activity, asOf: head.timestamp.toString() };
}

export { factoryAbi, rootAbi, tabAbi, usdcAbi };
