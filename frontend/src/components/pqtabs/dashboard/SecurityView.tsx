"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { pct, relFuture, relTime, usd } from "@/data/formatters";
import type { ActivityKind } from "@/data/types";
import {
  useActivity,
  useAgents,
  useDashboardUi,
  usePqtabsData,
  useSecurity,
  useTabs,
  useTotals,
} from "@/lib/store";
import { PQSigil } from "@/components/pqtabs/shared";
import { ActivityRow } from "@/components/pqtabs/dashboard/shared/ActivityRow";
import ExposureMeter from "@/components/pqtabs/visuals/ExposureMeter";

/**
 * SecurityView — the boundary between your treasury and everything else.
 *
 * Posture, root authority, capability bounds and enforcement — presented as a
 * security surface, not an admin panel.
 */

const MICRO = "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground";
const BTN_GOLD = "bg-gold text-[#171204] shadow-none hover:bg-[#eec95e]";
const BTN_GHOST = "border border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06]";

const SECURITY_EVENT_KINDS: ActivityKind[] = ["policy_blocked", "key_rotated", "capability_expired"];

const ENFORCEMENT_ROWS = [
  { statement: "UI displays policy", note: "What you see" },
  { statement: "Backend relays activity", note: "What you watch" },
  { statement: "Blockchain enforces policy", note: "What guarantees it" },
] as const;

