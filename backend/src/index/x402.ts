import { USDC } from "../constants.js";
import { decideSpend, type Decision, type SpendFacts } from "./decide.js";

const ARC_NETWORK = "eip155:5042";

export type ArcQuote = {
  resource: string;
  price: string;
  asset: string;
  network: string;
  payee: string;
};

export type QuotedDecision = Decision & {
  resource: string;
  price: string;
  asset: string;
  network: string;
  payee: string;
  agent: string;
  remaining_capability_balance: string;
  maxPerCall: string;
  root_exposure: string;
  maxOpenExposure: string;
  expiry: string;
};

type SpendContext = Omit<SpendFacts, "amount" | "payee" | "serviceAvailable">;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

/** The Arc `exact` USDC requirement. A Base requirement in the same document is ignored. */
export function arcQuote(payload: unknown): ArcQuote | null {
  const body = asRecord(payload);
  if (!body || !Array.isArray(body.accepts)) return null;
  const resource = asRecord(body.resource);
  const url = resource && typeof resource.url === "string" ? resource.url : "";
  for (const item of body.accepts) {
    const row = asRecord(item);
    if (!row) continue;
    if (row.scheme !== "exact" || row.network !== ARC_NETWORK) continue;
    if (typeof row.asset !== "string" || row.asset.toLowerCase() !== USDC.toLowerCase()) continue;
    if (typeof row.amount !== "string" || !/^[0-9]+$/.test(row.amount)) continue;
    if (typeof row.payTo !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(row.payTo)) continue;
    return { resource: url, price: row.amount, asset: USDC, network: ARC_NETWORK, payee: row.payTo };
  }
  return null;
}

/**
 * A non-402 response is not a price. A 402 is a price only when it contains an Arc exact USDC requirement.
 * This does not sign or settle.
 */
function factRecord(facts: SpendContext) {
  return {
    agent: facts.tabAgent,
    remaining_capability_balance: facts.balance.toString(),
    maxPerCall: facts.maxPerCall.toString(),
    root_exposure: facts.openExposure.toString(),
    maxOpenExposure: facts.maxOpenExposure.toString(),
    expiry: facts.expiry.toString(),
  };
}

export function decideHttpPayment(status: number, payload: unknown, facts: SpendContext): QuotedDecision {
  const empty = { resource: "", price: "", asset: "", network: "", payee: "", ...factRecord(facts) };
  if (status !== 402) return { decision: "NO_PAYMENT", reason: ["service_unavailable"], ...empty };
  const quote = arcQuote(payload);
  if (!quote) return { decision: "NO_PAYMENT", reason: ["no_arc_exact"], ...empty };
  const decision = decideSpend({
    ...facts,
    amount: BigInt(quote.price),
    payee: quote.payee,
    serviceAvailable: true,
  });
  return { ...decision, ...quote, ...factRecord(facts) };
}

/** A verify response is not a payment, including `isValid: true`. */
export function readVerify(payload: unknown): Decision {
  const body = asRecord(payload);
  if (!body || body.isValid !== true) {
    const reason = body && typeof body.invalidReason === "string" ? body.invalidReason : "verify_rejected";
    return { decision: "NO_PAYMENT", reason: [reason] };
  }
  return { decision: "NO_PAYMENT", reason: ["verify_is_not_settlement"] };
}

/** A settlement counts only when the facilitator reports success and a transaction hash. */
export function readSettlement(payload: unknown): Decision & { tx: string } {
  const body = asRecord(payload);
  const tx = body && typeof body.transaction === "string" ? body.transaction : "";
  if (!body || body.success !== true || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    const reason = body && typeof body.errorReason === "string" ? body.errorReason : "not_settled";
    return { decision: "NO_PAYMENT", reason: [reason], tx: "" };
  }
  return { decision: "ALLOW", reason: ["facilitator_reported_tx"], tx };
}

/**
 * The ArcRouter facilitator checks the EIP-3009 signature only when `extra.assetTransferMethod` is `eip3009`.
 * Without that field it reports `invalid_exact_evm_signature` for a signature the token accepts.
 */
export function withEip3009Method(accept: Record<string, unknown>): Record<string, unknown> {
  const extra = asRecord(accept.extra) ?? {};
  return { ...accept, extra: { ...extra, assetTransferMethod: "eip3009" } };
}

/** The Arc exact accept from a 402, with the method field the facilitator requires. */
export function arcPaymentAccept(payload: unknown): Record<string, unknown> | null {
  const body = asRecord(payload);
  if (!body || !Array.isArray(body.accepts) || !arcQuote(payload)) return null;
  for (const item of body.accepts) {
    const row = asRecord(item);
    if (!row || row.scheme !== "exact" || row.network !== ARC_NETWORK) continue;
    if (typeof row.asset !== "string" || row.asset.toLowerCase() !== USDC.toLowerCase()) continue;
    return withEip3009Method(row);
  }
  return null;
}
