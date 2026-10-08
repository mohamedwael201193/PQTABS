"use client";

import { useState } from "react";
import type { ReactNode } from "react";
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
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { initials } from "@/data/formatters";
import { loadSnapshot } from "@/data/production";
import { useDashboardUi, usePqtabsData } from "@/lib/store";
import { Kbd } from "@/components/pqtabs/shared";

/**
 * SettingsView — account, environment, and data controls.
 *
 * Honest by design: the profile is read-only, the environment card states
 * plainly what the current data is and what it becomes in production, and the
 * single data control is an explicit reset.
 */

const MICRO = "font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground";
const BTN_GHOST = "border border-white/10 bg-white/[.03] text-foreground shadow-none hover:bg-white/[.06]";

const SHORTCUTS: { action: string; keys: ReactNode }[] = [
  {
    action: "Open the command menu",
    keys: (
      <>
        <Kbd>⌘ K</Kbd>
        <span className="text-xs text-muted-foreground">/</span>
        <Kbd>Ctrl K</Kbd>
      </>
    ),
  },
  { action: "Close panels and dialogs", keys: <Kbd>Esc</Kbd> },
  { action: "Confirm dialogs and advance steps", keys: <Kbd>Enter</Kbd> },
  {
    action: "Move between options",
    keys: (
      <>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </>
    ),
  },
];

const DATA_MAPPINGS = [
  { surface: "Wallet", source: "connected account USDC" },
  { surface: "Root cash", source: "USDC held by the root" },
  { surface: "In capabilities", source: "USDC moved into capabilities" },
  { surface: "Agent reachable", source: "USDC the agent can spend" },
  { surface: "Capabilities", source: "Barkeep tab state" },
  { surface: "Activity", source: "chain + backend events" },
  { surface: "Security", source: "contract reads" },
] as const;

export default function SettingsView() {
  const account = usePqtabsData((s) => s.snapshot.account);
  const setView = useDashboardUi((s) => s.setView);

  const [resetOpen, setResetOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  const reload = async () => {
    const registrar = usePqtabsData.getState().registrar;
    if (!registrar) throw new Error("Connect a wallet before reading Arc.");
    const snapshot = await loadSnapshot(registrar);
    if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) {
      throw new Error("The wallet changed. This screen was not updated.");
    }
    usePqtabsData.getState().acceptPortfolio(snapshot);
  };

  return (
    <div className="min-w-0 max-w-3xl">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account, environment, and data controls.
        </p>
      </header>

      <div className="mt-6 space-y-4">
        {/* Profile */}
        <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={MICRO}>Profile</p>
            <span className="inline-flex items-center rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Read-only
            </span>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gold/[.06] font-display text-base font-semibold text-gold">
              {initials(account.name)}
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tracking-tight text-foreground">
                {account.name}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {account.id} · {account.rootLabel}
              </p>
              <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                {account.pqVk ? `verifying key ${account.pqVk.slice(0, 10)}…` : "No root on this registrar"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Identity and root material are managed by your root account. Nothing here is editable
            from the dashboard.
          </p>
        </section>

        {/* Keyboard shortcuts */}
        <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
          <p className={MICRO}>Keyboard</p>
          <div className="mt-1 divide-y divide-white/[.06]">
            {SHORTCUTS.map((s) => (
              <div key={s.action} className="flex items-center justify-between gap-4 py-3">
                <p className="text-sm text-foreground">{s.action}</p>
                <div className="flex shrink-0 items-center gap-1.5">{s.keys}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Environment */}
        <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className={MICRO}>Environment</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              Arc mainnet
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Balances, capabilities, and activity are reads from chain {account.chainId ?? 5042}. The backend relays signed actions. It does not decide whether they are allowed.
          </p>
          <dl className="mt-4 space-y-2 font-mono text-[11px] text-muted-foreground">
            <div className="flex justify-between gap-3"><dt>Root</dt><dd className="truncate text-foreground">{account.rootAddress || "none"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Registrar</dt><dd className="truncate text-foreground">{account.registrar || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Factory</dt><dd className="truncate text-foreground">{account.factory || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt>USDC</dt><dd className="truncate text-foreground">{account.usdc || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Nonce</dt><dd className="text-foreground">{account.nonce || "—"}</dd></div>
          </dl>
          <div className="mt-4 rounded-lg border border-white/[.06] bg-white/[.015] p-4">
            <dl className="space-y-2.5">
              {DATA_MAPPINGS.map((m) => (
                <div key={m.surface} className="flex items-center justify-between gap-4">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {m.surface}
                  </dt>
                  <dd className="font-mono text-xs text-foreground">{m.source}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Data controls */}
        <section className="rounded-xl border border-white/[.07] bg-[#0e1013] p-6">
          <p className={MICRO}>Data controls</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Read this registrar&apos;s root, capabilities, and receipts from Arc again.
            </p>
            <Button variant="ghost" className={BTN_GHOST} onClick={() => setResetOpen(true)} disabled={reloading}>
              <RotateCcw className="size-4" />
              Reload from Arc
            </Button>
          </div>
        </section>
      </div>

      {/* Reset confirmation */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className="rounded-xl border-white/[.08] bg-[#0e1013]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display tracking-tight">
              Reload this root from Arc?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The numbers on screen are replaced by the current chain reads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_GHOST}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gold text-[#171204] shadow-none hover:bg-[#eec95e]"
              disabled={reloading}
              onClick={(event) => {
                event.preventDefault();
                if (reloading) return;
                setReloading(true);
                void reload()
                  .then(() => {
                    toast.success("Reloaded from Arc");
                    setResetOpen(false);
                    setView("overview");
                  })
                  .catch((reason: unknown) => {
                    toast.error(reason instanceof Error ? reason.message : "Arc did not return this account.");
                  })
                  .finally(() => setReloading(false));
              }}
            >
              {reloading ? "Reading Arc" : "Reload"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
