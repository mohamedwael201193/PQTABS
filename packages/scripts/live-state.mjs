// Reads the live Arc Mainnet state of the PQTABS agent, capability (tab), root, and payee.
// Read-only: eth_getCode, eth_getBalance, and eth_call only. No keys, no signing, no writes.
// Native gas on Arc is USDC: eth_getBalance is the 18-decimal native view. The ERC-20 balanceOf is
// the 6-decimal view of the same pool. The two are never mixed in one number here.
//
// Usage: node packages/scripts/live-state.mjs [agent] [tab] [root] [payee]

import { createRequire } from "node:module";

const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const { createPublicClient, getAddress, http, formatUnits, parseAbi } = require("viem");

const RPC = process.env.ARC_RPC_URL || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const USDC = getAddress("0x3600000000000000000000000000000000000000");

const defaults = {
  agent: "0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865",
  tab: "0x74EBd639bBd9A18B28682FD5148D4a0eC041bf9F",
  root: "0x2d0FdFafCC7E46226D3db00Ae976aA8f53996b95",
  payee: "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
};
const [agentArg, tabArg, rootArg, payeeArg] = process.argv.slice(2);
const targets = {
  agent: getAddress(agentArg || defaults.agent),
  tab: getAddress(tabArg || defaults.tab),
  root: getAddress(rootArg || defaults.root),
  payee: getAddress(payeeArg || defaults.payee),
};

const client = createPublicClient({ transport: http(RPC) });
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const tabAbi = parseAbi([
  "function agent() view returns (address)",
  "function factory() view returns (address)",
  "function expiry() view returns (uint64)",
]);
const rootAbi = parseAbi(["function factory() view returns (address)"]);
const factoryAbi = parseAbi(["function registrarOf(address) view returns (address)"]);

const head = await client.getBlock({ blockTag: "latest" });
const chainId = await client.getChainId();
if (chainId !== CHAIN_ID) throw new Error(`RPC reports chain ${chainId}, expected ${CHAIN_ID}`);

const out = {
  block: head.number.toString(),
  blockTimestamp: head.timestamp.toString(),
  chainId,
};

async function codeSize(address) {
  const code = await client.getCode({ address });
  return code === undefined || code === "0x" ? 0 : (code.length - 2) / 2;
}

// Agent: must be an externally owned account (no code). Native and ERC-20 balance shown separately.
const agentCode = await codeSize(targets.agent);
const agentNative = await client.getBalance({ address: targets.agent });
out.agent = {
  address: targets.agent,
  codeBytes: agentCode,
  isEOA: agentCode === 0,
  nativeUsdc18: agentNative.toString(),
  nativeUsdc: formatUnits(agentNative, 18),
};

// A read that reverts is reported as a revert, not thrown, so the other fields still print.
async function read(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, label, reason: error?.shortMessage || error?.name || "error" };
  }
}

// Tab (capability): its agent(), expiry(), and USDC ERC-20 balance (6 decimals).
const tabCode = await codeSize(targets.tab);
const tabAgent = await read("tab.agent", () => client.readContract({ address: targets.tab, abi: tabAbi, functionName: "agent" }));
const tabFactory = await read("tab.factory", () => client.readContract({ address: targets.tab, abi: tabAbi, functionName: "factory" }));
const tabExpiry = await read("tab.expiry", () => client.readContract({ address: targets.tab, abi: tabAbi, functionName: "expiry" }));
const tabBalance = await client.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [targets.tab] });
out.tab = {
  address: targets.tab,
  codeBytes: tabCode,
  agent: tabAgent.ok ? getAddress(tabAgent.value) : `unreadable (${tabAgent.reason})`,
  agentMatches: tabAgent.ok ? getAddress(tabAgent.value) === targets.agent : false,
  factory: tabFactory.ok ? getAddress(tabFactory.value) : `unreadable (${tabFactory.reason})`,
  expiry: tabExpiry.ok ? tabExpiry.value.toString() : `unreadable (${tabExpiry.reason})`,
  expired: tabExpiry.ok ? BigInt(tabExpiry.value) <= head.timestamp : null,
  usdcBalanceRaw6: tabBalance.toString(),
  usdcBalance: formatUnits(tabBalance, 6),
};

// Root: code, factory(), and the factory's registrarOf(root). A non-zero registrar means this is one of ours.
const rootCode = await codeSize(targets.root);
const rootFactory = await read("root.factory", () => client.readContract({ address: targets.root, abi: rootAbi, functionName: "factory" }));
let registrar = null;
if (rootFactory.ok) {
  const r = await read("factory.registrarOf", () => client.readContract({ address: getAddress(rootFactory.value), abi: factoryAbi, functionName: "registrarOf", args: [targets.root] }));
  registrar = r.ok ? getAddress(r.value) : `unreadable (${r.reason})`;
}
out.root = {
  address: targets.root,
  codeBytes: rootCode,
  factory: rootFactory.ok ? getAddress(rootFactory.value) : `unreadable (${rootFactory.reason})`,
  registrar,
  registered: typeof registrar === "string" && registrar.startsWith("0x") ? registrar !== "0x0000000000000000000000000000000000000000" : null,
};

// Payee: code (an EOA payee has none) and USDC ERC-20 balance (6 decimals). Only a read.
const payeeCode = await codeSize(targets.payee);
const payeeBalance = await client.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [targets.payee] });
out.payee = {
  address: targets.payee,
  codeBytes: payeeCode,
  usdcBalanceRaw6: payeeBalance.toString(),
  usdcBalance: formatUnits(payeeBalance, 6),
};

console.log(JSON.stringify(out, null, 2));
