"use client";

import { useEffect, type ReactElement } from "react";
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
import { switchRegistrar, useAccountData } from "@/hooks/use-account-data";
import { KNOWN_REGISTRARS } from "@/data/production";
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
import CommandMenu from "./CommandMenu";

const NAV_ITEMS: { view: DashboardView; label: string; icon: LucideIcon }[] = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "tabs", label: "Tabs", icon: Wallet },
  { view: "agents", label: "Agents", icon: Bot },
  { view: "activity", label: "Activity", icon: ActivityIcon },
  { view: "security", label: "Security", icon: ShieldCheck },
];

const VIEW_TITLES: Record<DashboardView, string> = {
  overview: "Overview",
  tabs: "Tabs",
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
export default function DashboardApp({ onExit }: { onExit: () => void }) {
  const { snapshot, loading, error, retry } = useAccountData();
  const activeView = useDashboardUi((s) => s.activeView);
  const reduced = useReducedMotion();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeView]);

  const booting = !snapshot && loading;
  const failed = !snapshot && error !== null;

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <EmptyState
          icon={<ShieldCheck className="h-5 w-5" strokeWidth={1.75} />}
          title="Couldn&apos;t load your treasury."
          body={error ?? "Check your connection and try again."}
          action={
            <Button onClick={retry} className="bg-gold text-[#171204] hover:bg-[#eec95e]">
              Try again
            </Button>
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
  const activeView = useDashboardUi((s) => s.activeView);
  const setView = useDashboardUi((s) => s.setView);
  const setCreateOpen = useDashboardUi((s) => s.setCreateOpen);
  const totals = useTotals();
  const account = usePqtabsData((s) => s.snapshot.account);

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
            Root balance
          </p>
          {loading ? (
            <Skeleton className="mt-1.5 h-5 w-24" />
          ) : (
            <p className="mt-1 font-mono text-sm font-medium tabular text-gold">
              {usd(totals.treasuryTotalUsd)}
            </p>
          )}
        </div>

        {/* User chip + settings */}
        <div className="flex gap-1">
          {KNOWN_REGISTRARS.map((address) => (
            <button
              key={address}
              type="button"
              onClick={() => switchRegistrar(address)}
              className="focus-ring truncate rounded border border-white/10 px-1.5 py-1 font-mono text-[9px] text-muted-foreground hover:text-foreground"
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </button>
          ))}
        </div>
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
