"use client";

import type { DecisionRecord } from "@/data/decision-record";
import { paymentReasonSentence, paymentStatusLines } from "@/data/decision-record";

function rawUsdc(value: string): string {
  if (!/^[0-9]+$/.test(value)) return "—";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} USDC` : `${whole} USDC`;
}

function short(value: string): string {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function PaymentDecision({ record }: { record: DecisionRecord }) {
  const status = paymentStatusLines(record.decision, record.txHash);
  const refused = record.decision === "REFUSE" || record.decision === "NO_PAYMENT";
  const rows: Array<[string, string]> = [
    ["Task", record.task || "—"],
    ["Service", record.service || "—"],
    ["Resource", record.resource || "—"],
    ["Agent", short(record.agent)],
    ["Capability", short(record.capability)],
    ["Network", record.network || "—"],
    ["Asset", short(record.asset)],
    ["Price", rawUsdc(record.price)],
    ["Payee", short(record.payee)],
    ["Capability remaining", rawUsdc(record.remaining_capability_balance)],
    ["Max per payment", rawUsdc(record.maxPerCall)],
    ["Expiry", record.expiry || "—"],
    ["Decision", record.decision === "ALLOW" ? "ALLOW" : record.decision],
    ["Tx hash", record.txHash || "—"],
    ["Receipt status", record.receipt?.status || "—"],
    ["Service result", record.result || "—"],
  ];

  return (
    <article className="rounded-lg border border-white/[.06] px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Payment decision</p>
      {status.length > 0 ? (
        <div className="mt-2 space-y-1 text-sm text-foreground">
          {status.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {refused
            ? record.reason.map((reason) => (
                <p key={reason}>{paymentReasonSentence(reason)}</p>
              ))
            : null}
        </div>
      ) : null}
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-all text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Reasons</p>
        <ul className="mt-1 space-y-1">
          {record.reason.map((reason) => (
            <li key={reason} className="text-sm text-foreground">{paymentReasonSentence(reason)}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
