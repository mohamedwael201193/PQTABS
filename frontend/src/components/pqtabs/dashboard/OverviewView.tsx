"use client";

import { useState } from "react";
import { Coins, Landmark, Layers, Plus, Wallet } from "lucide-react";
import { CountUp, EmptyState, Reveal } from "@/components/pqtabs/shared";
import { Button } from "@/components/ui/button";
import { ExposureMeter } from "@/components/pqtabs/visuals/ExposureMeter";
import { parseUsdcRaw } from "@/data/actions";
import { pct, usd } from "@/data/formatters";
import { loadSnapshot } from "@/data/production";
import { arcClient, fundRoot } from "@/data/wallet";
import { useWalletUsdc } from "@/hooks/use-account-data";
import { useActivity, useDashboardUi, usePqtabsData, useTabs, useTotals } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ActivityRow } from "./shared/ActivityRow";
import { StatCard } from "./shared/StatCard";
import { TabCard } from "./shared/TabCard";

/**
 * OverviewView — the answer to "what can my money do right now":
 * totals, security posture, treasury exposure, live capabilities and
 * the latest ledger lines, all above the fold of attention.
 */
function FundNotice() {
  const root = usePqtabsData((s) => s.snapshot.account.rootAddress);
  const registrar = usePqtabsData((s) => s.registrar);
  const walletUsdc = useWalletUsdc(registrar);
  const acceptPortfolio = usePqtabsData((s) => s.acceptPortfolio);
  const [amount, setAmount] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!root) return null;
  let sendable = false;
  try {
    const parsed = parseUsdcRaw(amount);
    const walletRaw = walletUsdc == null ? null : BigInt(Math.round(walletUsdc * 1_000_000));
    sendable = parsed > BigInt(0) && (walletRaw == null || parsed <= walletRaw);
  } catch {
    sendable = false;
  }

  async function deposit() {
    setBusy(true);
    setMessage(null);
    try {
      const live = usePqtabsData.getState();
      if (live.registrar.toLowerCase() !== registrar.toLowerCase() || !live.snapshot.account.rootAddress) {
        throw new Error("The wallet changed. The deposit was not sent.");
      }
      const hash = await fundRoot(live.snapshot.account.rootAddress as `0x${string}`, parseUsdcRaw(amount));
      const receipt = await arcClient().waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The deposit reverted.");
      const after = usePqtabsData.getState();
      if (after.registrar.toLowerCase() !== registrar.toLowerCase()) {
        setMessage("The wallet changed. The deposit receipt belongs to the previous wallet.");
        return;
      }
      try {
        acceptPortfolio(await loadSnapshot(after.registrar));
      } catch (reason: unknown) {
        const detail = reason instanceof Error ? reason.message : "The balance refresh did not finish.";
        setMessage(`Arc included the deposit. ${detail}`);
        return;
      }
      setMessage("Confirmed. Root cash is the onchain USDC balance of the root.");
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "The deposit was not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/[.08] bg-[#0e1013] p-5">
      <h2 className="font-display text-lg font-semibold">Your root is ready</h2>
      <p className="mt-1 text-sm text-foreground">Root cash: 0 USDC</p>
      <p className="mt-1 text-sm text-foreground">Your wallet: {walletUsdc == null ? "—" : usd(walletUsdc, { decimals: 6 })}</p>
      <p className="mt-1 text-sm text-muted-foreground">Fund your root to give agents a spending budget. Wallet funds stay in the wallet until you deposit them.</p>
      <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">Deposit address {root}</p>
      <div className="mt-4 rounded-lg border border-white/10 px-3 py-3 text-xs">
        <p className="text-sm text-foreground">Fund the root</p>
        <p className="mt-2 text-muted-foreground">Network</p>
        <p className="text-foreground">Arc Mainnet</p>
        <p className="mt-2 text-muted-foreground">You send</p>
        <p className="text-foreground">{amount.trim() || "0"} USDC from your wallet</p>
        <p className="mt-2 text-muted-foreground">To</p>
        <p className="break-all font-mono text-foreground">{root}</p>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          This is a USDC transfer to your root. It does not grant an allowance, and no agent can spend it until you authorize a capability.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            USDC.transfer · native value 0 · chainId 5042 · network fee is separate Arc gas
          </p>
        </details>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label="Deposit amount in USDC"
          className="h-9 w-32 rounded-lg border border-white/10 bg-transparent px-3 text-sm outline-none"
        />
        <Button onClick={deposit} disabled={busy || !sendable} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
          {busy ? "Waiting for Arc" : "Deposit"}
        </Button>
      </div>
      {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
    </section>
  );
}

export default function OverviewView() {
  const registrar = usePqtabsData((state) => state.registrar);
  const walletUsdc = useWalletUsdc(registrar);
  const portfolioReady = usePqtabsData((state) => state.portfolioReady);
  const portfolioError = usePqtabsData((state) => state.portfolioError);
  const treasuryKnown = usePqtabsData((state) => state.snapshot.account.treasuryKnown !== false);
  const indexNote = usePqtabsData((state) => state.indexNote);
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
  const held = totals.treasuryTotalUsd + totals.exposureUsd + totals.reclaimableUsd;
  const exposurePct = held > 0 ? (totals.exposureUsd / held) * 100 : 0;

  const securityStrip = [
    { label: "Root protection", value: "SLH-DSA verified on Arc", dot: "bg-success" },
    { label: "Agent capabilities", value: "Bounded by policy", dot: "bg-success" },
    { label: "Reachable share", value: portfolioReady ? `${pct(exposurePct)} of funds held` : "list not loaded", dot: "bg-gold" },
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

      {treasuryKnown && totals.treasuryTotalUsd === 0 && totals.activeTabCount === 0 && <FundNotice />}

      {/* Key figures */}
      <section aria-label="Account figures" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Wallet"
          icon={<Wallet strokeWidth={1.75} />}
          value={walletUsdc == null ? "—" : <CountUp value={walletUsdc} format={(value) => usd(value, { decimals: 6 })} />}
          sub="connected account"
        />
        <StatCard
          label="Root cash"
          icon={<Landmark strokeWidth={1.75} />}
          accent="gold"
          value={treasuryKnown ? <CountUp value={totals.treasuryTotalUsd} format={usd} /> : "—"}
          sub="held by the root"
        />
        <StatCard
          delay={0.06}
          label="In capabilities"
          icon={<Layers strokeWidth={1.75} />}
          value={portfolioReady ? <CountUp value={totals.exposureUsd + totals.reclaimableUsd} format={usd} /> : "—"}
          sub="moved into capabilities"
        />
        <StatCard
          delay={0.12}
          label="Agent reachable"
          icon={<Coins strokeWidth={1.75} />}
          accent="teal"
          value={portfolioReady ? <CountUp value={totals.exposureUsd} format={usd} /> : "—"}
          sub="the agent can spend this"
        />
        <StatCard
          delay={0.18}
          label="Open exposure"
          icon={<Wallet strokeWidth={1.75} />}
          value={portfolioReady ? <CountUp value={totals.allocatedUsd} format={usd} /> : "—"}
          sub="sum of capability caps"
        />
        <StatCard
          delay={0.24}
          label="Exposure room"
          icon={<Coins strokeWidth={1.75} />}
          value={portfolioReady ? <CountUp value={totals.availableUsd} format={usd} /> : "—"}
          sub="ceiling minus open exposure"
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
          aria-label="Where funds sit"
          className="rounded-xl border border-white/[.07] bg-[#0e1013] p-5 md:p-6"
        >
          <h2 className="font-display text-base font-semibold tracking-tight">
            Where funds sit
          </h2>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Where every dollar can reach
          </p>
          <div className="mt-5">
            <ExposureMeter totals={totals} capabilitiesKnown={portfolioReady} treasuryKnown={treasuryKnown} />
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
            {portfolioReady ? activeTabs.length : "—"}
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
              title={portfolioReady ? "No active capabilities" : portfolioError ? "Couldn't read capabilities" : indexNote ?? "Loading capabilities"}
              body={
                portfolioReady
                  ? "Create a capability that limits how much an agent can spend."
                  : portfolioError
                    ? "Root cash above is the USDC held by the root. The capability list did not finish."
                    : "Root cash is the USDC held by the root. The capability list is still being read from Arc."
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
          {recent.length > 0 ? (
            <ul className="p-2">
              {recent.map((record) => (
                <li key={record.id}>
                  <ActivityRow record={record} onOpen={() => setView("activity")} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground md:px-5">
              {portfolioReady ? "No activity yet." : portfolioError ? "Couldn't read activity." : "Loading activity."}
            </p>
          )}
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
            Create capability
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
