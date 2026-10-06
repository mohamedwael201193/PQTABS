import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  type Hex,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, FACTORY, MIN_FEE, RPC_URL } from "./constants.js";
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

export { factoryAbi, rootAbi, tabAbi, usdcAbi };
