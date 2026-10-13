import { type Address, type Hex, hashTypedData, isAddress, recoverTypedDataAddress } from "viem";
import { ARC_CHAIN_ID, USDC_ADDRESS } from "./constants.js";
import { PqtabsError } from "./errors.js";
import { type AgentSigner, TRANSFER_WITH_AUTHORIZATION_TYPES, type TransferAuthorization, transferAuthorizationTypedData } from "./signer.js";

/**
 * Circle developer-controlled wallet adapter for the Barkeep authorization.
 *
 * Circle's developer-controlled signing API (`POST /developer/sign/typedData`) takes the EIP-712 data as a JSON
 * string and returns a signature. This adapter does not import Circle's SDK and holds no credentials. The caller
 * passes a `signTypedData` function that performs the Circle request, so a test or a fake can replace it.
 *
 * The adapter refuses anything it cannot prove for Arc mainnet:
 * - the blockchain must be `ARC` (Arc mainnet, chain 5042). `ARC-TESTNET` is refused.
 * - the authorization must be Arc USDC `TransferWithAuthorization` data, from the capability (tab).
 * - the returned signature is normalized (v in {27, 28}, low-s, EIP-2) and must recover to the wallet address.
 *
 * A Circle EOA is not a contract account. Barkeep's tab accepts an ECDSA signature from its agent address,
 * so this adapter applies only to a developer-controlled EOA on Arc.
 */

export const CIRCLE_ARC_MAINNET = "ARC" as const;
export const SECP256K1_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

export type CircleSignTypedDataRequest = {
  walletId?: string;
  walletAddress?: string;
  blockchain?: typeof CIRCLE_ARC_MAINNET;
  /** EIP-712 typed data as a JSON string, the same shape Circle's API expects. */
  data: string;
  memo?: string;
};

export type CircleSignTypedData = (request: CircleSignTypedDataRequest) => Promise<{ signature: string }>;

export type CircleSignerOptions = {
  /** The Circle wallet's EOA address. The recovered signer must equal it. */
  address: Address;
  /** Circle's wallet id. Use this or the address, not both. Using the address needs `blockchain`. */
  walletId?: string;
  /** Must be `ARC`. The adapter is for Arc mainnet only. */
  blockchain: typeof CIRCLE_ARC_MAINNET | "ARC-TESTNET";
  /** The Circle request. Wrap your Circle SDK or REST client here. It must not log or store the request. */
  signTypedData: CircleSignTypedData;
  memo?: string;
};

const EIP712_DOMAIN_TYPES = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

/** Circle's typed-data JSON. Every uint256 value is a decimal string, because JSON cannot hold a bigint. */
export function toCircleTypedDataJson(typed: ReturnType<typeof transferAuthorizationTypedData>): string {
  const message = typed.message;
  return JSON.stringify({
    types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...typed.types },
    domain: {
      name: typed.domain.name,
      version: typed.domain.version,
      chainId: typed.domain.chainId,
      verifyingContract: typed.domain.verifyingContract,
    },
    primaryType: typed.primaryType,
    message: {
      from: message.from,
      to: message.to,
      value: message.value.toString(),
      validAfter: message.validAfter.toString(),
      validBefore: message.validBefore.toString(),
      nonce: message.nonce,
    },
  });
}

/** Rebuilds the typed data from Circle's JSON, restoring the uint256 fields to bigint. Used to check the round trip. */
export function fromCircleTypedDataJson(json: string): ReturnType<typeof transferAuthorizationTypedData> {
  const parsed = JSON.parse(json) as {
    domain: { name: string; version: string; chainId: number; verifyingContract: Address };
    primaryType: "TransferWithAuthorization";
    message: Record<string, string>;
  };
  return {
    domain: parsed.domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: parsed.primaryType,
    message: {
      from: parsed.message.from as Address,
      to: parsed.message.to as Address,
      value: BigInt(parsed.message.value),
      validAfter: BigInt(parsed.message.validAfter),
      validBefore: BigInt(parsed.message.validBefore),
      nonce: parsed.message.nonce as Hex,
    },
  };
}

