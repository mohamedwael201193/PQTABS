import { getAddress } from "viem";

const USDC = "0x3600000000000000000000000000000000000000";
const ARC = "eip155:5042";
const ARCROUTER_PAYEE = "0x6bf001bb5f5e75396d92163325ca01fdebe2e9a9";

/** The live ArcRouter payee. Any other address stays an address. */
export function payeeLabel(payee: string): { name: string; category: "Service" | "Infrastructure" } {
  if (payee.toLowerCase() === ARCROUTER_PAYEE) return { name: "ArcRouter", category: "Service" };
  return { name: `${payee.slice(0, 6)}…${payee.slice(-4)}`, category: "Infrastructure" };
}

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

/** The Arc exact price from a 402. A Base row is not a quote. */
export function serviceQuote(paymentRequired: unknown): { price: string; payee: string; network: string } | null {
  const accepted = arcExactAccept(paymentRequired);
  const payee = servicePayee(paymentRequired);
  const price = accepted && typeof accepted.amount === "string" ? accepted.amount : "";
  if (!accepted || !payee || !/^[0-9]+$/.test(price)) return null;
  return { price, payee, network: ARC };
}

/** 6-decimal USDC raw units. A non-integer is not a price. */
export function formatRawUsdc(value: string): string {
  if (!/^[0-9]+$/.test(value)) return "—";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} USDC` : `${whole} USDC`;
}
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

/** The key on this device must be the agent the chain read named. A different address is not signed. */
export function agentCanSign(held: string, chainAgent: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(held) || !/^0x[0-9a-fA-F]{40}$/.test(chainAgent)) return false;
  return held.toLowerCase() === chainAgent.toLowerCase();
}

/** The expiry from the chain read on the decision. A missing or unsafe value is not signed. */
export function chainExpirySeconds(value: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("The capability expiry could not be read. Nothing was signed.");
  }
  const expiry = Number(value);
  if (!Number.isSafeInteger(expiry)) {
    throw new Error("The capability expiry could not be read. Nothing was signed.");
  }
  return expiry;
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
 * `nowSeconds` must be Arc's clock. A laptop clock is not used.
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

/** The service named a facilitator rejection and did not return a transaction. */
export function settlementFailure(payload: unknown): string {
  const body = record(payload);
  const reason = body && typeof body.error === "string" ? body.error.trim() : "";
  if (!reason) return "The service did not settle the payment. No Arc transaction was recorded.";
  return `The service did not settle the payment (${reason}). No Arc transaction was recorded.`;
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

/** The metered charge, when ArcRouter sends an integer. It is not the settlement amount. */
export function quotedCharge(header: string | null): string {
  const raw = (header ?? "").trim();
  return /^[0-9]+$/.test(raw) ? raw : "";
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

/** True only when the receipt succeeded and exactly one 6-decimal USDC log matches this spend. */
export function receiptSettlesSpend(receipt: SpendReceipt | null, expected: { from: string; to: string; value: string }): boolean {
  if (!receipt || (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1")) return false;
  const fromTopic = "0x" + expected.from.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const toTopic = "0x" + expected.to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = "0x" + BigInt(expected.value).toString(16).padStart(64, "0");
  const matches = (receipt.logs ?? []).filter((log) => {
    const topics = log.topics ?? [];
    return log.address?.toLowerCase() === USDC
      && topics[0]?.toLowerCase() === TRANSFER_TOPIC
      && topics[1]?.toLowerCase() === fromTopic
      && topics[2]?.toLowerCase() === toTopic
      && log.data?.toLowerCase() === data;
  });
  return matches.length === 1;
}
