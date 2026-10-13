import { USDC } from "../constants.js";

/** Circle's facilitator documents this CAIP-2 id for Arc mainnet. Not advertised on the live quote. */
export const EXACT_NETWORK = "eip155:5042";

export type ExactAccept = {
  scheme: "exact";
  network: typeof EXACT_NETWORK;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: "USDC"; version: "2"; quoteId: string; bodyHash: string };
};

export type SettlementReport = {
  status: string;
  network: string;
  asset: string;
  payee: string;
  amount: string;
  txHash: string;
  quoteId: string;
};

export type SettlementVerdict =
  | { ok: true }
  | { ok: false; reason: "failed" | "wrong_network" | "wrong_asset" | "wrong_payee" | "underpayment" | "wrong_quote" | "expired" | "replay" | "bad_tx" };

/**
 * The standard exact row for one research quote. The live quote builder does not append this
 * until a facilitator settlement has been shown with an unmodified client.
 */
export function exactAccept(input: {
  id: string;
  bodyHash: string;
  price: string;
  payee: string;
  ttlSeconds: number;
}): ExactAccept {
  return {
    scheme: "exact",
    network: EXACT_NETWORK,
    asset: USDC,
    amount: input.price,
    payTo: input.payee,
    maxTimeoutSeconds: input.ttlSeconds,
    extra: { name: "USDC", version: "2", quoteId: input.id, bodyHash: input.bodyHash },
  };
}

/** Check a facilitator settlement against the quote. `seen` holds tx hashes already accepted. */
export function checkSettlement(
  expected: { quoteId: string; payee: string; amount: string; expiresAt: number; now: number },
  report: SettlementReport,
  seen: ReadonlySet<string>,
): SettlementVerdict {
  if (report.status !== "completed") return { ok: false, reason: "failed" };
  if (expected.now > expected.expiresAt) return { ok: false, reason: "expired" };
  if (report.network !== EXACT_NETWORK) return { ok: false, reason: "wrong_network" };
  if (report.asset.toLowerCase() !== USDC.toLowerCase()) return { ok: false, reason: "wrong_asset" };
  if (report.payee.toLowerCase() !== expected.payee.toLowerCase()) return { ok: false, reason: "wrong_payee" };
  if (!/^[0-9]+$/.test(report.amount) || BigInt(report.amount) < BigInt(expected.amount)) {
    return { ok: false, reason: "underpayment" };
  }
  if (report.quoteId !== expected.quoteId) return { ok: false, reason: "wrong_quote" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(report.txHash)) return { ok: false, reason: "bad_tx" };
  if (seen.has(report.txHash.toLowerCase())) return { ok: false, reason: "replay" };
  return { ok: true };
}
