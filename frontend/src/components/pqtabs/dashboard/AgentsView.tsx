"use client";

import { Bot, ChevronRight } from "lucide-react";
import { EmptyState, StatusChip } from "@/components/pqtabs/shared";
import { initials, relTime, usd } from "@/data/formatters";
import { useAgents, useDashboardUi, useTabs } from "@/lib/store";

/**
 * AgentsView — the roster of enrolled agents. Each row states who the
 * agent is, what it is allowed to reach, and how much is authorized
 * across its capabilities. The whole row opens the agent drawer.
 */
export default function AgentsView() {
  const agents = useAgents();
  const tabs = useTabs();
  const openDrawer = useDashboardUi((s) => s.openDrawer);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">Agents</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Agents
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Who can act, and under which capabilities.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {agents.length} enrolled
        </p>
      </header>

      {agents.length > 0 ? (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const activeTabs = tabs.filter((t) => t.agentId === agent.id && t.status === "active");
            const authorized = activeTabs.reduce((s, t) => s + t.capUsd, 0);
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => openDrawer({ type: "agent", id: agent.id })}
                  aria-label={`Open ${agent.name} details`}
                  className="focus-ring group flex w-full flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-white/[.07] bg-[#0e1013] p-4 text-left transition-all duration-200 hover:border-gold/20 hover:bg-[#101318] md:flex-nowrap"
                >
                  {/* Identity */}
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 font-display text-sm font-semibold text-gold"
                  >
                    {initials(agent.name)}
                  </span>
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {agent.name}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={agent.role}>
                      {agent.role}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                      {agent.address}
                    </span>
                  </span>

                  {/* Live state */}
                  <span className="hidden shrink-0 items-center gap-2.5 lg:flex">
                    <StatusChip status={agent.status} pulse={agent.status === "active"} />
                    <span className="font-mono text-[11px] tabular text-muted-foreground">
                      {activeTabs.length} active {activeTabs.length === 1 ? "capability" : "capabilities"}
                    </span>
                  </span>

                  {/* Authorized amount */}
                  <span className="ml-auto shrink-0 text-right lg:ml-0">
                    <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                      Authorized
                    </span>
                    <span className="mt-0.5 block font-mono text-sm tabular text-foreground">
                      {usd(authorized)}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] tabular text-muted-foreground">
                      {agent.lastActiveHoursAgo != null
                        ? `active ${relTime(agent.lastActiveHoursAgo)}`
                        : "never active"}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-gold"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Bot className="h-5 w-5" strokeWidth={1.75} />}
          title="No agents enrolled yet"
          body="Agents enrolled under your root appear here with their capabilities."
        />
      )}
    </div>
  );
}
