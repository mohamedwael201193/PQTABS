"use client";

import { Coins, Landmark, Layers, Plus, Wallet } from "lucide-react";
import { CountUp, EmptyState, Reveal } from "@/components/pqtabs/shared";
import { Button } from "@/components/ui/button";
import { ExposureMeter } from "@/components/pqtabs/visuals/ExposureMeter";
import { pct, usd } from "@/data/formatters";
import { useActivity, useDashboardUi, useTabs, useTotals } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ActivityRow } from "./shared/ActivityRow";
import { StatCard } from "./shared/StatCard";
import { TabCard } from "./shared/TabCard";

/**
 * OverviewView — the answer to "what can my money do right now":
 * totals, security posture, treasury exposure, live capabilities and
 * the latest ledger lines, all above the fold of attention.
 */
export default function OverviewView() {
  const totals = useTotals();
  const tabs = useTabs();
  const activity = useActivity();
  const setView = useDashboardUi((s) => s.setView);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const openDrawer = useDashboardUi((s) => s.openDrawer);

  const activeTabs = tabs
    .filter((t) => t.status === "active")
    .sort((a, b) => a.policy.expiresInHours - b.policy.expiresInHours);
  const recent = activity.slice(0, 6);
  const exposurePct =
    totals.treasuryTotalUsd > 0
      ? (totals.allocatedUsd / totals.treasuryTotalUsd) * 100
      : 0;

  const securityStrip = [
    { label: "Root protection", value: "Post-quantum · Secured", dot: "bg-success" },
    { label: "Agent capabilities", value: "Bounded by policy", dot: "bg-success" },
    { label: "Treasury exposure", value: `${pct(exposurePct)} of funds`, dot: "bg-gold" },
    { label: "Enforcement", value: "Onchain policy", dot: "bg-success" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Overview</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Overview
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Everything your agents can reach, at a glance.
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

      {/* Key figures */}
      <section aria-label="Treasury figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Root balance"
          icon={<Landmark strokeWidth={1.75} />}
          accent="gold"
          value={<CountUp value={totals.treasuryTotalUsd} format={usd} />}
          sub="under root control"
        />
        <StatCard
          delay={0.06}
          label="Open exposure"
          icon={<Wallet strokeWidth={1.75} />}
          value={<CountUp value={totals.allocatedUsd} format={usd} />}
          sub={`${totals.activeTabCount} active tabs`}
        />
        <StatCard
          delay={0.12}
          label="Exposure room"
          icon={<Coins strokeWidth={1.75} />}
          value={<CountUp value={totals.availableUsd} format={usd} />}
          sub="ceiling minus open exposure"
        />
        <StatCard
          delay={0.18}
          label="Active tabs"
          icon={<Layers strokeWidth={1.75} />}
          accent="teal"
          value={<span>{totals.activeTabCount}</span>}
          sub={
            totals.reclaimableUsd > 0 ? (
              <span className="text-warning">
                {totals.reclaimableTabCount} ready to reclaim
              </span>
            ) : (
              "none expired"
            )
          }
        />
      </section>

      {/* Security status strip */}
      <Reveal y={12}>
        <section aria-label="Security status">
          <button
            type="button"
            onClick={() => setView("security")}
            aria-label="Open security overview"
            className="focus-ring grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/[.07] bg-white/[.06] text-left transition-colors duration-200 hover:border-gold/20 lg:grid-cols-4"
          >
            {securityStrip.map((cell) => (
              <div
                key={cell.label}
                className="bg-[#0e1013] p-4 transition-colors duration-200 hover:bg-[#101318] md:p-5"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {cell.label}
                </p>
                <p className="mt-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cell.dot)} />
                  {cell.value}
                </p>
              </div>
            ))}
          </button>
        </section>
      </Reveal>

      {/* Treasury exposure */}
      <Reveal y={12}>
        <section
          aria-label="Treasury exposure"
          className="rounded-xl border border-white/[.07] bg-[#0e1013] p-5 md:p-6"
        >
          <h2 className="font-display text-base font-semibold tracking-tight">
            Treasury exposure
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Where every dollar can reach
          </p>
          <div className="mt-5">
            <ExposureMeter totals={totals} />
          </div>
        </section>
      </Reveal>

      {/* Active capabilities */}
      <section aria-label="Active capabilities" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Active capabilities
          </p>
          <span className="rounded-full border border-white/[.08] bg-white/[.03] px-2 py-0.5 font-mono text-[10px] tabular text-muted-foreground">
            {activeTabs.length}
          </span>
        </div>
        <Reveal y={12}>
          {activeTabs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activeTabs.map((tab) => (
                <TabCard
                  key={tab.id}
                  tab={tab}
                  onOpen={(id) => openDrawer({ type: "tab", id })}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Layers className="h-5 w-5" strokeWidth={1.75} />}
              title="No active capabilities"
              body="Open a capability to let an agent spend within bounds."
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
        </Reveal>
      </section>

      {/* Recent activity */}
      <Reveal y={12}>
        <section
          aria-label="Recent activity"
          className="overflow-hidden rounded-xl border border-white/[.07] bg-[#0e1013]"
        >
          <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3.5 md:px-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Recent activity
            </p>
            <button
              type="button"
              onClick={() => setView("activity")}
              className="focus-ring rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all
            </button>
          </div>
          <ul className="p-2">
            {recent.map((record) => (
              <li key={record.id}>
                <ActivityRow record={record} onOpen={() => setView("activity")} />
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      {/* Quick actions */}
      <Reveal y={12}>
        <section aria-label="Quick actions" className="flex flex-wrap gap-3">
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-gold text-[#171204] hover:bg-[#eec95e]"
          >
            <Plus className="size-4" strokeWidth={2} />
            Create tab
          </Button>
          <Button
            variant="outline"
            onClick={() => setView("activity")}
            className="border-white/10 bg-white/[.03] shadow-none hover:bg-white/[.06] hover:text-foreground"
          >
            Review activity
          </Button>
          <Button
            variant="outline"
            onClick={() => setView("security")}
            className="border-white/10 bg-white/[.03] shadow-none hover:bg-white/[.06] hover:text-foreground"
          >
            Open security
          </Button>
        </section>
      </Reveal>
    </div>
  );
}
