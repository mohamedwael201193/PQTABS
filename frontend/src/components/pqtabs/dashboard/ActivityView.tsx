"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Activity as ActivityIcon, ChevronDown, CircleAlert, Search } from "lucide-react";
import { usd } from "@/data/formatters";
import type {
  ActivityKind,
  ActivityRecord,
  Agent,
  Recipient,
  Tab,
} from "@/data/types";
import { loadDecisions } from "@/data/decision-store";
import type { DecisionRecord } from "@/data/decision-record";
import { useActivity, useAgents, usePqtabsData, useRecipients, useTabs } from "@/lib/store";
import { useAccountData } from "@/hooks/use-account-data";
import { EmptyState, StatusChip } from "@/components/pqtabs/shared";
import { ActivityRow } from "@/components/pqtabs/dashboard/shared/ActivityRow";
import { ViewSkeleton } from "@/components/pqtabs/dashboard/shared/ViewSkeleton";

/**
 * ActivityView — the ledger under your root.
 *
 * Opens, payments, closes, returns, and key rotations that Arc included.
 * Rejected attempts are not in this list.
 */

const MICRO = "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground";
const BTN_GHOST = "border border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06]";

type TypeFilter = "payments" | "lifecycle" | "keys";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "payments", label: "Payments" },
  { value: "lifecycle", label: "Opens, closes, and reclaims" },
  { value: "keys", label: "Key rotations" },
];

const TYPE_KINDS: Record<TypeFilter, ActivityKind[]> = {
  payments: ["payment"],
  lifecycle: ["capability_opened", "capability_closed", "reclaim"],
  keys: ["key_rotated"],
};

const PERIODS = ["TODAY", "YESTERDAY", "EARLIER"] as const;
type Period = (typeof PERIODS)[number];

function periodOf(hoursAgo: number): Period {
  if (hoursAgo < 24) return "TODAY";
  if (hoursAgo < 48) return "YESTERDAY";
  return "EARLIER";
}

function RecipientDetail({
  recipient,
  raw,
  root,
}: {
  recipient: Recipient | undefined;
  raw?: string;
  root?: string;
}) {
  if (raw && root && raw.toLowerCase() === root.toLowerCase()) {
    return (
      <span className="block">
        <span className="block text-sm text-foreground">Your treasury</span>
        <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{root}</span>
      </span>
    );
  }
  if (!raw) return <span className="text-sm text-muted-foreground">None</span>;
  if (!recipient) {
    return <span className="block font-mono text-xs text-foreground">{raw}</span>;
  }
  return (
    <span className="block">
      <span className="block text-sm text-foreground">{recipient.name}</span>
      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
        {recipient.address}
      </span>
    </span>
  );
}

