"use client";

import { ChevronRight } from "lucide-react";
import type { Tab } from "@/data/types";
import { relFuture, usd } from "@/data/formatters";
import { useAgents } from "@/lib/store";
import { StatusChip } from "@/components/pqtabs/shared";
import { cn } from "@/lib/utils";

/**
 * TabCard — a bounded spending capability, compressed to one glance:
 * who holds it, what is left to spend, how much of the cap is used,
 * and the four numbers that bound it. The whole card opens the tab drawer.
 */
export function TabCard({ tab, onOpen }: { tab: Tab; onOpen?: (id: string) => void }) {
  const agents = useAgents();
  const agent = agents.find((a) => a.id === tab.agentId);
  const balanceKnown = tab.balanceKnown !== false;
  const spent = balanceKnown ? Math.max(0, tab.capUsd - tab.balanceUsd) : 0;
  const spentPct = balanceKnown && tab.capUsd > 0 ? Math.min(100, (spent / tab.capUsd) * 100) : 0;
  const expiringSoon = tab.status === "active" && tab.policy.expiresInHours < 24;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(tab.id)}
      aria-label={`Open ${tab.reference} details`}
      className="focus-ring group flex w-full flex-col rounded-xl border border-white/[.07] bg-[#0e1013] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/20 hover:bg-[#101318]"
    >
      {/* Header: holder + state */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {agent?.name ?? "Unknown agent"}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {agent?.address ?? tab.agentId}
          </p>
        </div>
        <StatusChip status={tab.status} pulse={tab.status === "active"} />
      </div>

      {/* Available balance */}
      <div className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Available
        </p>
        <p className="mt-1 font-display text-2xl font-semibold leading-tight tabular text-gold">
          {tab.balanceKnown === false ? "—" : usd(tab.balanceUsd)}
        </p>
      </div>

      {/* Spend-down against the cap */}
      <div className="mt-3.5">
        <div
          className="h-[5px] w-full overflow-hidden rounded-full bg-white/[.08]"
          role="progressbar"
          aria-label={`${usd(spent)} spent of ${usd(tab.capUsd)} cap`}
          aria-valuenow={Math.round(spentPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-gold/85 transition-[width] duration-500"
            style={{ width: `${spentPct}%` }}
          />
        </div>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] tabular text-muted-foreground">
          {tab.balanceKnown === false ? "Balance not confirmed" : `Spent ${usd(spent)} of ${usd(tab.capUsd)}`}
        </p>
      </div>

      {/* Bounding numbers */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Per-call limit
          </p>
          <p className="mt-1 font-mono text-xs tabular text-foreground">
            {tab.limitKnown === false ? "—" : usd(tab.policy.maxPerCallUsd)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Expires
          </p>
          <p
            className={cn(
              "mt-1 font-mono text-xs tabular",
              expiringSoon ? "text-warning" : "text-foreground"
            )}
          >
            {relFuture(tab.policy.expiresInHours)}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Authorized to
          </p>
          <p className="mt-1 font-mono text-xs tabular text-foreground">
            {tab.policy.allowedRecipients.length} recipients
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Cap
          </p>
          <p className="mt-1 font-mono text-xs tabular text-foreground">{usd(tab.capUsd)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between border-t border-white/[.06] pt-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors group-hover:text-gold">
          {tab.reference}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/[.03] px-3 text-xs text-muted-foreground transition-colors group-hover:bg-white/[.06] group-hover:text-foreground"
        >
          Manage
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>
    </button>
  );
}
