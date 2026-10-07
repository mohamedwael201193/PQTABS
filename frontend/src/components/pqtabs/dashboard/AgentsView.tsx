"use client";

import { useState } from "react";
import { Bot, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusChip } from "@/components/pqtabs/shared";
import { initials, relTime, usd } from "@/data/formatters";
import { createAgentKey, recallAgentKey } from "@/data/spend";
import { useAgents, useDashboardUi, usePqtabsData, useTabs } from "@/lib/store";

/**
 * AgentsView — the roster of enrolled agents. Each row states who the
 * agent is, what it is allowed to reach, and how much is authorized
 * across its capabilities. The whole row opens the agent drawer.
 */
export default function AgentsView() {
  const portfolioReady = usePqtabsData((state) => state.portfolioReady);
  const portfolioError = usePqtabsData((state) => state.portfolioError);
  const agents = useAgents();
  const labels = usePqtabsData((state) => state.agentLabels);
  const tabs = useTabs();
  const openDrawer = useDashboardUi((s) => s.openDrawer);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");

  function createAgent() {
    const created = createAgentKey();
    const label = name.trim() || "Agent";
    usePqtabsData.getState().addLocalAgent({
      id: created.address,
      name: label,
      address: created.address,
      status: "active",
      role: purpose.trim() || "Created in this browser session. No treasury access until you give it a capability.",
      addedHoursAgo: 0,
      lastActiveHoursAgo: null,
    });
    setName("");
    setPurpose("");
  }

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
        <Button onClick={createAgent} disabled={!name.trim()} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
          Create agent
        </Button>
      </header>
      <div className="grid gap-3 rounded-xl border border-white/[.07] bg-[#0e1013] p-4 sm:grid-cols-2">
        <label className="text-sm text-muted-foreground">
          Agent name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Research Agent"
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          Purpose
          <input
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Used for research and API purchases"
            className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-foreground outline-none"
          />
        </label>
      </div>

      {agents.length > 0 ? (
        <ul className="space-y-3">
          {agents.map((agent) => {
            const activeTabs = tabs.filter(
              (t) => t.agentId.toLowerCase() === agent.id.toLowerCase() && t.status === "active",
            );
            const authorized = activeTabs.reduce((s, t) => s + t.capUsd, 0);
            const canSign = Boolean(recallAgentKey(agent.id));
            const keyGone = Boolean(labels[agent.id.toLowerCase()]) && !canSign;
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
                    {activeTabs.length === 0 && (
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {keyGone
                          ? "The signing key was only kept for the session that created it. This agent cannot spend from this browser."
                          : "This agent has no treasury access by itself."}
                      </span>
                    )}
                    <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                      {agent.address}
                    </span>
                  </span>

                  {/* Live state */}
                  <span className="hidden shrink-0 items-center gap-2.5 lg:flex">
                    <StatusChip
                      status={agent.status === "revoked" ? "revoked" : activeTabs.length > 0 ? "active" : "paused"}
                      pulse={canSign && activeTabs.length > 0 && !keyGone}
                    />
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
                {activeTabs.length === 0 && canSign && (
                  <Button
                    variant="ghost"
                    className="mt-2 h-8 text-gold"
                    onClick={() => setCreateOpen(true, agent.id)}
                  >
                    Give it a capability
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Bot className="h-5 w-5" strokeWidth={1.75} />}
          title={portfolioReady ? "No agents yet" : portfolioError ? "Couldn't read agents" : "Loading agents"}
          body={
            portfolioReady
              ? "Create an agent to give software controlled spending access. An agent has no treasury access until you give it a capability."
              : portfolioError
                ? "Agents already on this root appear when the capability read finishes."
                : "Agents already on this root appear when Arc finishes the capability read."
          }
        />
      )}
    </div>
  );
}
