import { type Address, encodeFunctionData, type Hex, isAddress } from "viem";
import { SIG_LEN, SPEND_BLOB_LEN } from "./constants.js";

export type HttpStatus = 400 | 409 | 413 | 429 | 500 | 503;

export class RequestError extends Error {
  constructor(
    readonly status: HttpStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function asAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new RequestError(400, "bad_address", `${field} is not an address`);
  }
  return value;
}

export function asHex(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw new RequestError(400, "bad_hex", `${field} is not hex`);
  }
  return value as Hex;
}

export function asUint(value: unknown, field: string): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new RequestError(400, "bad_integer", `${field} must be a decimal string`);
  }
  return BigInt(value);
}

function byteLength(hex: Hex): number {
  return (hex.length - 2) / 2;
}

export function encodeExecute(action: Hex, nonce: bigint, deadline: bigint, signature: Hex): Hex {
  if (byteLength(signature) !== SIG_LEN) {
    throw new RequestError(400, "bad_signature_length", "PQ signature must be 7856 bytes");
  }
  if (byteLength(action) === 0 || byteLength(action) > 4096) {
    throw new RequestError(400, "bad_action", "action is empty or too large");
  }
  if (nonce > 0xffffffffffffffffn || deadline > 0xffffffffffffffffn) {
    throw new RequestError(400, "bad_integer", "nonce and deadline are uint64");
  }
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "execute",
        stateMutability: "nonpayable",
        inputs: [
          { name: "action", type: "bytes" },
          { name: "nonce", type: "uint64" },
          { name: "deadline", type: "uint64" },
          { name: "signature", type: "bytes" },
        ],
        outputs: [],
      },
    ],
    functionName: "execute",
    args: [action, nonce, deadline, signature],
  });
}

export function encodeReclaim(tab: Address): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "reclaim",
        stateMutability: "nonpayable",
        inputs: [{ name: "tab", type: "address" }],
        outputs: [],
      },
    ],
    functionName: "reclaim",
    args: [tab],
  });
}

export function encodeRetrySweep(tab: Address): Hex {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "retrySweep",
        stateMutability: "nonpayable",
        inputs: [{ name: "tab", type: "address" }],
        outputs: [],
      },
    ],
    functionName: "retrySweep",
    args: [tab],
  });
}

export function encodeSpend(args: {
  tab: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
}): Hex {
  if (byteLength(args.signature) !== SPEND_BLOB_LEN) {
    throw new RequestError(400, "bad_signature_length", "spend blob must be 213 bytes");
  }
  if (byteLength(args.nonce) !== 32) {
    throw new RequestError(400, "bad_nonce", "USDC nonce must be 32 bytes");
  }
  if (args.value === 0n) {
    throw new RequestError(400, "bad_amount", "value must be positive");
  }
  if (args.to.toLowerCase() === args.tab.toLowerCase()) {
    throw new RequestError(400, "bad_payee", "payee must not be the tab");
  }
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "transferWithAuthorization",
        stateMutability: "nonpayable",
        inputs: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "signature", type: "bytes" },
        ],
        outputs: [],
      },
    ],
    functionName: "transferWithAuthorization",
    args: [args.tab, args.to, args.value, args.validAfter, args.validBefore, args.nonce, args.signature],
  });
}
