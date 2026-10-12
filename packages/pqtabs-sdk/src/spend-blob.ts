import { type Address, bytesToHex, getAddress, type Hex, hexToBigInt, hexToBytes, pad, toHex } from "viem";
import { SPEND_BLOB_BYTES } from "./constants.js";
import { PqtabsError } from "./errors.js";

export type SpendBlobFields = {
  /** 65-byte ECDSA signature of the USDC EIP-3009 digest. */
  signature: Hex;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

/**
 * Packs the 213-byte authorization the backend parses (backend/src/index/spend-blob.ts).
 * Same layout as the browser signer in frontend/src/data/spend.ts.
 */
export function encodeSpendBlob(fields: SpendBlobFields): Hex {
  const signature = hexToBytes(fields.signature);
  if (signature.length !== 65) {
    throw new PqtabsError("invalid_input", "The authorization signature must be 65 bytes.");
  }
  const out = new Uint8Array(SPEND_BLOB_BYTES);
  out.set(signature, 0);
  out.set(hexToBytes(getAddress(fields.to)), 65);
  out.set(hexToBytes(pad(toHex(fields.value), { size: 32 })), 85);
  out.set(hexToBytes(pad(toHex(fields.validAfter), { size: 32 })), 117);
  out.set(hexToBytes(pad(toHex(fields.validBefore), { size: 32 })), 149);
  out.set(hexToBytes(pad(fields.nonce, { size: 32 })), 181);
  return bytesToHex(out);
}

/** Inverse of encodeSpendBlob. Used by tests and by the resume path to check a stored blob. */
export function decodeSpendBlob(blob: Hex): SpendBlobFields {
  const bytes = hexToBytes(blob);
  if (bytes.length !== SPEND_BLOB_BYTES) {
    throw new PqtabsError("invalid_input", `The authorization must be ${SPEND_BLOB_BYTES} bytes.`);
  }
  return {
    signature: bytesToHex(bytes.subarray(0, 65)),
    to: getAddress(bytesToHex(bytes.subarray(65, 85))),
    value: hexToBigInt(bytesToHex(bytes.subarray(85, 117))),
    validAfter: hexToBigInt(bytesToHex(bytes.subarray(117, 149))),
    validBefore: hexToBigInt(bytesToHex(bytes.subarray(149, 181))),
    nonce: bytesToHex(bytes.subarray(181, 213)),
  };
}
