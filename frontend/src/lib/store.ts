"use client";

import { create } from "zustand";
import type { AccountSnapshot, ActivityRecord, Agent, Tab } from "@/data/types";
import { totalsFrom } from "@/data/production";

/**
 * Application state stores.
 *
 * `usePqtabsData` holds the live dataset and every mutation. All writes flow
 * through actions here so the dataset stays internally consistent (totals are
 * always recomputed from tabs). The production data provider will call these
 * same actions when real events arrive — the UI is agnostic to the source.
 */

const EMPTY_SNAPSHOT: AccountSnapshot = {
  account: {
    id: "",
    name: "Root",
    rootLabel: "Arc mainnet",
    treasuryTotalUsd: 0,
    activeHours: 0,
  },
  agents: [],
  tabs: [],
  recipients: [],
  activity: [],
  security: {
    rootScheme: "SLH-DSA-SHA2-128s",
    rootStatus: "secured",
    lastRotationHoursAgo: 0,
    rotationIntervalDays: 0,
    recoveryConfigured: false,
    enforcement: "onchain-policy",
  },
  totals: {
    treasuryTotalUsd: 0,
    allocatedUsd: 0,
    exposureUsd: 0,
    availableUsd: 0,
    reclaimableUsd: 0,
    activeTabCount: 0,
    reclaimableTabCount: 0,
  },
};

interface PqtabsDataState {
  snapshot: AccountSnapshot;
  registrar: string;
  chainId: number | null;
  localAgents: Agent[];
  portfolioReady: boolean;
  setRegistrar: (address: string) => void;
  setChainId: (chainId: number | null) => void;
  setPortfolioReady: (ready: boolean) => void;
  addLocalAgent: (agent: Agent) => void;
  replaceSnapshot: (snapshot: AccountSnapshot) => void;
  createCapability: () => never;
  closeCapability: () => never;
  reclaimCapability: () => never;
  rotateAgentKey: () => never;
  rotateRootKey: () => never;
}

const SIGNATURE_REQUIRED =
  "This action needs a signature from the root PQ key. The server cannot sign it, and this screen will not mark it successful.";

export const usePqtabsData = create<PqtabsDataState>((set) => ({
  snapshot: EMPTY_SNAPSHOT,
  registrar: "",
  chainId: null,
  localAgents: [],
  portfolioReady: false,
  setRegistrar: (address) =>
    set((state) => {
      const same = address.toLowerCase() === state.registrar.toLowerCase();
      return {
        registrar: address,
        snapshot: same ? state.snapshot : EMPTY_SNAPSHOT,
        localAgents: same ? state.localAgents : [],
        portfolioReady: same ? state.portfolioReady : false,
      };
    }),
  setChainId: (chainId) => set({ chainId }),
  setPortfolioReady: (ready) => set({ portfolioReady: ready }),
  addLocalAgent: (agent) =>
    set((state) => ({
      localAgents: state.localAgents.some((item) => item.id.toLowerCase() === agent.id.toLowerCase())
        ? state.localAgents
        : [agent, ...state.localAgents],
    })),
  replaceSnapshot: (snapshot) => set({ snapshot: { ...snapshot, totals: totalsFrom(snapshot.account, snapshot.tabs) } }),
  createCapability: () => {
    throw new Error(SIGNATURE_REQUIRED);
  },
  closeCapability: () => {
    throw new Error(SIGNATURE_REQUIRED);
  },
  reclaimCapability: () => {
    throw new Error(SIGNATURE_REQUIRED);
  },
  rotateAgentKey: () => {
    throw new Error(SIGNATURE_REQUIRED);
  },
  rotateRootKey: () => {
    throw new Error(SIGNATURE_REQUIRED);
  },
}));

// ---------------------------------------------------------------------------
// Dashboard UI state (view routing, drawers, dialogs)
// ---------------------------------------------------------------------------

export type DashboardView =
  | "overview"
  | "tabs"
  | "agents"
  | "activity"
  | "security"
  | "settings";

export type DrawerTarget =
  | { type: "tab"; id: string }
  | { type: "agent"; id: string };

interface DashboardUiState {
  activeView: DashboardView;
  drawer: DrawerTarget | null;
  createOpen: boolean;
  /** Agent preselected for the create-capability flow. */
  createPresetAgentId: string | null;
  commandOpen: boolean;
  setView: (view: DashboardView) => void;
  openDrawer: (target: DrawerTarget) => void;
  closeDrawer: () => void;
  setCreateOpen: (open: boolean, presetAgentId?: string | null) => void;
  setCommandOpen: (open: boolean) => void;
}

export const useDashboardUi = create<DashboardUiState>((set) => ({
  activeView: "overview",
  drawer: null,
  createOpen: false,
  createPresetAgentId: null,
  commandOpen: false,
  setView: (view) => set({ activeView: view, drawer: null }),
  openDrawer: (target) => set({ drawer: target }),
  closeDrawer: () => set({ drawer: null }),
  setCreateOpen: (open, presetAgentId = null) =>
    set({ createOpen: open, createPresetAgentId: presetAgentId }),
  setCommandOpen: (open) => set({ commandOpen: open }),
}));

// ---------------------------------------------------------------------------
// Convenience selectors
// ---------------------------------------------------------------------------

export function useTabs(): Tab[] {
  return usePqtabsData((s) => s.snapshot.tabs);
}

export function useAgents(): Agent[] {
  const chain = usePqtabsData((s) => s.snapshot.agents);
  const local = usePqtabsData((s) => s.localAgents);
  const seen = new Set(chain.map((agent) => agent.id.toLowerCase()));
  return [...local.filter((agent) => !seen.has(agent.id.toLowerCase())), ...chain];
}

export function useActivity(): ActivityRecord[] {
  return usePqtabsData((s) => s.snapshot.activity);
}

export function useRecipients() {
  return usePqtabsData((s) => s.snapshot.recipients);
}

export function useSecurity() {
  return usePqtabsData((s) => s.snapshot.security);
}

export function useTotals() {
  return usePqtabsData((s) => s.snapshot.totals);
}
