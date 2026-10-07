"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Activity,
  Bot,
  Building2,
  Gauge,
  LayoutDashboard,
  Plus,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAgents, useDashboardUi, useRecipients } from "@/lib/store";

/**
 * CommandMenu — ⌘K for the whole dashboard.
 *
 * Actions, navigation, agents and recipients in one keyboard-first surface.
 * Selecting a recipient copies its payment address — nothing dead in the menu.
 */

const ITEM = "data-[selected=true]:bg-gold/10 data-[selected=true]:text-gold";
const GROUP =
  "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em]";

export default function CommandMenu() {
  const { commandOpen, setCommandOpen, setView, setCreateOpen, openDrawer } = useDashboardUi();
  const agents = useAgents();
  const recipients = useRecipients();

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const state = useDashboardUi.getState();
        state.setCommandOpen(!state.commandOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (fn: () => void) => {
    setCommandOpen(false);
    fn();
  };

  const copyAddress = async (address: string) => {
    setCommandOpen(false);
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Couldn’t copy the address");
    }
  };

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden rounded-xl border-white/[.08] bg-[#101318] p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <DialogDescription className="sr-only">
          Run a command or jump to a destination.
        </DialogDescription>
        <Command>
          <CommandInput placeholder="Type a command or search…" />
          <CommandList className="max-h-[320px] scrollbar-thin">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </CommandEmpty>

            <CommandGroup heading="Actions" className={GROUP}>
              <CommandItem
                className={ITEM}
                onSelect={() => run(() => setCreateOpen(true))}
              >
                <Plus />
                Create new capability
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("security"))}>
                <Gauge />
                Check exposure
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("security"))}>
                <ShieldCheck />
                Open security center
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("activity"))}>
                <Activity />
                Review activity
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Navigate" className={GROUP}>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("overview"))}>
                <LayoutDashboard />
                Overview
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("tabs"))}>
                <Wallet />
                Tabs
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("agents"))}>
                <Bot />
                Agents
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("activity"))}>
                <Activity />
                Activity
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("security"))}>
                <ShieldCheck />
                Security
              </CommandItem>
              <CommandItem className={ITEM} onSelect={() => run(() => setView("settings"))}>
                <Settings />
                Settings
              </CommandItem>
            </CommandGroup>

            {agents.length > 0 && (
              <CommandGroup heading="Agents" className={GROUP}>
                {agents.map((a) => (
                  <CommandItem
                    key={a.id}
                    className={ITEM}
                    value={`Open ${a.name} ${a.address}`}
                    onSelect={() => run(() => openDrawer({ type: "agent", id: a.id }))}
                  >
                    <Bot />
                    Open {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {recipients.length > 0 && (
              <CommandGroup heading="Recipients" className={GROUP}>
                {recipients.map((r) => (
                  <CommandItem
                    key={r.id}
                    className={ITEM}
                    value={`${r.name} ${r.address}`}
                    onSelect={() => void copyAddress(r.address)}
                  >
                    <Building2 />
                    {r.name}
                    <CommandShortcut>Copy address</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
