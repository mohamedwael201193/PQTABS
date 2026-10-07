import { encodeAbiParameters, getAddress, keccak256, toBytes, type Hex } from "viem";

export const CHAIN_ID = 5042;
export const DOMAIN = keccak256(toBytes("PQTABS_V2"));

export function parseUsdcRaw(text: string): bigint {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter an amount with at most 6 decimal places.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(frac.padEnd(6, "0"));
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function signatureBytes(hex: string): number {
  const body = hex.trim().replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]+$/.test(body) || body.length % 2 !== 0) return -1;
  return body.length / 2;
}

export function encodeOpen(
  agent: string,
  payees: string[],
  maxPerCall: bigint,
  expiry: bigint,
  cap: bigint,
): Hex {
  return encodeAbiParameters(
    [
      { type: "uint8" },
      { type: "address" },
      { type: "address[]" },
      { type: "uint256" },
      { type: "uint64" },
      { type: "uint256" },
    ],
    [1, getAddress(agent), payees.map((payee) => getAddress(payee)), maxPerCall, expiry, cap],
  );
}

export function encodeClose(tab: string): Hex {
  return encodeAbiParameters(
    [{ type: "uint8" }, { type: "address" }],
    [2, getAddress(tab)],
  );
}

export function digestFor(root: string, nonce: bigint, deadline: bigint, action: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "bytes32" },
      ],
      [DOMAIN, BigInt(CHAIN_ID), getAddress(root), nonce, deadline, keccak256(action)],
    ),
  );
}
