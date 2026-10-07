import { encodeAbiParameters, getAddress, hexToBytes, keccak256, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadAgentKeys, openAgentBackup, saveAgentKey, sealAgentBackup } from "./agent-vault";

export const USDC = "0x3600000000000000000000000000000000000000" as const;

const agentKeys = new Map<string, Hex>();
let vaultGeneration = 0;

function registrarNow(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem("pqtabs.registrar");
  return stored && stored.startsWith("0x") && stored.length === 42 ? stored : "";
}

export function rememberAgentKey(address: string, privateKey: Hex): void {
  agentKeys.set(getAddress(address).toLowerCase(), privateKey);
}

export function recallAgentKey(address: string): Hex | null {
  return agentKeys.get(address.toLowerCase()) ?? null;
}

export function forgetAgentKeys(): void {
  vaultGeneration += 1;
  agentKeys.clear();
}

export async function createAgentKey(): Promise<{ address: Hex }> {
  vaultGeneration += 1;
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  const registrar = registrarNow();
  if (registrar) await saveAgentKey(registrar, address, privateKey);
  rememberAgentKey(address, privateKey);
  return { address };
}

export async function restoreAgentKeys(registrar: string): Promise<void> {
  const ticket = ++vaultGeneration;
  const keys = await loadAgentKeys(registrar);
  if (ticket !== vaultGeneration) return;
  agentKeys.clear();
  for (const privateKey of keys) rememberAgentKey(privateKeyToAccount(privateKey).address, privateKey);
}

export async function downloadAgentBackup(address: string, passphrase: string): Promise<void> {
  const privateKey = recallAgentKey(address);
  if (!privateKey) throw new Error("This browser does not hold that agent key.");
  const body = await sealAgentBackup(privateKey, address, passphrase);
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pqtabs-agent-${address.slice(2, 8).toLowerCase()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importAgentBackup(registrar: string, fileText: string, passphrase: string): Promise<Hex> {
  const opened = await openAgentBackup(fileText, passphrase);
  await saveAgentKey(registrar, opened.address, opened.privateKey);
  rememberAgentKey(opened.address, opened.privateKey);
  return opened.address;
}

export async function authorizationBlob(
  privateKey: Hex,
  tab: string,
  to: string,
  value: bigint,
  validBefore: bigint,
): Promise<{ blob: Hex; nonce: Hex }> {
  const account = privateKeyToAccount(privateKey);
  const nonce = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
  const payee = getAddress(to);
  const signature = await account.signTypedData({
    domain: {
      name: "USDC",
      version: "2",
      chainId: 5042,
      verifyingContract: USDC,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: getAddress(tab),
      to: payee,
      value,
      validAfter: BigInt(0),
      validBefore,
      nonce,
    },
  });
  const blob = new Uint8Array(213);
  blob.set(hexToBytes(signature), 0);
  blob.set(hexToBytes(payee), 65);
  blob.set(word(value), 85);
  blob.set(word(BigInt(0)), 117);
  blob.set(word(validBefore), 149);
  blob.set(hexToBytes(nonce), 181);
  return { blob: toHex(blob), nonce };
}

function word(value: bigint): Uint8Array {
  return hexToBytes(encodeAbiParameters([{ type: "uint256" }], [value]));
}
