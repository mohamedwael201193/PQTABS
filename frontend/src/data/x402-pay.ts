import { getAddress } from "viem";

const USDC = "0x3600000000000000000000000000000000000000";
const ARC = "eip155:5042";

export type SpendAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** The Arc exact accept, with the method field the facilitator requires before it checks the signature. */
export function arcExactAccept(paymentRequired: unknown): Record<string, unknown> | null {
  const body = record(paymentRequired);
  if (!body || !Array.isArray(body.accepts)) return null;
  for (const item of body.accepts) {
    const row = record(item);
    if (!row || row.scheme !== "exact" || row.network !== ARC) continue;
    if (typeof row.asset !== "string" || row.asset.toLowerCase() !== USDC) continue;
    const extra = record(row.extra) ?? {};
    return { ...row, extra: { ...extra, assetTransferMethod: "eip3009" } };
  }
  return null;
}

/** The Arc exact recipient. A Base row in the same 402 is ignored. */
export function servicePayee(paymentRequired: unknown): string | null {
  const accepted = arcExactAccept(paymentRequired);
  const payTo = accepted && typeof accepted.payTo === "string" ? accepted.payTo : "";
  if (!payTo) return null;
  try {
    return getAddress(payTo);
  } catch {
    return null;
  }
}

export function paymentSignatureHeader(
  paymentRequired: unknown,
  authorization: SpendAuthorization,
  signature: string,
): string {
  const accepted = arcExactAccept(paymentRequired);
  const body = record(paymentRequired);
  if (!accepted || !body) throw new Error("The service did not offer an Arc price.");
  const payload = {
    x402Version: 2,
    resource: body.resource ?? {},
    accepted,
    payload: {
      signature,
      authorization: {
        from: getAddress(authorization.from),
        to: getAddress(authorization.to),
        value: authorization.value,
        validAfter: authorization.validAfter,
        validBefore: authorization.validBefore,
        nonce: authorization.nonce,
      },
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The service's own timeout. A missing or short window is not a reason to use the capability expiry. */
export function serviceTimeoutSeconds(paymentRequired: unknown): number {
  const accepted = arcExactAccept(paymentRequired);
  const raw = accepted?.maxTimeoutSeconds;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "string" && /^[0-9]+$/.test(raw)) return Number(raw);
  return 0;
}

/**
 * The signature dies at the service timeout, and never after the capability.
 * The official exact client uses now + maxTimeoutSeconds.
 */
export function paymentDeadline(nowSeconds: number, expiryUnix: number, maxTimeoutSeconds: number): number {
  if (!Number.isInteger(maxTimeoutSeconds) || maxTimeoutSeconds <= 6) {
    throw new Error("The service did not set a usable payment window. Nothing was signed.");
  }
  const deadline = Math.min(expiryUnix, nowSeconds + maxTimeoutSeconds);
  if (deadline < nowSeconds + 6) {
    throw new Error("The capability expires too soon. Nothing was signed.");
  }
  return deadline;
}

/** A paid chat result is the assistant text. A 402 body, an error, or an empty completion is not a result. */
export function serviceAnswer(status: number, payload: unknown): string {
  if (status !== 200) return "";
  const body = record(payload);
  if (!body || body.error || body.accepts) return "";
  if (!Array.isArray(body.choices) || body.choices.length === 0) return "";
  const choice = record(body.choices[0]);
  const message = choice ? record(choice.message) : null;
  const content = message && typeof message.content === "string" ? message.content.trim() : "";
  return content;
}

export function transactionFromPaymentResponse(header: string | null): string {
  if (!header) return "";
  try {
    const decoded = JSON.parse(atob(header)) as { transaction?: unknown };
    const tx = decoded.transaction;
    return typeof tx === "string" && /^0x[0-9a-fA-F]{64}$/.test(tx) ? tx : "";
  } catch {
    return "";
  }
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type SpendReceipt = {
  status?: string | number | null;
  logs?: ReadonlyArray<{ address?: string; topics?: readonly string[]; data?: string }>;
};

/** True only when the receipt succeeded and the 6-decimal USDC log matches this spend once. */
export function receiptSettlesSpend(receipt: SpendReceipt | null, expected: { from: string; to: string; value: string }): boolean {
  if (!receipt || (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1")) return false;
  const fromTopic = "0x" + expected.from.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const toTopic = "0x" + expected.to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = "0x" + BigInt(expected.value).toString(16).padStart(64, "0");
  return (receipt.logs ?? []).some((log) => {
    const topics = log.topics ?? [];
    return log.address?.toLowerCase() === USDC
      && topics[0]?.toLowerCase() === TRANSFER_TOPIC
      && topics[1]?.toLowerCase() === fromTopic
      && topics[2]?.toLowerCase() === toTopic
      && log.data?.toLowerCase() === data;
  });
}
