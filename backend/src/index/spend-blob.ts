import { type Address, type Hex, getAddress, hexToBigInt, hexToBytes, recoverTypedDataAddress, toHex } from "viem";
import { USDC } from "../constants.js";

/** 65-byte ECDSA, payee, value, validAfter, validBefore, nonce. Same layout as the browser signer. */
export type SpendBlob = {
  signature: Hex;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export type SpendTerms = {
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

export function parseSpendBlob(blob: Hex): SpendBlob | null {
  const bytes = hexToBytes(blob);
  if (bytes.length !== 213) return null;
  const signature = toHex(bytes.subarray(0, 65));
  if (signature.length !== 132) return null;
  return {
    signature,
    to: getAddress(toHex(bytes.subarray(65, 85))),
    value: hexToBigInt(toHex(bytes.subarray(85, 117))),
    validAfter: hexToBigInt(toHex(bytes.subarray(117, 149))),
    validBefore: hexToBigInt(toHex(bytes.subarray(149, 181))),
    nonce: toHex(bytes.subarray(181, 213)),
  };
}

export function sameSpendTerms(blob: SpendBlob, terms: SpendTerms): boolean {
  return (
    blob.to.toLowerCase() === terms.to.toLowerCase() &&
    blob.value === terms.value &&
    blob.validAfter === terms.validAfter &&
    blob.validBefore === terms.validBefore &&
    blob.nonce.toLowerCase() === terms.nonce.toLowerCase()
  );
}

/** Recovers the ECDSA signer of the USDC EIP-3009 digest. Throws if the signature is not recoverable. */
export function recoverSpendSigner(tab: Address, blob: SpendBlob): Promise<Address> {
  return recoverTypedDataAddress({
    domain: { name: "USDC", version: "2", chainId: 5042, verifyingContract: USDC },
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
      from: tab,
      to: blob.to,
      value: blob.value,
      validAfter: blob.validAfter,
      validBefore: blob.validBefore,
      nonce: blob.nonce,
    },
    signature: blob.signature,
  });
}
