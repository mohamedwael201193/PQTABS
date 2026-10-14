import { keccak256, toBytes } from "viem";

const NAMES = [
  "InvalidSignature()",
  "BadNonce()",
  "Expired()",
  "DeadlineTooFar()",
  "ExposureExceeded()",
  "ExpiryNotFuture()",
  "ExpiryTooFar()",
  "TransferFailed()",
  "ZeroAddress()",
  "BadPayeeCount()",
  "MaxPerCallAboveCap()",
  "CapZero()",
  "UnexpectedTab()",
  "AlreadyClosed()",
  "NotExpired()",
  "ActionUnknown()",
  "BadSignatureLength()",
] as const;

const SELECTOR_TO_NAME = new Map(NAMES.map((name) => [keccak256(toBytes(name)).slice(0, 10), name.slice(0, -2)]));

const CAPABILITY: Record<string, string> = {
  InvalidSignature: "Arc rejected the security-key signature. The capability was not opened.",
  BadNonce: "The root nonce changed before this signature was included. The capability was not opened.",
  Expired: "The signature deadline passed. The capability was not opened.",
  DeadlineTooFar: "The signature deadline is too far ahead. The capability was not opened.",
  ExposureExceeded: "This amount would pass the exposure ceiling. The capability was not opened.",
  ExpiryNotFuture: "The expiry is not in the future. The capability was not opened.",
  ExpiryTooFar: "The expiry is more than 90 days away. The capability was not opened.",
  TransferFailed: "The root does not hold enough USDC for this cap. The capability was not opened.",
  ZeroAddress: "The agent or a recipient is not a usable address. The capability was not opened.",
  BadPayeeCount: "The recipient list is not valid. The capability was not opened.",
  MaxPerCallAboveCap: "The per-payment limit is above the cap. The capability was not opened.",
  CapZero: "The cap is zero. The capability was not opened.",
  UnexpectedTab: "The capability contract did not match the root's prediction. The capability was not opened.",
  ActionUnknown: "This root does not recognize that action. The capability was not opened.",
  BadSignatureLength: "The security-key signature is the wrong length. The capability was not opened.",
};

export function revertErrorName(data: string | null | undefined): string | null {
  if (!data || !data.startsWith("0x") || data.length < 10) return null;
  return SELECTOR_TO_NAME.get(data.slice(0, 10).toLowerCase()) ?? null;
}

export function revertPayload(error: unknown): string | null {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { data?: unknown; cause?: unknown; message?: unknown };
    if (typeof item.data === "string" && /^0x[a-fA-F0-9]{8,}$/.test(item.data)) return item.data;
    if (typeof item.message === "string") {
      const match = /0x[a-fA-F0-9]{8,}/.exec(item.message);
      if (match) return match[0];
    }
    current = item.cause;
  }
  return null;
}

/** A mined revert. The hash is the transaction that was included, not a request that failed before broadcast. */
export function capabilityRevertMessage(data: string | null, hash: string): string {
  const name = revertErrorName(data);
  const reason = (name && CAPABILITY[name]) || "Arc reverted this capability. It was not opened.";
  return `${reason} Transaction ${hash}.`;
}

export function broadcastRevertMessage(data: string | null, hash: string): string {
  const name = revertErrorName(data);
  const reason = name ? `Arc reverted this transaction (${name}).` : "Arc reverted this transaction.";
  return `${reason} Transaction ${hash}.`;
}
