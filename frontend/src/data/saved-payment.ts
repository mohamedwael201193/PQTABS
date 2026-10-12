import type { DecisionRecord } from "./decision-record";
import type { ActivityRecord } from "./types";

const ARCROUTER = "0x6bf001bb5f5e75396d92163325ca01fdebe2e9a9";

function payeeName(payee: string): string {
  if (payee.toLowerCase() === ARCROUTER) return "ArcRouter";
  return payee.length > 12 ? `${payee.slice(0, 6)}…${payee.slice(-4)}` : payee;
}

function rawAmount(record: DecisionRecord): number | null {
  const raw = /^[0-9]+$/.test(record.charge) ? record.charge : record.price;
  if (!/^[0-9]+$/.test(raw)) return null;
  return Number(raw) / 1_000_000;
}

/** A settled decision the indexer has not listed yet. Refusals are not payments. */
export function savedPaymentRecord(record: DecisionRecord, now = Date.now()): ActivityRecord | null {
  if (record.decision !== "ALLOW" || !/^0x[0-9a-fA-F]{64}$/.test(record.txHash)) return null;
  const amount = rawAmount(record);
  if (amount == null) return null;
  const at = Date.parse(record.at);
  const hoursAgo = Number.isFinite(at) ? Math.max(0, (now - at) / 3_600_000) : 0;
  const who = payeeName(record.payee);
  return {
    id: `saved:${record.txHash.toLowerCase()}`,
    kind: "payment",
    status: "completed",
    hoursAgo,
    agentId: record.agent,
    tabId: record.capability,
    recipientId: record.payee,
    amountUsd: amount,
    summary: `Agent paid ${amount.toFixed(6)} USDC to ${who}.`,
    txHash: record.txHash,
  };
}
