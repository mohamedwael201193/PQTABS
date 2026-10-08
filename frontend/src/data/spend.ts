import { encodeAbiParameters, getAddress, hexToBytes, keccak256, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { loadAgentKeys, openAgentBackup, saveAgentKey, sealAgentBackup } from "./agent-vault";
import {
  clearRememberedKeys,
  nextVaultTicket,
  recallAgentKey,
  rememberAgentKey,
  rememberFromPrivateKey,
  vaultTicketCurrent,
} from "./agent-session";

export { browserHoldsAgentKey, forgetAgentKeys, recallAgentKey, rememberAgentKey } from "./agent-session";

export const USDC = "0x3600000000000000000000000000000000000000" as const;

function registrarNow(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem("pqtabs.registrar");
  return stored && stored.startsWith("0x") && stored.length === 42 ? stored : "";
}

export async function createAgentKey(): Promise<{ address: Hex }> {
  nextVaultTicket();
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  const registrar = registrarNow();
  if (registrar) await saveAgentKey(registrar, address, privateKey);
  rememberAgentKey(address, privateKey);
  return { address };
}

export async function restoreAgentKeys(registrar: string): Promise<void> {
  const ticket = nextVaultTicket();
  const keys = await loadAgentKeys(registrar);
  if (!vaultTicketCurrent(ticket)) return;
  clearRememberedKeys();
  for (const privateKey of keys) rememberFromPrivateKey(privateKey);
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
