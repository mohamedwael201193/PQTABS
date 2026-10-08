"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Bot,
  Command,
  LayoutDashboard,
  Plus,
  Settings,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, Logo } from "@/components/pqtabs/shared";
import { switchRegistrar, useAccountData, useWalletUsdc } from "@/hooks/use-account-data";
import { connectWallet, existingAccount, switchToArc, walletClient } from "@/data/wallet";
import { resumeWalletSession, pauseWalletSession } from "@/data/wallet-session";
import { initials, usd } from "@/data/formatters";
import { useDashboardUi, usePqtabsData, useTotals, type DashboardView } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ViewSkeleton } from "./shared/ViewSkeleton";
import OverviewView from "./OverviewView";
import TabsView from "./TabsView";
import AgentsView from "./AgentsView";
import TabDrawer from "./TabDrawer";
import AgentDrawer from "./AgentDrawer";
// Task 3-b siblings — built in parallel; these resolve when they land.
import ActivityView from "./ActivityView";
import SecurityView from "./SecurityView";
import SettingsView from "./SettingsView";
import CreateTabDialog from "./CreateTabDialog";
import { DomainSetup } from "./DomainSetup";
import CommandMenu from "./CommandMenu";
import { toast } from "sonner";

const NAV_ITEMS: { view: DashboardView; label: string; icon: LucideIcon }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "tabs", label: "Capabilities", icon: Wallet },
  { view: "agents", label: "Agents", icon: Bot },
  { view: "activity", label: "Activity", icon: ActivityIcon },
  { view: "security", label: "Security", icon: ShieldCheck },
];

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Overview",
  tabs: "Capabilities",
  agents: "Agents",
  activity: "Activity",
  security: "Security",
  settings: "Settings",
};

const VIEW_ELEMENTS: Record<DashboardView, ReactElement> = {
  overview: <OverviewView />,
  tabs: <TabsView />,
  agents: <AgentsView />,
  activity: <ActivityView />,
  security: <SecurityView />,
  settings: <SettingsView />,
};

/**
 * DashboardApp — the application shell. One load gate through the data
 * provider (skeleton shell while booting, error panel with retry), then
 * a fixed sidebar on desktop / top bar + bottom nav on mobile, with the
 * active view cross-fading inside a single max-width column. Drawers and
 * dialogs mount once at this level.
 */
