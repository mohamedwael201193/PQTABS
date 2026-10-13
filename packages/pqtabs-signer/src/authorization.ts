import { type Address, getAddress, type Hex, isHex } from "viem";
import { SignerError } from "./errors.js";

/** Arc Mainnet. The signer refuses any other chain. */
export const ARC_CHAIN_ID = 5042;
/** The USDC ERC-20 interface on Arc. Its EIP-712 domain is name "USDC", version "2". */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

/** The EIP-3009 authorization that Barkeep verifies. `from` is always the capability (tab). */
export type TransferAuthorization = {
  chainId: number;
  asset: Address;
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function transferTypedData(authorization: TransferAuthorization) {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: authorization.chainId,
      verifyingContract: authorization.asset,
    },
    types: TRANSFER_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: authorization.from,
      to: authorization.to,
      value: authorization.value,
      validAfter: authorization.validAfter,
      validBefore: authorization.validBefore,
      nonce: authorization.nonce,
    },
  };
}

const UINT256_MAX = (1n << 256n) - 1n;

/**
 * Checks an authorization before anything is signed. Each refusal has a stable code.
 * The signer only signs Arc USDC transfers. Barkeep's on-chain caps and payee allowlist remain the real spend limits.
 */
export function assertSignableAuthorization(authorization: TransferAuthorization, now: bigint): void {
  if (authorization.chainId !== ARC_CHAIN_ID) {
    throw new SignerError("refused_chain", `Only Arc Mainnet (chain ${ARC_CHAIN_ID}) can be signed. Got ${authorization.chainId}.`);
  }
  if (getAddress(authorization.asset) !== ARC_USDC) {
    throw new SignerError("refused_asset", "Only Arc USDC can be signed.");
  }
  for (const [label, value] of [
    ["from", authorization.from],
    ["to", authorization.to],
  ] as const) {
    try {
      getAddress(value);
    } catch {
      throw new SignerError("refused_address", `The ${label} address is not valid.`);
    }
  }
  if (authorization.value <= 0n || authorization.value > UINT256_MAX) {
    throw new SignerError("refused_amount", "The amount must be a positive USDC value (6-decimal raw units).");
  }
  if (authorization.validAfter < 0n || authorization.validBefore <= authorization.validAfter) {
    throw new SignerError("refused_window", "The validity window is empty or inverted.");
  }
  if (authorization.validBefore <= now) {
    throw new SignerError("refused_expired", "This authorization has already expired. Nothing was signed.");
  }
  if (!isHex(authorization.nonce) || authorization.nonce.length !== 66) {
    throw new SignerError("refused_nonce", "The nonce must be 32 bytes.");
  }
}