/**
 * Parses a 65-byte signature, normalizes v to 27 or 28, and moves s into the low half (EIP-2).
 * Barkeep's tab rejects v in {0, 1} and a high s, so both are fixed here, never accepted as is.
 */
export function normalizeSignature(signature: string): Hex {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new PqtabsError("signer_unavailable", "The signer returned a signature that is not 65 bytes. Nothing was broadcast.");
  }
  const r = BigInt(`0x${signature.slice(2, 66)}`);
  let s = BigInt(`0x${signature.slice(66, 130)}`);
  let v = Number.parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;
  if (v !== 27 && v !== 28) {
    throw new PqtabsError("signer_unavailable", "The signer returned an invalid recovery id. Nothing was broadcast.");
  }
  if (r === 0n || s === 0n || r >= SECP256K1_ORDER || s >= SECP256K1_ORDER) {
    throw new PqtabsError("signer_unavailable", "The signer returned an out-of-range signature. Nothing was broadcast.");
  }
  if (s > SECP256K1_ORDER / 2n) {
    s = SECP256K1_ORDER - s;
    v = v === 27 ? 28 : 27;
  }
  return `0x${r.toString(16).padStart(64, "0")}${s.toString(16).padStart(64, "0")}${v.toString(16)}`;
}

function assertAuthorization(authorization: TransferAuthorization): void {
  if (authorization.chainId !== ARC_CHAIN_ID) {
    throw new PqtabsError("invalid_input", "This signer only signs for Arc mainnet (chain 5042). Nothing was signed.");
  }
  if (authorization.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new PqtabsError("invalid_input", "This signer only signs Arc USDC authorizations. Nothing was signed.");
  }
  if (!isAddress(authorization.from) || !isAddress(authorization.to)) {
    throw new PqtabsError("invalid_input", "The authorization has an invalid address. Nothing was signed.");
  }
  if (authorization.value <= 0n) {
    throw new PqtabsError("invalid_input", "The authorization amount must be positive. Nothing was signed.");
  }
  if (authorization.validBefore <= authorization.validAfter) {
    throw new PqtabsError("invalid_input", "The authorization window is empty. Nothing was signed.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) {
    throw new PqtabsError("invalid_input", "The authorization nonce must be 32 bytes. Nothing was signed.");
  }
}

/** A signer whose key is a Circle developer-controlled EOA on Arc mainnet. The key never reaches this process. */
export function circleDeveloperSigner(options: CircleSignerOptions): AgentSigner {
  if (!isAddress(options.address)) {
    throw new PqtabsError("invalid_config", "The Circle wallet address is not valid.");
  }
  if (options.blockchain !== CIRCLE_ARC_MAINNET) {
    throw new PqtabsError("invalid_config", "The Circle signer is for Arc mainnet only. ARC-TESTNET is refused.");
  }
  const address = options.address;

  return {
    address,
    async signTransferAuthorization(authorization: TransferAuthorization): Promise<Hex> {
      assertAuthorization(authorization);
      const typed = transferAuthorizationTypedData(authorization);
      const data = toCircleTypedDataJson(typed);
      const request: CircleSignTypedDataRequest = options.walletId
        ? { walletId: options.walletId, data, ...(options.memo ? { memo: options.memo } : {}) }
        : { walletAddress: address, blockchain: CIRCLE_ARC_MAINNET, data, ...(options.memo ? { memo: options.memo } : {}) };

      let response: { signature: string };
      try {
        response = await options.signTypedData(request);
      } catch {
        // Never forward the provider error. It can carry request details.
        throw new PqtabsError("signer_unavailable", "The Circle signer did not return a signature. Nothing was broadcast.");
      }
      const signature = normalizeSignature(response.signature);
      const recovered = await recoverTypedDataAddress({ ...typed, signature });
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        throw new PqtabsError("signer_mismatch", "The Circle signature does not recover to this wallet. Nothing was broadcast.");
      }
      return signature;
    },
  };
}

/** The digest the tab will check. Exposed so tests and the MCP can compare the round trip exactly. */
export function circleTypedDataDigest(authorization: TransferAuthorization): Hex {
  return hashTypedData(transferAuthorizationTypedData(authorization));
}
