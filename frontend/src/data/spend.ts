import { encodeAbiParameters, getAddress, hexToBytes, keccak256, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const USDC = "0x3600000000000000000000000000000000000000" as const;

const agentKeys = new Map<string, Hex>();

export function rememberAgentKey(address: string, privateKey: Hex): void {
  agentKeys.set(getAddress(address).toLowerCase(), privateKey);
}

export function recallAgentKey(address: string): Hex | null {
  return agentKeys.get(address.toLowerCase()) ?? null;
}

export function forgetAgentKeys(): void {
  agentKeys.clear();
}

export function createAgentKey(): { address: Hex } {
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  rememberAgentKey(address, privateKey);
  return { address };
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