function ConnectGate({ onExit }: { onExit: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    existingAccount()
      .then(async (address) => {
        if (cancelled || !address) return;
        const chainId = await walletClient().getChainId();
        if (cancelled) return;
        window.localStorage.removeItem("pqtabs.root");
        usePqtabsData.getState().setChainId(chainId);
        switchRegistrar(address);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    try {
      resumeWalletSession();
      const session = await connectWallet();
      if (session.chainId !== 5042) await switchToArc();
      window.localStorage.removeItem("pqtabs.root");
      switchRegistrar(session.address);
    } catch (reason: unknown) {
      setMessage(reason instanceof Error ? reason.message : "The wallet did not connect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <EmptyState
          icon={<Wallet className="h-5 w-5" strokeWidth={1.75} />}
          title="Connect wallet"
          body="Your wallet identifies you. Connecting does not move USDC. The backup download comes next, and the treasury transaction comes only after you save that file."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button onClick={connect} disabled={busy} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
                {busy ? "Waiting for the wallet" : "Connect wallet"}
              </Button>
              <button type="button" onClick={onExit} className="text-xs text-muted-foreground hover:text-foreground">
                Back to site
              </button>
            </div>
          }
          className="w-full"
        />
        {message && <p className="mt-4 text-center text-sm text-danger">{message}</p>}
      </div>
    </div>
  );
}

export default function DashboardApp({ onExit }: { onExit: () => void }) {
  const registrar = usePqtabsData((s) => s.registrar);
  const { snapshot, loading, error, retry } = useAccountData();
  const activeView = useDashboardUi((s) => s.activeView);
  const reduced = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeView]);

  const rateLimited = Boolean(error && /rate limit/i.test(error));
  const limitedSince = useRef<number | null>(null);
  if (rateLimited) {
    if (limitedSince.current == null) limitedSince.current = Date.now();
  } else {
    limitedSince.current = null;
  }
  const [limitTick, setLimitTick] = useState(0);
  useEffect(() => {
    if (!rateLimited || limitedSince.current == null) return;
    const wait = Math.max(0, limitedSince.current + 20_000 - Date.now());
    const timer = window.setTimeout(() => setLimitTick((value) => value + 1), wait);
    return () => window.clearTimeout(timer);
  }, [rateLimited, error]);
  void limitTick;
  const cooling = rateLimited && limitedSince.current != null && Date.now() < limitedSince.current + 20_000;

  const chainId = usePqtabsData((s) => s.chainId);
  const accountReady = usePqtabsData((s) => s.accountReady);
  const booting = !accountReady || (!snapshot && loading);

  if (!registrar) return <ConnectGate onExit={onExit} />;
  if (chainId !== null && chainId !== 5042) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<Wallet className="h-5 w-5" strokeWidth={1.75} />}
          title="Wrong network"
          body={`Wallet ${registrar.slice(0, 6)}…${registrar.slice(-4)} is connected. PQTABS settles on Arc mainnet. Switch before the treasury can load.`}
          action={
            <div className="flex flex-col items-center gap-3">
              <Button
                onClick={() => {
                  void switchToArc().catch((reason: unknown) => {
                    toast.error(reason instanceof Error ? reason.message : "The wallet stayed on another network.");
                  });
                }}
                className="bg-gold text-[#171204] hover:bg-[#eec95e]"
              >
                Switch to Arc
              </Button>
              <button type="button" onClick={onExit} className="text-xs text-muted-foreground hover:text-foreground">
                Back to site
              </button>
            </div>
          }
          className="w-full max-w-md"
        />
      </div>
    );
  }
  if (snapshot && !snapshot.account.rootAddress) return <DomainSetup onExit={onExit} onReady={retry} />;

  const failed = !snapshot && error !== null;

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
          title={`Wallet ${registrar.slice(0, 6)}…${registrar.slice(-4)} could not be read from Arc.`}
          body={error ?? "Check your connection and try again."}
          action={
            <div className="flex flex-col items-center gap-3">
              <Button onClick={retry} disabled={cooling} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
                {cooling ? "Arc is still rate limiting" : "Try again"}
              </Button>
              <button type="button" onClick={onExit} className="text-xs text-muted-foreground hover:text-foreground">
                Back to site
              </button>
            </div>
          }
          className="w-full max-w-md"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Sidebar onExit={onExit} loading={booting} />
      <MobileTopBar onExit={onExit} />

      <div className="flex min-h-screen flex-1 flex-col md:pl-[248px]">
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
          {error && snapshot && (
            <p className="mb-4 text-sm text-muted-foreground">
              {error}{" "}
              <button type="button" onClick={retry} className="text-gold">
                Try again
              </button>
            </p>
          )}
          {booting ? (
            <ViewSkeleton
              variant={activeView === "settings" ? "security" : activeView}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                {VIEW_ELEMENTS[activeView]}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      <MobileNav />

      {/* Overlays mount once at shell level */}
      <TabDrawer />
      <AgentDrawer />
      <CreateTabDialog />
      <CommandMenu />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop sidebar                                                     */
/* ------------------------------------------------------------------ */

function Sidebar({ onExit, loading }: { onExit: () => void; loading: boolean }) {
  const registrar = usePqtabsData((s) => s.registrar);
  const activeView = useDashboardUi((s) => s.activeView);
  const setView = useDashboardUi((s) => s.setView);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const accountReady = usePqtabsData((s) => s.accountReady);
  const totals = useTotals();
  const account = usePqtabsData((s) => s.snapshot.account);
  const walletUsdc = useWalletUsdc(registrar);

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-white/[.06] bg-[#0a0b0d] md:flex"
      aria-label="Dashboard navigation"
    >
      <div className="px-5 pt-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onExit}
              aria-label="Back to site"
              className="focus-ring rounded-md transition-opacity hover:opacity-80"
            >
              <Logo />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Back to site</TooltipContent>
        </Tooltip>
      </div>

      <div className="px-4 pt-6">
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-9 w-full bg-gold text-[#171204] hover:bg-[#eec95e]"
        >
          <Plus className="size-4" strokeWidth={2} />
          New capability
        </Button>
      </div>

      <nav className="mt-6 flex-1 space-y-1 overflow-y-auto scrollbar-thin px-3" aria-label="Views">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                active
                  ? "bg-white/[.06] text-foreground"
                  : "text-muted-foreground hover:bg-white/[.03] hover:text-foreground"
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-gold"
                />
              )}
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/[.06] p-4">
        {/* Treasury mini-card */}
        <div className="rounded-lg border border-white/[.06] bg-white/[.02] px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Your wallet
          </p>
          <p className="mt-1 font-mono text-sm font-medium tabular text-foreground">
            {walletUsdc == null ? "—" : usd(walletUsdc, { decimals: 6 })}
          </p>
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Treasury
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-5 w-24" />
          ) : (
            <p className="mt-1 font-mono text-sm font-medium tabular text-gold">
              {accountReady && account.treasuryKnown !== false ? usd(totals.treasuryTotalUsd) : "—"}
            </p>
          )}
        </div>

        {/* User chip + settings */}
        <p className="truncate font-mono text-[9px] text-muted-foreground">
          Wallet {registrar.slice(0, 6)}…{registrar.slice(-4)}
        </p>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 font-display text-[11px] font-semibold text-gold"
          >
            {initials(account.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">{account.name}</p>
            <p className="truncate font-mono text-[9px] text-muted-foreground">
              {account.rootLabel}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setView("settings")}
                aria-label="Open settings"
                aria-current={activeView === "settings" ? "page" : undefined}
                className={cn(
                  "focus-ring flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  activeView === "settings"
                    ? "text-gold"
                    : "text-muted-foreground hover:bg-white/[.05] hover:text-foreground"
                )}
              >
                <Settings className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>

        <a
          href={`https://explorer.arc.io/address/${registrar}`}
          target="_blank"
          rel="noreferrer"
          className="block px-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
        >
          View on Arc Explorer
        </a>
        <button
          type="button"
          onClick={() => {
            pauseWalletSession();
            window.localStorage.removeItem("pqtabs.root");
            window.localStorage.removeItem("pqtabs.registrar");
            usePqtabsData.getState().setRegistrar("");
            toast.message("Disconnected from PQTABS. To revoke this site's wallet permission completely, use your wallet's connected-sites settings.");
            onExit();
          }}
          className="focus-ring flex w-full items-center gap-2 rounded-md px-1 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          Disconnect
        </button>
        <button
          type="button"
          onClick={onExit}
          className="focus-ring flex w-full items-center gap-2 rounded-md px-1 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Back to site
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile top bar                                                      */
/* ------------------------------------------------------------------ */

function MobileTopBar({ onExit }: { onExit: () => void }) {
  const activeView = useDashboardUi((s) => s.activeView);
  const setView = useDashboardUi((s) => s.setView);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const setCommandOpen = useDashboardUi((s) => s.setCommandOpen);

  return (
    <header className="sticky top-0 z-40 grid h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-white/[.06] bg-[#0a0b0d]/95 px-4 backdrop-blur md:hidden">
      <button
        type="button"
        onClick={onExit}
        aria-label="Back to site"
        className="focus-ring justify-self-start rounded-md"
      >
        <Logo withWordmark={false} />
      </button>
      <p className="px-3 font-display text-sm font-semibold tracking-tight text-foreground">
        {VIEW_TITLES[activeView]}
      </p>
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open command menu"
          onClick={() => setCommandOpen(true)}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <Command className="size-4" strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open settings"
          onClick={() => setView("settings")}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          <Settings className="size-4" strokeWidth={1.75} />
        </Button>
        <Button
          size="icon"
          aria-label="New capability"
          onClick={() => setCreateOpen(true)}
          className="h-9 w-9 bg-gold text-[#171204] hover:bg-[#eec95e]"
        >
          <Plus className="size-4" strokeWidth={2} />
        </Button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile bottom navigation                                            */
/* ------------------------------------------------------------------ */

function MobileNav() {
  const activeView = useDashboardUi((s) => s.activeView);
  const setView = useDashboardUi((s) => s.setView);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[.06] bg-[#0a0b0d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Dashboard navigation"
    >
      <div className="flex">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setView(item.view)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-ring relative flex flex-1 flex-col items-center gap-1 py-2.5",
                active ? "text-gold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em]">{item.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "h-1 w-1 rounded-full",
                  active ? "bg-gold" : "bg-transparent"
                )}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
