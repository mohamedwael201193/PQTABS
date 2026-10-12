"use client";

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
  if (!hash || !explorerTxUrl(EXPLORER_URL, hash)) return null;
  const href = explorerTxUrl(EXPLORER_URL, hash)!;
  const short = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  return (
    <article className="mt-3 rounded-lg border border-white/[.08] px-3 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block break-all font-mono text-sm text-foreground underline-offset-2 hover:underline"
      >
        {short}
      </a>
      <button
        type="button"
        className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
        onClick={() => void navigator.clipboard.writeText(hash)}
      >
        Copy hash
      </button>
      {amount ? <p className="mt-2 text-sm text-foreground">{amount}</p> : null}
      {recipient ? <p className="break-all text-sm text-muted-foreground">{recipient}</p> : null}
      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </article>
  );
}
