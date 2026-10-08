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
export function decideHttpPayment(status: number, payload: unknown, facts: SpendContext): QuotedDecision {
  const empty = { resource: "", price: "", asset: "", network: "", payee: "" };
  if (status !== 402) return { decision: "NO_PAYMENT", reason: ["service_unavailable"], ...empty };
  const quote = arcQuote(payload);
  if (!quote) return { decision: "NO_PAYMENT", reason: ["no_arc_exact"], ...empty };
  const decision = decideSpend({
    ...facts,
    amount: BigInt(quote.price),
    payee: quote.payee,
    serviceAvailable: true,
  });
  return { ...decision, ...quote };
}
