"use client";

import { createPublicClient, createWalletClient, custom, defineChain, getAddress, http, type Address, type Hex } from "viem";

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

const FACTORY = "0x05545F026b75f03aE9Cf1eA8a8373473c94ed323" as const;
const USDC = "0x3600000000000000000000000000000000000000" as const;

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function provider(): EthereumProvider {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum) throw new Error("No wallet is available in this browser.");
  return ethereum;
}

export function walletClient() {
  return createWalletClient({ chain: arc, transport: custom(provider()) });
}

export function arcClient() {
  return createPublicClient({ chain: arc, transport: http("https://rpc.mainnet.arc.io") });
}

export async function existingAccount(): Promise<Address | null> {
  const ethereum = (window as Window & { ethereum?: EthereumProvider & { selectedAddress?: string } }).ethereum;
  if (!ethereum) return null;
  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  const selected = ethereum.selectedAddress;
  const match = selected
    ? accounts.find((item) => item.toLowerCase() === selected.toLowerCase())
    : undefined;
  const chosen = match ?? accounts[0];
  return chosen ? getAddress(chosen as Address) : null;
}

export async function connectWallet(): Promise<{ address: Address; chainId: number }> {
  const client = walletClient();
  const already = await existingAccount();
  const address = already ?? (await client.requestAddresses())[0];
  if (!address) throw new Error("The wallet did not connect.");
  const chainId = await client.getChainId();
  return { address: getAddress(address), chainId };
}

export async function switchToArc(): Promise<void> {
  const ethereum = provider();
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] });
  } catch {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x13b2",
          chainName: "Arc",
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.arc.io"],
          blockExplorerUrls: ["https://explorer.arc.io"],
        },
      ],
    });
  }
}

export function watchChain(onChange: (chainId: number) => void): () => void {
  const ethereum = provider();
  const changed = (value: unknown) => {
    const chainId = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
    if (Number.isFinite(chainId)) onChange(chainId);
  };
  ethereum.on?.("chainChanged", changed);
  return () => ethereum.removeListener?.("chainChanged", changed);
}

export function watchWallet(onChange: (address: Address | null) => void): () => void {
  const ethereum = provider();
  const accounts = (value: unknown) => {
    const list = Array.isArray(value) ? value : [];
    const next = typeof list[0] === "string" ? (list[0] as Address) : null;
    onChange(next);
  };
  ethereum.on?.("accountsChanged", accounts);
  return () => ethereum.removeListener?.("accountsChanged", accounts);
}

const factoryAbi = [
  {
    type: "function",
    name: "createRoot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vk", type: "bytes32" },
      { name: "maxOpenExposure", type: "uint256" },
      { name: "userSalt", type: "bytes32" },
    ],
    outputs: [{ name: "root", type: "address" }],
  },
] as const;

const usdcAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** The connected wallet is the registrar. It creates the root. It is not the PQ authority. */
export async function createSecurityDomain(vk: Hex, maxOpenExposure: bigint, userSalt: Hex): Promise<Hex> {
  const account = await existingAccount();
  if (!account) throw new Error("Connect a wallet before creating a security domain.");
  const client = walletClient();
  return client.writeContract({
    account,
    address: FACTORY,
    abi: factoryAbi,
    functionName: "createRoot",
    args: [vk, maxOpenExposure, userSalt],
    chain: arc,
  });
}

export async function waitForRoot(hash: Hex): Promise<Address> {
  const receipt = await arcClient().waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Arc rejected the security domain.");
  const log = receipt.logs.find((item) => item.address.toLowerCase() === FACTORY.toLowerCase() && item.topics[2]);
  if (!log?.topics[2]) throw new Error("The receipt did not include a root.");
  return getAddress(`0x${log.topics[2].slice(-40)}`);
}

export async function fundRoot(root: Address, amountRaw: bigint): Promise<Hex> {
  const account = await existingAccount();
  if (!account) throw new Error("Connect a wallet before depositing.");
  const client = walletClient();
  return client.writeContract({
    account,
    address: USDC,
    abi: usdcAbi,
    functionName: "transfer",
    args: [root, amountRaw],
    chain: arc,
  });
}
