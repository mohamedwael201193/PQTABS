import { type Address, type Hex, isAddress, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_CHAIN_ID, USDC_ADDRESS } from "./constants.js";
import { PqtabsError } from "./errors.js";

/** The EIP-3009 authorization that the capability signs. `from` is always the capability (tab). */
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

/**
 * The agent's signing boundary. The key lives inside the implementation.
 * The SDK passes only the authorization fields and receives a 65-byte signature.
 */
export interface AgentSigner {
  /** The agent address. It must equal the capability's on-chain agent, or the SDK refuses before signing. */
  readonly address: Address;
  signTransferAuthorization(authorization: TransferAuthorization): Promise<Hex>;
}

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function transferAuthorizationTypedData(authorization: TransferAuthorization) {
  return {
    domain: {
      name: "USDC",
      version: "2",
      chainId: authorization.chainId,
      verifyingContract: authorization.asset,
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
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

/**
 * A signer backed by a private key you already hold in your own process or secret store.
 * The key is read once and kept in a closure. It is never returned, logged, or sent to the backend.
 */
export function privateKeySigner(privateKey: Hex): AgentSigner {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new PqtabsError("invalid_config", "The agent private key must be a 32-byte hex string.");
  }
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    signTransferAuthorization: (authorization) =>
      account.signTypedData(transferAuthorizationTypedData(authorization)),
  };
}

/** A signer that delegates to a hardware wallet, KMS, or enclave. The address must be the capability agent. */
export function externalSigner(options: {
  address: Address;
  signTypedData: (typedData: ReturnType<typeof transferAuthorizationTypedData>) => Promise<Hex>;
}): AgentSigner {
  if (!isAddress(options.address)) {
    throw new PqtabsError("invalid_config", "The external signer needs a valid agent address.");
  }
  return {
    address: options.address,
    signTransferAuthorization: (authorization) => options.signTypedData(transferAuthorizationTypedData(authorization)),
  };
}

/** Recovers the address that signed the authorization, so the SDK can confirm it matches the agent. */
export function recoverAuthorizationSigner(authorization: TransferAuthorization, signature: Hex): Promise<Address> {
  return recoverTypedDataAddress({ ...transferAuthorizationTypedData(authorization), signature });
}

export const ARC_TRANSFER_DEFAULTS = { chainId: ARC_CHAIN_ID, asset: USDC_ADDRESS } as const;
