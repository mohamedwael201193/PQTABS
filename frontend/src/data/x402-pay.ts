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
