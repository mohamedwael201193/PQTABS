"use client";

import { useState } from "react";
import { Loader2, Plus, RotateCcw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusChip } from "@/components/pqtabs/shared";
import { relTime, usd } from "@/data/formatters";
import { describeReturn, loadSnapshot, productionProvider } from "@/data/production";
import type { Tab } from "@/data/types";
import { useAgents, useActivity, useDashboardUi, usePqtabsData, useTabs } from "@/lib/store";
import { TabCard } from "./shared/TabCard";

/**
 * TabsView — every capability in one ledger: expired balances waiting to
 * be reclaimed, the active set, and the settled history at the bottom.
 */
export default function TabsView() {
  const portfolioReady = usePqtabsData((state) => state.portfolioReady);
  const portfolioError = usePqtabsData((state) => state.portfolioError);
  const indexNote = usePqtabsData((state) => state.indexNote);
  const tabs = useTabs();
  const activity = useActivity();
  const agents = useAgents();
  const openDrawer = useDashboardUi((s) => s.openDrawer);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const [pendingReclaimId, setPendingReclaimId] = useState<string | null>(null);

  const reclaimable = tabs.filter((t) => t.status === "expired");
  const stuck = tabs.filter((t) => t.needsSweep && t.balanceUsd > 0);
  const active = tabs.filter((t) => t.status === "active");
  const history = tabs.filter(
    (t) => t.status !== "active" && !reclaimable.includes(t) && !stuck.includes(t)
  );

  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? "Unknown agent";

  const historyWhen = (tab: Tab) => {
    if (tab.status === "expired") return `expired ${relTime(tab.expiredHoursAgo)}`;
    const closed = activity.find(
      (record) =>
        (record.kind === "capability_closed" || record.kind === "reclaim") &&
        record.tabId?.toLowerCase() === tab.id.toLowerCase(),
    );
    if (!closed) return `opened ${relTime(tab.openedHoursAgo)}`;
    return `${closed.kind === "reclaim" ? "reclaimed" : "closed"} ${relTime(closed.hoursAgo)}`;
  };

  async function confirmReturn(tab: Tab, path: "reclaim" | "sweep") {
    setPendingReclaimId(tab.id);
    try {
      const store = usePqtabsData.getState();
      const root = store.snapshot.account.rootAddress;
      if (!root || !store.registrar) throw new Error("The wallet changed. Nothing was submitted.");
      if (path === "reclaim") await productionProvider.reclaimCapability(root, tab.id);
      else await productionProvider.retrySweep(root, tab.id);
      if (usePqtabsData.getState().registrar.toLowerCase() !== store.registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      const snapshot = await loadSnapshot(store.registrar);
      const row = snapshot.tabs.find((item) => item.id.toLowerCase() === tab.id.toLowerCase());
      const outcome = describeReturn(path, row, tab.balanceUsd);
      if (usePqtabsData.getState().registrar.toLowerCase() !== store.registrar.toLowerCase()) {
        throw new Error("The wallet changed. The receipt belongs to the previous wallet.");
      }
      if (!outcome.settled) throw new Error(outcome.message);
      usePqtabsData.getState().acceptPortfolio(snapshot);
      if (outcome.leftover) toast.message(outcome.message);
      else toast.success(outcome.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't return these funds.");
    } finally {
      setPendingReclaimId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Capabilities</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Capabilities
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Every bounded spending capability under your root.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-gold text-[#171204] hover:bg-[#eec95e]"
        >
          <Plus className="size-4" strokeWidth={2} />
          New capability
        </Button>
      </header>

      {/* Ready to reclaim */}
      {reclaimable.length > 0 && (
        <section aria-label="Ready to reclaim" className="space-y-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Ready to reclaim
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-warning/25 bg-warning/[.04]">
            <ul className="divide-y divide-white/[.06]">
              {reclaimable.map((tab) => {
                const pending = pendingReclaimId === tab.id;
                return (
                  <li
                    key={tab.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5"
                  >
                    <span className="font-mono text-xs font-medium text-foreground">
                      {tab.reference}
                    </span>
                    <span className="text-sm text-muted-foreground">{agentName(tab.agentId)}</span>
                    <span className="ml-auto font-mono text-sm tabular text-gold">
                      {usd(tab.balanceUsd)}
                    </span>
                    <span className="font-mono text-[11px] tabular text-muted-foreground">
                      expired {relTime(tab.expiredHoursAgo)}
                    </span>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => confirmReturn(tab, "reclaim")}
                      className="h-8 rounded-md border border-gold/40 bg-transparent text-gold shadow-none hover:bg-gold/10 hover:text-gold"
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                      ) : (
                        <RotateCcw className="size-3.5" strokeWidth={1.75} />
                      )}
                      {tab.balanceUsd > 0 ? "Reclaim" : "Release limit"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {stuck.length > 0 && (
        <section aria-label="Funds still on a closed capability" className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Funds still on a closed capability
          </p>
          <div className="overflow-hidden rounded-xl border border-warning/25 bg-warning/[.04]">
            <ul className="divide-y divide-white/[.06]">
              {stuck.map((tab) => {
                const pending = pendingReclaimId === tab.id;
                return (
                  <li key={tab.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5">
                    <span className="font-mono text-xs font-medium text-foreground">{tab.reference}</span>
                    <span className="text-sm text-muted-foreground">{agentName(tab.agentId)}</span>
                    <span className="ml-auto font-mono text-sm tabular text-gold">{usd(tab.balanceUsd)}</span>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => confirmReturn(tab, "sweep")}
                      className="h-8 rounded-md border border-gold/40 bg-transparent text-gold shadow-none hover:bg-gold/10 hover:text-gold"
                    >
                      {pending ? <Loader2 className="size-3.5 animate-spin" strokeWidth={2} /> : <RotateCcw className="size-3.5" strokeWidth={1.75} />}
                      Return funds
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Active */}
      <section aria-label="Active capabilities" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Active
          </p>
          <span className="rounded-full border border-white/[.08] bg-white/[.03] px-2 py-0.5 font-mono text-[10px] tabular text-muted-foreground">
            {portfolioReady ? active.length : "—"}
          </span>
        </div>
        {active.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((tab) => (
              <TabCard
                key={tab.id}
                tab={tab}
                onOpen={(id) => openDrawer({ type: "tab", id })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Wallet className="h-5 w-5" strokeWidth={1.75} />}
            title={portfolioReady ? "No active capabilities" : portfolioError ? "Couldn't read capabilities" : indexNote ?? "Loading capabilities"}
            body={
              portfolioReady
                ? "Open a capability to let an agent spend within bounds."
                : portfolioError
                  ? "The capability list did not finish. The treasury balance is still the onchain USDC balance."
                  : "The capability list is still being read from Arc."
            }
            action={
              <Button
                onClick={() => setCreateOpen(true)}
                className="bg-gold text-[#171204] hover:bg-[#eec95e]"
              >
                <Plus className="size-4" strokeWidth={2} />
                New capability
              </Button>
            }
          />
        )}
      </section>

      {/* Closed & expired history */}
      <section aria-label="Closed and expired capabilities" className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Closed & expired
        </p>
        {!portfolioReady ? (
          <p className="rounded-xl border border-dashed border-white/[.09] bg-white/[.015] px-4 py-6 text-center text-sm text-muted-foreground">
            {portfolioError ? "The closed list did not finish." : indexNote ?? "The closed list is still being read from Arc."}
          </p>
        ) : history.length > 0 ? (
          <div className="max-h-72 overflow-y-auto scrollbar-thin rounded-xl border border-white/[.06] bg-white/[.02]">
            <ul className="divide-y divide-white/[.05]">
              {history.map((tab) => (
                <li key={tab.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-[76px] shrink-0 font-mono text-xs text-muted-foreground">
                    {tab.reference}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-sm text-foreground/80 sm:block">
                    {agentName(tab.agentId)}
                  </span>
                  <StatusChip status={tab.status} />
                  <span className="ml-auto w-[76px] shrink-0 text-right font-mono text-xs tabular text-muted-foreground">
                    {usd(tab.capUsd)}
                  </span>
                  <span className="w-[108px] shrink-0 text-right font-mono text-[11px] tabular text-muted-foreground">
                    {historyWhen(tab)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-white/[.09] bg-white/[.015] px-4 py-6 text-center text-sm text-muted-foreground">
            No closed capabilities yet.
          </p>
        )}
      </section>
    </div>
  );
}
