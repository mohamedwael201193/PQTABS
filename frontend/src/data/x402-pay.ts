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
