import assert from "node:assert/strict";
import test from "node:test";
import { type Address, ContractFunctionExecutionError, ContractFunctionZeroDataError, type PublicClient } from "viem";
import { type Clients, PORTFOLIO_TTL_MS, portfolioClock, readPortfolio } from "../src/chain.js";
import { FACTORY_BLOCK, USDC } from "../src/constants.js";
import { noteRateLimit } from "../src/index/lane.js";
import { RequestError } from "../src/validate.js";

/**
 * Regression tests for the live portfolio fallback. The fake Arc client counts every call, so the tests can prove
 * that a read does not rescan from the factory block, that the cache is used, and that payments are counted once.
 */

const FACTORY_ADDRESS = "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323" as Address;
const REGISTRAR = "0x3333333333333333333333333333333333333333" as Address;
const OWNER = "0x4444444444444444444444444444444444444444" as Address;
const AGENT = "0x5555555555555555555555555555555555555555" as Address;
const PAYEE = "0x6666666666666666666666666666666666666666" as Address;
const TAB1 = "0x7777777777777777777777777777777777777777" as Address;
const TAB2 = "0x8888888888888888888888888888888888888888" as Address;

type ChainLog = {
  name: string;
  address: string;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: string;
  args: Record<string, unknown>;
};

type FakeTab = {
  cap: bigint;
  expiry: bigint;
  open: boolean;
  needsSweep: boolean;
  balance: bigint;
};

type FakeChain = {
  head: bigint;
  logs: ChainLog[];
  tabs: Map<string, FakeTab>;
  failGetLogs: boolean;
  calls: {
    getLogs: { address: string; name: string; fromBlock: bigint; toBlock: bigint }[];
    blocks: bigint[];
    other: number;
  };
};

function rootFor(n: number): Address {
  return `0x${n.toString(16).padStart(40, "0")}` as Address;
}

