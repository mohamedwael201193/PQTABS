"use client";

import { create } from "zustand";
import type { AccountSnapshot, ActivityRecord, Agent, Tab } from "@/data/types";
import { labelsFor, saveAgentLabel, type AgentLabel } from "@/data/agent-labels";
import { lockRoot } from "@/data/pq-vault";
import { totalsFrom } from "@/data/production";
import { forgetAgentKeys } from "@/data/spend";

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
  agentLabels: Record<string, AgentLabel>;
  portfolioReady: boolean;
  portfolioError: string | null;
  setRegistrar: (address: string) => void;
  setChainId: (chainId: number | null) => void;
  setPortfolioReady: (ready: boolean) => void;
  setPortfolioError: (message: string | null) => void;
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
  agentLabels: {},
  portfolioReady: false,
  portfolioError: null,
  setRegistrar: (address) =>
    set((state) => {
      const same = address.toLowerCase() === state.registrar.toLowerCase();
      if (!same) {
        forgetAgentKeys();
        lockRoot();
      }
      const agentLabels = same ? state.agentLabels : labelsFor(address);
      return {
        registrar: address,
        snapshot: same ? state.snapshot : EMPTY_SNAPSHOT,
        localAgents: same ? state.localAgents : agentsFromLabels(agentLabels),
        agentLabels,
        portfolioReady: same ? state.portfolioReady : false,
        portfolioError: same ? state.portfolioError : null,
      };
    }),
  setChainId: (chainId) => set({ chainId }),
  setPortfolioReady: (ready) => set({ portfolioReady: ready }),
  setPortfolioError: (message) => set({ portfolioError: message }),
  addLocalAgent: (agent) =>
    set((state) => {
      const label = { name: agent.name, purpose: agent.role, address: agent.address };
      saveAgentLabel(state.registrar, label);
      const agentLabels = { ...state.agentLabels, [agent.id.toLowerCase()]: label };
      const exists = state.localAgents.some((item) => item.id.toLowerCase() === agent.id.toLowerCase());
      return {
        agentLabels,
        localAgents: exists ? state.localAgents : [agent, ...state.localAgents],
      };
    }),
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

function applyLabel(agent: Agent, labels: Record<string, AgentLabel>): Agent {
  const label = labels[agent.id.toLowerCase()];
  if (!label?.name) return agent;
  return { ...agent, name: label.name, role: label.purpose || agent.role };
}

function agentsFromLabels(labels: Record<string, AgentLabel>): Agent[] {
  return Object.values(labels).map((label) => ({
    id: label.address,
    name: label.name,
    address: label.address,
    status: "active" as const,
    role: label.purpose || "Named on this device.",
    addedHoursAgo: 0,
    lastActiveHoursAgo: null,
  }));
}

export function useAgents(): Agent[] {
  const chain = usePqtabsData((s) => s.snapshot.agents);
  const local = usePqtabsData((s) => s.localAgents);
  const labels = usePqtabsData((s) => s.agentLabels);
  const namedChain = chain.map((agent) => applyLabel(agent, labels));
  const seen = new Set(namedChain.map((agent) => agent.id.toLowerCase()));
  return [
    ...local.filter((agent) => !seen.has(agent.id.toLowerCase())).map((agent) => applyLabel(agent, labels)),
    ...namedChain,
  ];
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
