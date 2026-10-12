"use client";

import type { ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DecisionRecord } from "@/data/decision-record";
import { capabilityRemaining, expiryWhen, orderedReasons, paymentReasonSentence, paymentStatusLines } from "@/data/decision-record";
import { answerIncomplete, answerMarkdown } from "@/data/answer-prose";
import { presentAnswer } from "@/data/research-answer";
import { payeeLabel } from "@/data/x402-pay";
import { TxResult } from "@/components/pqtabs/dashboard/TxResult";

function rawUsdc(value: string): string {
  if (!/^[0-9]+$/.test(value)) return "—";
  const raw = BigInt(value);
  const whole = raw / 1_000_000n;
  const fraction = (raw % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} USDC` : `${whole} USDC`;
}

function serviceName(service: string): string {
  if (service === "https://arcrouter.co/v1/chat/completions") return "ArcRouter / paid inference";
  return service || "—";
}

function short(value: string): string {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function settled(record: DecisionRecord): boolean {
  return record.decision === "ALLOW" && /^0x[0-9a-fA-F]{64}$/.test(record.txHash);
}

const markdown = {
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="font-display text-lg font-medium leading-snug tracking-tight text-foreground">{children}</h2>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mt-3 text-[15px] leading-7 text-foreground/90 first:mt-0">{children}</p>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mt-4 list-decimal space-y-4 pl-5 marker:font-medium marker:text-gold">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="pl-1 text-[15px] leading-7 text-foreground/90 [&_p]:m-0">{children}</li>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-medium text-foreground">{children}</strong>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-white/[.08]">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm leading-6">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-white/[.03]">{children}</thead>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-white/[.08] px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-t border-white/[.06] px-3 py-2 align-top text-foreground/90">{children}</td>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2">
      {children}
    </a>
  ),
};

export function PaymentDecision({ record }: { record: DecisionRecord }) {
  const paid = settled(record);
  const shown = presentAnswer(record.task, record.result);
  const status = paymentStatusLines(record.decision, record.txHash, record.reason);
  const charged = rawUsdc(record.charge || record.price);
  const ceiling = rawUsdc(record.price);
  const refused = record.decision === "REFUSE" || record.decision === "NO_PAYMENT";
  const facts: Array<[string, string]> = [
    ["Price", rawUsdc(record.charge || record.price)],
    ["Payee", payeeLabel(record.payee).name],
    ["Remaining after this payment", rawUsdc(capabilityRemaining(record))],
    ["Per payment", rawUsdc(record.maxPerCall)],
    ["Network", record.network || "—"],
    ["Expires", expiryWhen(record.expiry)],
  ];

  if (paid && shown.text) {
    return (
      <article aria-label="Answer" className="rounded-xl border border-gold/25 bg-[#12140f] px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold">Answer</p>
          <p className="font-mono text-[10px] text-muted-foreground">{serviceName(record.service)}</p>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{record.task}</p>
        {answerIncomplete(shown.text) ? (
          <p className="mt-3 rounded-md border border-warning/30 bg-warning/[.06] px-3 py-2 text-sm leading-6 text-foreground/85">
            This answer was cut off at the output limit. The payment is complete and was charged once. The rest of the answer was not returned.
          </p>
        ) : null}
        <div className="mt-4 border-t border-white/[.06] pt-4">
          <Markdown components={markdown} remarkPlugins={[remarkGfm]}>
            {answerMarkdown(shown.text)}
          </Markdown>
        </div>
        {shown.corrections.length > 0 ? (
          <div className="mt-4 rounded-md border border-white/[.08] bg-white/[.02] px-3 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Corrections to the model text</p>
            <ul className="mt-2 space-y-2">
              {shown.corrections.map((item) => (
                <li key={item.href + item.text} className="text-sm leading-6 text-foreground/85">
                  {item.text}{" "}
                  <a href={item.href} target="_blank" rel="noreferrer" className="text-foreground underline decoration-white/25 underline-offset-2">
                    Source
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {shown.removed.length > 0 ? (
          <div className="mt-4 rounded-md border border-warning/30 bg-warning/[.06] px-3 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Removed {shown.removed.length === 1 ? "1 sentence" : `${shown.removed.length} sentences`}
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/85">
              {shown.removed.map((sentence) => `"${sentence}"`).join(" ")} No cited Arc source covers this, so it is not shown as an answer.
            </p>
          </div>
        ) : null}
        {shown.sources.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {shown.sources.map((source) => (
              <li key={source.href}>
                <a href={source.href} target="_blank" rel="noreferrer" className="text-sm text-foreground underline decoration-white/25 underline-offset-2">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-sm leading-6 text-foreground/85">
          Charged {charged}. Quote ceiling {ceiling}. PQTABS Barkeep authorization, not an ArcRouter x402 purchase.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Demo subsidy. The relayer paid the network fee for this call. One measured spend cost about 0.0021 USDC of gas, more than the {charged} charge. This is not a sustainable price.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Payee</dt>
            <dd className="mt-1 text-sm text-foreground">{payeeLabel(record.payee).name}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Remaining after this payment</dt>
            <dd className="mt-1 text-sm text-foreground">{rawUsdc(capabilityRemaining(record))}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <TxResult hash={record.txHash} label="Arc receipt" amount={charged} recipient={record.payee} status={record.receipt?.status} />
        </div>
      </article>
    );
  }

  return (
    <article className="space-y-3">
      <section className="rounded-xl border border-white/[.08] bg-white/[.02] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Payment</p>
          <p className={paid ? "font-mono text-[10px] uppercase tracking-[0.14em] text-success" : "font-mono text-[10px] uppercase tracking-[0.14em] text-foreground"}>
            {paid ? "Receipt confirmed" : record.decision === "ALLOW" ? "ALLOW" : record.decision}
          </p>
        </div>
        {status.length > 0 ? (
          <div className="mt-3 space-y-1 text-sm leading-6 text-foreground">
            {status.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {refused
              ? record.reason.map((reason) => <p key={reason}>{paymentReasonSentence(reason)}</p>)
              : null}
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-foreground/85">
            {charged} moved from this capability to {payeeLabel(record.payee).name}. The model returned no text. No second charge was sent.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
              <dd className="mt-1 truncate text-sm text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <TxResult
            hash={record.txHash}
            label="Arc receipt"
            amount={rawUsdc(record.charge || record.price)}
            recipient={record.payee}
            status={record.receipt?.status}
          />
        </div>
        <p className="mt-3 truncate font-mono text-[10px] text-muted-foreground">
          Agent {short(record.agent)} · capability {short(record.capability)}
          {record.resource.includes("arcrouter.co") ? " · quote from ArcRouter" : ""}
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Policy checks
          </summary>
          <ul className="mt-2 space-y-1.5">
            {orderedReasons(record.reason).map((reason) => (
              <li key={reason} className="text-sm leading-6 text-foreground/85">
                {paymentReasonSentence(reason)}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </article>
  );
}