function hashFor(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function openedLog(root: Address, tab: Address, block: bigint, cap: bigint): ChainLog {
  return {
    name: "TabOpened",
    address: root,
    blockNumber: FACTORY_BLOCK + block,
    logIndex: 0,
    transactionHash: hashFor(Number(block)),
    args: { tab, agent: AGENT, cap, expiry: 1_800_000_000n, openExposure: cap },
  };
}

/** One USDC ERC-20 Transfer from a capability to the payee. The amount is six-decimal raw USDC. */
function spendLog(tab: Address, block: bigint, value: bigint): ChainLog {
  return {
    name: "Transfer",
    address: USDC,
    blockNumber: FACTORY_BLOCK + block,
    logIndex: 1,
    transactionHash: hashFor(Number(block) + 1_000),
    args: { from: tab, to: PAYEE, value },
  };
}

function fakeArc(): { chain: FakeChain; clients: Clients } {
  const chain: FakeChain = {
    head: FACTORY_BLOCK + 300n,
    logs: [],
    tabs: new Map(),
    failGetLogs: false,
    calls: { getLogs: [], blocks: [], other: 0 },
  };

  function resultFor(call: { address: string; functionName: string; args?: readonly unknown[] }): unknown {
    if (call.functionName === "tabs") {
      const tab = chain.tabs.get(String(call.args?.[0]).toLowerCase());
      if (!tab) throw new Error("unknown tab");
      return [tab.cap, tab.expiry, tab.open, tab.needsSweep];
    }
    if (call.functionName === "balanceOf") return chain.tabs.get(String(call.args?.[0]).toLowerCase())?.balance ?? 0n;
    const tab = chain.tabs.get(call.address.toLowerCase());
    if (!tab) throw new Error(`unknown contract ${call.address}`);
    switch (call.functionName) {
      case "owner":
        return OWNER;
      case "agent":
        return AGENT;
      case "maxPerCall":
        return 1_000_000n;
      case "expiry":
        return tab.expiry;
      case "payees":
        return [PAYEE];
      default:
        throw new Error(`unexpected function ${call.functionName}`);
    }
  }

  const client = {
    async getBlock(args: { blockTag?: string; blockNumber?: bigint }) {
      if (args.blockTag === "latest") return { number: chain.head, timestamp: 1_760_000_000n };
      chain.calls.blocks.push(args.blockNumber as bigint);
      return { timestamp: 1_760_000_000n + (args.blockNumber as bigint) };
    },
    async getLogs(args: {
      address: string;
      event?: { name: string };
      args?: { from?: readonly string[] };
      fromBlock: bigint;
      toBlock: bigint;
    }) {
      if (chain.failGetLogs) throw new Error("upstream exploded");
      const name = args.event?.name ?? "";
      chain.calls.getLogs.push({ address: args.address.toLowerCase(), name, fromBlock: args.fromBlock, toBlock: args.toBlock });
      const senders = args.args?.from?.map((item) => item.toLowerCase());
      return chain.logs.filter(
        (log) =>
          log.name === name &&
          log.address.toLowerCase() === args.address.toLowerCase() &&
          log.blockNumber >= args.fromBlock &&
          log.blockNumber <= args.toBlock &&
          (!senders || senders.includes(String(log.args.from).toLowerCase())),
      );
    },
    async readContract(args: { address: string; functionName: string }) {
      chain.calls.other += 1;
      if (args.functionName === "registrarOf") return REGISTRAR;
      if (args.functionName === "factory") return FACTORY_ADDRESS;
      throw new Error(`unexpected readContract ${args.functionName}`);
    },
    async multicall(args: { contracts: { address: string; functionName: string; args?: readonly unknown[] }[] }) {
      chain.calls.other += 1;
      return args.contracts.map((call) => ({ status: "success", result: resultFor(call) }));
    },
  };

  return {
    chain,
    clients: {
      public: client as unknown as PublicClient,
      relayer: null,
      relayerAddress: null,
      factory: FACTORY_ADDRESS,
    },
  };
}

const clock = { now: 1_000_000 };
portfolioClock.now = () => clock.now;

function lowestFromBlock(chain: FakeChain): bigint {
  const starts = chain.calls.getLogs.map((call) => call.fromBlock);
  return starts.reduce((low, value) => (value < low ? value : low));
}

function spendAmounts(activity: readonly { kind: string; amount?: string }[]): string[] {
  return activity
    .filter((event) => event.kind === "spend")
    .map((event) => event.amount ?? "")
    .sort();
}

test("the first read scans from the factory block once, and a repeat inside the TTL makes no Arc calls", async () => {
  const root = rootFor(1);
  const { chain, clients } = fakeArc();
  chain.logs.push(openedLog(root, TAB1, 100n, 5_000_000n), spendLog(TAB1, 200n, 2_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 3_000_000n });

  const first = await readPortfolio(clients, root);
  assert.equal(lowestFromBlock(chain), FACTORY_BLOCK, "the first read scans the whole history once");
  assert.deepEqual(first.tabs.map((tab) => tab.tab), [TAB1]);
  assert.equal(first.tabs[0].usdc, "3000000", "balance is the on-chain six-decimal USDC balance");
  assert.deepEqual(spendAmounts(first.activity), ["2000000"]);

  const getLogsAfterFirst = chain.calls.getLogs.length;
  const otherAfterFirst = chain.calls.other;
  const second = await readPortfolio(clients, root);
  assert.equal(second, first, "served from the short cache");
  assert.equal(chain.calls.getLogs.length, getLogsAfterFirst, "no log scan inside the TTL");
  assert.equal(chain.calls.other, otherAfterFirst, "no Arc reads inside the TTL");
});

test("after the TTL, a read scans only the blocks after the last one it saw, and counts each payment once", async () => {
  const root = rootFor(2);
  const { chain, clients } = fakeArc();
  chain.logs.push(openedLog(root, TAB1, 100n, 5_000_000n), spendLog(TAB1, 200n, 2_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 3_000_000n });
  await readPortfolio(clients, root);

  chain.head = FACTORY_BLOCK + 350n;
  chain.logs.push(openedLog(root, TAB2, 340n, 1_000_000n), spendLog(TAB1, 320n, 1_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 2_000_000n });
  chain.tabs.set(TAB2, { cap: 1_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 1_000_000n });
  chain.calls.getLogs.length = 0;
  chain.calls.blocks.length = 0;
  clock.now += PORTFOLIO_TTL_MS + 1;

  const next = await readPortfolio(clients, root);
  assert.equal(lowestFromBlock(chain), FACTORY_BLOCK + 301n, "resumes after the last scanned block");
  assert.deepEqual(
    chain.calls.blocks.map(String).sort(),
    [String(FACTORY_BLOCK + 320n), String(FACTORY_BLOCK + 340n)].sort(),
    "only the new blocks are fetched for timestamps",
  );
  assert.deepEqual(spendAmounts(next.activity), ["1000000", "2000000"], "the earlier payment is not counted twice");
  assert.equal(next.activity.filter((event) => event.kind === "opened").length, 2);
  assert.deepEqual(next.tabs.map((tab) => [tab.tab, tab.usdc]), [
    [TAB1, "2000000"],
    [TAB2, "1000000"],
  ]);
});

test("when the head has not moved, a read after the TTL scans no logs", async () => {
  const root = rootFor(3);
  const { chain, clients } = fakeArc();
  chain.logs.push(openedLog(root, TAB1, 100n, 5_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 5_000_000n });
  await readPortfolio(clients, root);
  chain.calls.getLogs.length = 0;
  clock.now += PORTFOLIO_TTL_MS + 1;
  await readPortfolio(clients, root);
  assert.equal(chain.calls.getLogs.length, 0);
});

test("a long cold scan is read in windows that Arc accepts", async () => {
  const root = rootFor(4);
  const { chain, clients } = fakeArc();
  chain.head = FACTORY_BLOCK + 25_000n;
  chain.logs.push(openedLog(root, TAB1, 100n, 5_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 5_000_000n });
  await readPortfolio(clients, root);
  const rootWindows = chain.calls.getLogs.filter((call) => call.address === root.toLowerCase() && call.name === "TabOpened");
  assert.equal(rootWindows.length, 3, "25,000 blocks take three 9,999-block windows");
  for (const call of chain.calls.getLogs) {
    assert.ok(call.toBlock - call.fromBlock < 10_000n, `window ${call.fromBlock}-${call.toBlock} is within Arc's limit`);
  }
});

test("a failed scan is not stored, so the next read scans the same blocks again", async () => {
  const root = rootFor(5);
  const { chain, clients } = fakeArc();
  chain.logs.push(openedLog(root, TAB1, 100n, 5_000_000n));
  chain.tabs.set(TAB1, { cap: 5_000_000n, expiry: 1_800_000_000n, open: true, needsSweep: false, balance: 5_000_000n });
  await readPortfolio(clients, root);

  chain.head = FACTORY_BLOCK + 360n;
  chain.failGetLogs = true;
  clock.now += PORTFOLIO_TTL_MS + 1;
  await assert.rejects(() => readPortfolio(clients, root), /upstream exploded/);

  chain.failGetLogs = false;
  chain.calls.getLogs.length = 0;
  await readPortfolio(clients, root);
  assert.equal(lowestFromBlock(chain), FACTORY_BLOCK + 301n, "the failed range is retried, not skipped");
});

test("an address with no contract code is refused as unknown_root, not as a server error", async () => {
  const root = rootFor(7);
  const { clients } = fakeArc();
  const client = clients.public as unknown as { readContract: (args: { address: string; functionName: string }) => Promise<unknown> };
  const read = client.readContract.bind(client);
  client.readContract = async (args) => {
    if (args.functionName === "factory" && args.address.toLowerCase() === root.toLowerCase()) {
      throw new ContractFunctionExecutionError(new ContractFunctionZeroDataError({ functionName: "factory" }), {
        abi: [],
        contractAddress: root,
        functionName: "factory",
      });
    }
    return read(args);
  };
  await assert.rejects(
    () => readPortfolio(clients, root),
    (error: unknown) => error instanceof RequestError && error.status === 400 && error.code === "unknown_root",
  );
});

test("while Arc is rate limiting, the live fallback refuses without making any Arc call", async () => {
  noteRateLimit();
  const root = rootFor(6);
  const { chain, clients } = fakeArc();
  await assert.rejects(
    () => readPortfolio(clients, root),
    (error: unknown) => error instanceof RequestError && error.status === 503,
  );
  assert.equal(chain.calls.getLogs.length, 0);
  assert.equal(chain.calls.blocks.length, 0);
  assert.equal(chain.calls.other, 0);
});