function ActivityDetail({
  record,
  agentsById,
  tabsById,
  recipientsById,
  rootAddress,
}: {
  record: ActivityRecord;
  agentsById: Map<string, Agent>;
  tabsById: Map<string, Tab>;
  recipientsById: Map<string, Recipient>;
  rootAddress?: string;
}) {
  return (
    <div className="ml-3 animate-in fade-in slide-in-from-top-1 border-l border-white/[.08] py-3 pl-10 pr-2 duration-200">
      <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">{record.summary}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
        <div>
          <dt className={MICRO}>Agent</dt>
          <dd className="mt-1 text-sm text-foreground">
            {record.agentId
              ? (agentsById.get(record.agentId.toLowerCase())?.name ?? "—")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className={MICRO}>Capability</dt>
          <dd className="mt-1 font-mono text-xs text-foreground">
            {record.tabId ? (tabsById.get(record.tabId.toLowerCase())?.reference ?? "—") : "—"}
          </dd>
        </div>
        <div>
          <dt className={MICRO}>Recipient</dt>
          <dd className="mt-1">
            <RecipientDetail
              recipient={recipientsById.get((record.recipientId ?? "").toLowerCase())}
              raw={record.recipientId}
              root={rootAddress}
            />
          </dd>
        </div>
        <div>
          <dt className={MICRO}>{record.limitUsd != null ? "Limit released" : "Amount"}</dt>
          <dd className="mt-1 font-mono text-xs tabular text-foreground">
            {record.limitUsd != null ? usd(record.limitUsd) : record.amountUsd != null ? usd(record.amountUsd) : "—"}
          </dd>
        </div>
        <div>
          <dt className={MICRO}>Status</dt>
          <dd className="mt-1">
            <StatusChip status={record.status} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ActivityView() {
  const activity = useActivity();
  const agents = useAgents();
  const tabs = useTabs();
  const recipients = useRecipients();
  const { snapshot, error, retry } = useAccountData();

  const [agentFilter, setAgentFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter | "all">("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id.toLowerCase(), a])), [agents]);
  const tabsById = useMemo(() => new Map(tabs.map((t) => [t.id.toLowerCase(), t])), [tabs]);
  const recipientsById = useMemo(
    () => new Map(recipients.map((r) => [r.id.toLowerCase(), r])),
    [recipients]
  );
  const portfolioReady = usePqtabsData((state) => state.portfolioReady);
  const portfolioError = usePqtabsData((state) => state.portfolioError);
  const indexNote = usePqtabsData((state) => state.indexNote);
  const registrar = usePqtabsData((state) => state.registrar);
  const decisionEpoch = usePqtabsData((state) => state.decisionEpoch);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadDecisions(registrar)
      .then((rows) => {
        if (!cancelled) setDecisions(rows);
      })
      .catch(() => {
        if (!cancelled) setDecisions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [decisionEpoch, registrar]);

  const activeCount =
    (agentFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (query.trim() !== "" ? 1 : 0);

  const clearFilters = () => {
    setAgentFilter("all");
    setTypeFilter("all");
    setQuery("");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...activity]
      .sort((a, b) => a.hoursAgo - b.hoursAgo)
      .filter((r) => agentFilter === "all" || r.agentId?.toLowerCase() === agentFilter.toLowerCase())
      .filter((r) => typeFilter === "all" || TYPE_KINDS[typeFilter].includes(r.kind))
      .filter((r) => {
        if (!q) return true;
        const recipientName = recipientsById.get((r.recipientId ?? "").toLowerCase())?.name.toLowerCase();
        const agentName = agentsById.get((r.agentId ?? "").toLowerCase())?.name.toLowerCase();
        return (
          r.summary.toLowerCase().includes(q) ||
          (recipientName?.includes(q) ?? false) ||
          (agentName?.includes(q) ?? false)
        );
      });
  }, [activity, agentFilter, typeFilter, query, recipientsById, agentsById]);

  const grouped = useMemo(() => {
    const map: Record<Period, ActivityRecord[]> = { TODAY: [], YESTERDAY: [], EARLIER: [] };
    filtered.forEach((r) => map[periodOf(r.hoursAgo)].push(r));
    return map;
  }, [filtered]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ----- initial load gate ---------------------------------------------------
  if (error) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Activity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opens, payments, closes, and returns that Arc included.
          </p>
        </header>
        <EmptyState
          icon={<CircleAlert className="size-5" />}
          title="Couldn’t load activity"
          body="We couldn’t reach the data provider. Nothing was changed."
          action={
            <Button variant="ghost" className={BTN_GHOST} onClick={retry}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!snapshot) {
    return <ViewSkeleton variant="activity" />;
  }

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Activity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opens, payments, closes, and returns that Arc included.
          </p>
        </div>
        <span className="rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {portfolioReady ? `${activity.length} events` : "list not loaded"}
        </span>
      </header>

      {/* Filter bar */}
      <div className="sticky top-16 z-10 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/[.07] bg-[#0e1013]/95 p-3 backdrop-blur md:top-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger aria-label="Filter by agent" className="w-[148px] text-xs">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as TypeFilter | "all")}
        >
          <SelectTrigger aria-label="Filter by event type" className="w-[232px] text-xs">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[180px] flex-1">
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search summary or recipient"
            placeholder="Search summary or recipient…"
            className="h-9 pl-9 text-xs"
          />
        </div>

        {activeCount > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-9 items-center rounded-md border border-gold/25 bg-gold/[.06] px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
              {activeCount} {activeCount === 1 ? "filter" : "filters"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearFilters}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="mt-4 max-h-[calc(100vh-320px)] overflow-y-auto scrollbar-thin pr-1">
        {!portfolioReady ? (
          <EmptyState
            icon={<ActivityIcon className="size-5" />}
            title={portfolioError ? "Couldn't read activity" : indexNote ?? "Loading activity"}
            body={
              portfolioError
                ? "The treasury balance is already the onchain USDC balance. The activity list did not finish."
                : "Activity is still being read from Arc."
            }
          />
        ) : filtered.length === 0 ? (
          activeCount > 0 ? (
            <EmptyState
              icon={<Search className="size-5" />}
              title="No activity matches these filters"
              body="Try a different agent, event type, or search."
              action={
                <Button variant="ghost" className={BTN_GHOST} onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ActivityIcon className="size-5" />}
              title="No activity yet"
              body="Events appear here as agents act."
            />
          )
        ) : (
          PERIODS.map((period) => {
            const records = grouped[period];
            if (records.length === 0) return null;
            return (
              <section key={period} aria-label={period.toLowerCase()}>
                <div className="flex items-center gap-3 pb-1 pt-3 first:pt-0">
                  <span className={cn(MICRO, "tracking-[0.2em]")}>{period}</span>
                  <div className="h-px flex-1 bg-white/[.06]" />
                </div>
                <div>
                  {records.map((record) => {
                    const isExpanded = expanded.has(record.id);
                    return (
                      <div key={record.id} className="rounded-lg">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          onClick={() => toggleExpanded(record.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleExpanded(record.id);
                            }
                          }}
                          className="group -mx-2 flex cursor-pointer items-center gap-2 rounded-lg px-2 transition-colors hover:bg-white/[.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <ActivityRow record={record} />
                          </div>
                          <ChevronDown
                            aria-hidden="true"
                            className={cn(
                              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                              isExpanded && "rotate-180 text-gold"
                            )}
                          />
                        </div>
                        {isExpanded && (
                          <ActivityDetail
                            record={record}
                            agentsById={agentsById}
                            tabsById={tabsById}
                            recipientsById={recipientsById}
                            rootAddress={snapshot.account.rootAddress}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      <section aria-label="Decisions on this device" className="mt-6 border-t border-white/[.06] pt-4">
        <h2 className={MICRO}>Decisions on this device</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          These notes stay in this browser for this wallet. A transaction here is a payment only when that same hash is in the Arc list above.
        </p>
        {decisions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payment decision has been saved for this wallet on this device.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {decisions.map((record) => (
              <li key={record.at} className="rounded-lg border border-white/[.06] px-3 py-2">
                <p className="text-sm text-foreground">
                  {record.decision} · {record.price || "no price"} · {record.payee || "no payee"}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{record.reason.join(", ") || "no reason"}</p>
                {record.charge ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">service charge {record.charge} raw</p> : null}
                {record.txHash ? <p className="mt-1 font-mono text-[10px] text-muted-foreground">{record.txHash}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
