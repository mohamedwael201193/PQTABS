"use client";

import { Copy } from "lucide-react";
import { EXPLORER_URL } from "@/data/production";
import { explorerTxUrl } from "@/data/task-phase";

export function TxResult({
  hash,
  label,
  amount,
  recipient,
  status,
}: {
  hash?: string;
  label: string;
  amount?: string;
  recipient?: string;
  status?: string;
}) {
  const href = hash ? explorerTxUrl(EXPLORER_URL, hash) : null;
  if (!hash || !href) return null;
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  return (
    <article className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[.08] px-3 py-2">
      <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 truncate font-mono text-xs text-foreground underline-offset-2 hover:underline"
      >
        {short}
      </a>
      <button
        type="button"
        aria-label="Copy hash"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => void navigator.clipboard.writeText(hash)}
      >
        <Copy className="size-3.5" strokeWidth={1.75} />
      </button>
      {amount ? <p className="ml-auto shrink-0 font-mono text-[11px] tabular text-foreground">{amount}</p> : null}
      {status ? (
        <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-success">
          {status === "success" || status === "0x1" ? "Confirmed" : status}
        </p>
      ) : null}
      {recipient ? <p className="sr-only">{recipient}</p> : null}
    </article>
  );
}
