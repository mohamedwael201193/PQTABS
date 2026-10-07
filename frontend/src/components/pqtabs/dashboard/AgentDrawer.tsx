"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Copy, Plus, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusChip } from "@/components/pqtabs/shared";
import { relFuture, relTime, usd } from "@/data/formatters";
import { recallAgentKey } from "@/data/spend";
import type { Agent } from "@/data/types";
import { useActivity, useAgents, useDashboardUi, usePqtabsData, useTabs } from "@/lib/store";
import { ActivityRow } from "./shared/ActivityRow";

const SHEET_CLASS =
  "w-full gap-0 border-l border-white/[.08] bg-[#0a0b0d] p-0 sm:w-[480px] sm:max-w-[480px]";

/**
 * AgentDrawer — one enrolled agent: identity, purpose, the capabilities
 * it currently holds (each opens its own tab drawer), recent ledger
 * lines, and the security facts behind its credentials.
 */
export default function AgentDrawer() {
  const drawer = useDashboardUi((s) => s.drawer);
  const closeDrawer = useDashboardUi((s) => s.closeDrawer);
  const agents = useAgents();

  const open = drawer?.type === "agent";
  const liveAgent = drawer?.type === "agent"
    ? agents.find((a) => a.id === drawer.id) ?? null
    : null;

  // Freeze the last agent so the sheet keeps its content while animating out.
  const frozenRef = useRef<Agent | null>(null);
  if (liveAgent) frozenRef.current = liveAgent;
  const agent = liveAgent ?? (open ? null : frozenRef.current);

  // If the agent disappears while its drawer is open, close gracefully.
  useEffect(() => {
    if (open && !liveAgent) closeDrawer();
  }, [open, liveAgent, closeDrawer]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeDrawer()}>
      <SheetContent side="right" className={SHEET_CLASS}>
        {agent ? (
          <AgentDrawerBody agent={agent} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AgentDrawerBody({ agent }: { agent: Agent }) {
  const tabs = useTabs();
  const activity = useActivity();
  const closeDrawer = useDashboardUi((s) => s.closeDrawer);
  const openDrawer = useDashboardUi((s) => s.openDrawer);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);

  const labels = usePqtabsData((state) => state.agentLabels);
  const keyGone = Boolean(labels[agent.id.toLowerCase()]) && !recallAgentKey(agent.id);
  const activeTabs = tabs.filter(
    (t) => t.agentId.toLowerCase() === agent.id.toLowerCase() && t.status === "active",
  );
  const totalAuthorized = activeTabs.reduce((s, t) => s + t.capUsd, 0);
  const currentExposure = activeTabs.reduce((s, t) => s + t.balanceUsd, 0);
  const agentActivity = activity.filter((a) => a.agentId === agent.id).slice(0, 5);

  const lastRotationHoursAgo = activity
    .filter((a) => a.kind === "key_rotated" && a.agentId === agent.id)
    .reduce<number | null>((min, a) => (min == null || a.hoursAgo < min ? a.hoursAgo : min), null);

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  const securityRows: [string, string][] = [
    ["Credential", "capability-scoped, never root"],
    ["Authority", "granted by PQ root signatures"],
    [
      "Last credential rotation",
      lastRotationHoursAgo != null ? relTime(lastRotationHoursAgo) : "not yet rotated",
    ],
    ["Can rotate the root key", "No"],
  ];

  return (
    <>
      <SheetHeader className="shrink-0 border-b border-white/[.06] px-5 pb-4 pr-12 pt-5 md:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">
            {agent.name}
          </SheetTitle>
          <StatusChip status={agent.status} pulse={agent.status === "active"} />
        </div>
        <SheetDescription className="sr-only">
          Agent {agent.name} — capabilities, activity and security details.
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-6 px-5 py-5 md:px-6">
          {/* Address */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[.06] bg-white/[.02] px-4 py-3">
            <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {agent.address}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Copy agent address"
              onClick={() => copyText(agent.address, "Address copied")}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" strokeWidth={1.75} />
            </Button>
          </div>

          {/* Purpose + timeline */}
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-foreground/85">{agent.role}</p>
            <p className="font-mono text-[11px] tabular text-muted-foreground">
              Enrolled {relTime(agent.addedHoursAgo)} · Last active{" "}
              {agent.lastActiveHoursAgo != null ? relTime(agent.lastActiveHoursAgo) : "never"}
            </p>
          </div>

          {/* Active capabilities */}
          <section aria-label="Active capabilities" className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Active capabilities
            </p>
            {activeTabs.length > 0 ? (
              <ul className="space-y-2">
                {activeTabs.map((tab) => (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => openDrawer({ type: "tab", id: tab.id })}
                      aria-label={`Open ${tab.reference} details`}
                      className="focus-ring w-full rounded-lg border border-white/[.06] bg-white/[.02] p-3 text-left transition-colors duration-200 hover:border-gold/20 hover:bg-white/[.04]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {tab.reference}
                        </span>
                        <StatusChip status={tab.status} pulse />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] tabular">
                        <span className="text-gold">{usd(tab.balanceUsd)} available</span>
                        <span className="text-muted-foreground">{usd(tab.capUsd)} cap</span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        Expires {relFuture(tab.policy.expiresInHours)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-white/[.09] px-4 py-5 text-center text-xs text-muted-foreground">
                No active capabilities for this agent.
              </p>
            )}
          </section>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/[.06] bg-white/[.02] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Total authorized
              </p>
              <p className="mt-1.5 font-display text-lg font-semibold tabular text-gold">
                {usd(totalAuthorized)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[.06] bg-white/[.02] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Current exposure
              </p>
              <p className="mt-1.5 font-display text-lg font-semibold tabular text-foreground">
                {usd(currentExposure)}
              </p>
            </div>
          </div>

          {/* Recent activity */}
          <section aria-label="Recent activity" className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Recent activity
            </p>
            {agentActivity.length > 0 ? (
              <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-lg border border-white/[.06]">
                <ul className="divide-y divide-white/[.05]">
                  {agentActivity.map((record) => (
                    <li key={record.id}>
                      <ActivityRow record={record} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-white/[.09] px-4 py-5 text-center text-xs text-muted-foreground">
                No recorded activity yet.
              </p>
            )}
          </section>

          {/* Security details — progressive disclosure */}
          <Collapsible>
            <CollapsibleTrigger className="focus-ring group flex w-full items-center justify-between rounded-lg border border-white/[.06] bg-white/[.02] px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Security details
              <ChevronDown
                className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden rounded-b-lg border-x border-b border-white/[.06] bg-white/[.015]">
              <ul className="divide-y divide-white/[.05] px-4">
                {securityRows.map(([label, value]) => (
                  <li
                    key={label}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {label}
                    </span>
                    <span className="font-mono text-[11px] tabular text-foreground/85">{value}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-white/[.06] bg-[#0a0b0d]/95 px-5 py-4 backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {keyGone ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              The signing key was only kept for the session that created it. Create a new agent to give it a capability.
            </p>
          ) : (
          <Button
            onClick={() => {
              setCreateOpen(true, agent.id);
              closeDrawer();
            }}
            className="h-9 min-w-[170px] flex-1 bg-gold text-[#171204] hover:bg-[#eec95e]"
          >
            <Plus className="size-4" strokeWidth={2} />
            Create capability
          </Button>
          )}
          <AlertDialog>
            {activeTabs.length > 0 ? (
            <AlertDialogTrigger asChild>
              <Button className="h-9 border border-danger/30 bg-transparent text-danger shadow-none hover:bg-danger/10 hover:text-danger">
                <ShieldOff className="size-4" strokeWidth={1.75} />
                Close capability
              </Button>
            </AlertDialogTrigger>
            ) : null}
            <AlertDialogContent className="border-white/[.08] bg-[#0e1013]">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display tracking-tight">
                  Close this capability?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {activeTabs.length > 1
                    ? `This agent has ${activeTabs.length} open capabilities. Each one closes on its own. The remaining balance returns to your treasury after you authorize the close.`
                    : "The remaining balance returns to your treasury after you authorize the close with your security key."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06] hover:text-foreground">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const next = activeTabs[0];
                    if (!next) {
                      toast.message("This agent has no capability to close.");
                      return;
                    }
                    openDrawer({ type: "tab", id: next.id });
                  }}
                  className="bg-danger text-white hover:bg-danger/90"
                >
                  Review close
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
}