function PostureTile({
  label,
  status,
  detail,
  tone,
}: {
  label: string;
  status: string;
  detail: string;
  tone: "success" | "gold";
}) {
  return (
    <div className="rounded-xl border border-white/[.07] bg-[#0e1013] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={MICRO}>{label}</span>
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", tone === "success" ? "bg-success" : "bg-gold")}
        />
      </div>
      <p
        className={cn(
          "mt-3 font-display text-lg font-semibold tracking-tight",
          tone === "success" ? "text-success" : "text-gold"
        )}
      >
        {status}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function SecurityView() {
  const security = useSecurity();
  const totals = useTotals();
  const tabs = useTabs();
  const agents = useAgents();
  const activity = useActivity();
  const account = usePqtabsData((state) => state.snapshot.account);
  const setView = useDashboardUi((s) => s.setView);

  const [rotateOpen, setRotateOpen] = useState(false);

  const activeTabs = useMemo(() => tabs.filter((t) => t.status === "active"), [tabs]);
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const events = useMemo(
    () =>
      activity
        .filter((r) => SECURITY_EVENT_KINDS.includes(r.kind))
        .sort((a, b) => a.hoursAgo - b.hoursAgo),
    [activity]
  );

  const held = totals.treasuryTotalUsd + totals.exposureUsd + totals.reclaimableUsd;
  const allocatedPct = held > 0 ? (totals.exposureUsd / held) * 100 : 0;

  const nextRotationHours = Math.max(
    0,
    security.rotationIntervalDays * 24 - security.lastRotationHoursAgo
  );
  const rotationImminent = nextRotationHours < 24 * 7;

  const secured = security.rootStatus === "secured";

  return (
    <div className="min-w-0 space-y-4">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Security
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The boundary between your treasury and everything else.
        </p>
      </header>

      {/* Posture */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PostureTile
          label="Root protection"
          status="Post-quantum"
          detail="SLH-DSA · SPHINCS+-128s"
          tone="success"
        />
        <PostureTile
          label="Agent capabilities"
          status="Bounded"
          detail="caps, per-call limits, recipients, expiry"
          tone="success"
        />
        <PostureTile
          label="Treasury exposure"
          status="Controlled"
          detail={`${pct(allocatedPct)} of funds allocated`}
          tone="gold"
        />
        <PostureTile
          label="Policy enforcement"
          status="Onchain"
          detail="enforced by protocol, displayed here"
          tone="success"
        />
      </div>

      <ExposureMeter totals={totals} />

      {/* Root authority + custody */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-xl border border-white/[.07] bg-[#0e1013] p-6 lg:col-span-2">
          <PQSigil
            size={180}
            className="pointer-events-none absolute -top-10 -right-10 text-gold opacity-[.06]"
          />
          <div className="relative">
            <p className={MICRO}>Root authority</p>
            <dl className="mt-2 divide-y divide-white/[.06]">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">Scheme</dt>
                <dd className="font-mono text-xs text-foreground">{security.rootScheme}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  {secured ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                      Secured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                      Rotation due
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">Last rotation</dt>
                <dd className="font-mono text-xs tabular text-foreground">
                  {relTime(security.lastRotationHoursAgo)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">Rotation interval</dt>
                <dd className="font-mono text-xs tabular text-foreground">
                  {security.rotationIntervalDays > 0
                    ? `every ${security.rotationIntervalDays} days`
                    : "no scheduled rotation"}
                </dd>
              </div>
              {security.rotationIntervalDays > 0 && (
              <div className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-muted-foreground">Next rotation</dt>
                <dd
                  className={cn(
                    "font-mono text-xs tabular",
                    rotationImminent ? "text-warning" : "text-foreground"
                  )}
                >
                  {relFuture(nextRotationHours)}
                </dd>
              </div>
              )}
            </dl>
            <div className="mt-5">
              <Button variant="ghost" className={BTN_GHOST} onClick={() => setRotateOpen(true)}>
                <KeyRound className="size-4" />
                Rotate root key
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={MICRO}>Recovery &amp; custody</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/25 bg-warning/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
              Backup file
            </span>
          </div>
          <div className="mt-4 space-y-3.5 text-sm leading-relaxed text-muted-foreground">
            <p>Your root authority cannot be recreated from your wallet alone. The backup file is the only copy.</p>
            <p>If the backup and this device are both lost, the USDC in the root stays there. There is no operator recovery.</p>
          </div>
          <details className="mt-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">Technical details</summary>
            <dl className="mt-3 space-y-2 break-all font-mono text-[10px] leading-relaxed">
              <div>Root {account.rootAddress || "—"}</div>
              <div>PQ verifying key {account.pqVk || "—"}</div>
              <div>Network Arc {account.chainId ?? 5042}</div>
              <div>Factory {account.factory || "—"}</div>
              <div>Nonce {account.nonce || "—"}</div>
              <div>PQ verification precompile 0x1800000000000000000000000000000000000004</div>
              <div>Barkeep {account.barkeep || "—"}</div>
              {account.explorer && account.rootAddress && (
                <div>
                  <a className="text-gold" href={`${account.explorer}/address/${account.rootAddress}`} target="_blank" rel="noreferrer">
                    View on Arc Explorer
                  </a>
                </div>
              )}
            </dl>
          </details>
        </section>
      </div>

      {/* Capability bounds */}
      <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
        <div className="flex items-center justify-between gap-3">
          <p className={MICRO}>Active capability bounds</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {activeTabs.length} active
          </span>
        </div>
        {activeTabs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No active capabilities.</p>
        ) : (
          <div className="mt-4 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-white/[.08]">
                  {["Tab", "Agent", "Cap", "Per call", "Recipients", "Expires"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className={cn(MICRO, "pb-2.5 pr-6 font-normal tracking-[0.14em] last:pr-0")}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.05]">
                {activeTabs.map((tab) => {
                  const imminent = tab.policy.expiresInHours < 24;
                  return (
                    <tr key={tab.id} className="text-xs text-foreground">
                      <td className="py-3 pr-6 font-mono text-gold">{tab.reference}</td>
                      <td className="py-3 pr-6">
                        {agentsById.get(tab.agentId)?.name ?? "—"}
                      </td>
                      <td className="py-3 pr-6 font-mono tabular">
                        {usd(tab.capUsd, { decimals: 0 })}
                      </td>
                      <td className="py-3 pr-6 font-mono tabular">
                        {usd(tab.policy.maxPerCallUsd, { decimals: 0 })}
                      </td>
                      <td className="py-3 pr-6 font-mono tabular">
                        {tab.policy.allowedRecipients.length}
                      </td>
                      <td
                        className={cn(
                          "py-3 font-mono tabular",
                          imminent ? "text-warning" : "text-muted-foreground"
                        )}
                      >
                        {relFuture(tab.policy.expiresInHours)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Enforcement model */}
      <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
        <p className={MICRO}>Enforcement model</p>
        <div className="mt-1 divide-y divide-white/[.06]">
          {ENFORCEMENT_ROWS.map((row, i) => (
            <div key={row.note} className="flex items-center justify-between gap-4 py-4">
              <p className="font-display text-base font-medium text-foreground md:text-lg">
                {row.statement}
              </p>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10px] uppercase tracking-[0.18em]",
                  i === ENFORCEMENT_ROWS.length - 1 ? "text-gold" : "text-muted-foreground"
                )}
              >
                {row.note}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Security events */}
      <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
        <div className="flex items-center justify-between gap-3">
          <p className={MICRO}>Security events</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {events.length} recorded
          </span>
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
          {events.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No security events recorded.
            </p>
          ) : (
            events.map((r) => (
              <ActivityRow key={r.id} record={r} onOpen={() => setView("activity")} />
            ))
          )}
        </div>
      </section>

      {/* Rotate root key confirmation */}
      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent className="rounded-xl border-white/[.08] bg-[#0e1013]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-tight">
              Rotate the root key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A new SLH-DSA key pair becomes active for all future capability signatures. Existing
              capabilities keep their policy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_GHOST}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={BTN_GOLD}
              onClick={() => {
                toast.message("A rotation is recorded only after Arc accepts a signed ROTATE_KEY action.");
                setRotateOpen(false);
              }}
            >
              Keep current key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
