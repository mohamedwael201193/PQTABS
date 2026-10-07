/**
 * PQTABS application data interfaces.
 *
 * These types are the stable contract between the UI and the data layer.
 * Values come from the Render backend, which reads Arc mainnet.
 */

export type AgentStatus = "active" | "paused" | "revoked";

export type TabStatus = "active" | "expired" | "closed";

/** A tab becomes reclaimable once expired with balance remaining. */
export type ReclaimState = "none" | "ready";

export type ActivityKind =
  | "payment"
  | "capability_opened"
  | "capability_closed"
  | "capability_expired"
  | "reclaim"
  | "policy_blocked"
  | "agent_added"
  | "key_rotated";

export type ActivityStatus =
  | "authorized"
  | "settling"
  | "completed"
  | "reverted"
  | "expired"
  | "reclaimed";

export interface UserAccount {
  id: string;
  name: string;
  /** Display label of the root authority, e.g. "PQ Root · SLH-DSA". */
  rootLabel: string;
  /** USDC sitting on the root, in whole units (6-decimal raw / 1e6). */
  treasuryTotalUsd: number;
  activeHours: number;
  maxExposureUsd?: number;
  openExposureUsd?: number;
  rootAddress?: string;
  registrar?: string;
  pqVk?: string;
  chainId?: number;
  nonce?: string;
  factory?: string;
  usdc?: string;
  explorer?: string;
  barkeep?: string;
}

export interface Recipient {
  id: string;
  name: string;
  /** Application-level payment identifier. */
  address: string;
  category: "Data" | "Infrastructure" | "Compute" | "Monitoring" | "Communications";
}

export interface Agent {
  id: string;
  name: string;
  address: string;
  status: AgentStatus;
  /** One-line purpose, shown in lists. */
  role: string;
  /** Hours since the agent was enrolled. */
  addedHoursAgo: number;
  /** Hours since last recorded activity; null when never active. */
  lastActiveHoursAgo: number | null;
}

export interface TabPolicy {
  /** Maximum single-payment amount, USDC. */
  maxPerCallUsd: number;
  /** Recipients this capability may pay. */
  allowedRecipients: string[]; // Recipient ids
  /** Hours until the capability expires (relative offset). */
  expiresInHours: number;
}

export interface Tab {
  id: string;
  /** Human-facing short reference, e.g. "TAB-9F42". */
  reference: string;
  agentId: string;
  status: TabStatus;
  /** Total funded cap, USDC. */
  capUsd: number;
  /** Remaining spendable balance, USDC (completed payments only). */
  balanceUsd: number;
  policy: TabPolicy;
  /** Hours since the capability was opened. */
  openedHoursAgo: number;
  /** Hours since expiry, for expired tabs (0 while active). */
  expiredHoursAgo: number;
  txHash?: string;
  expiryUnix?: number;
}

export interface ActivityRecord {
  id: string;
  kind: ActivityKind;
  status: ActivityStatus;
  /** Hours ago the record occurred. */
  hoursAgo: number;
  agentId?: string;
  tabId?: string;
  recipientId?: string;
  /** Payment amount where applicable, USDC. */
  amountUsd?: number;
  /** Human sentence describing the event. */
  summary: string;
  txHash?: string;
}

export interface SecurityState {
  rootScheme: string;
  rootStatus: "secured" | "rotation_due";
  /** Hours since the last root key rotation. */
  lastRotationHoursAgo: number;
  /** Scheduled rotation interval. */
  rotationIntervalDays: number;
  recoveryConfigured: boolean;
  /** Where policy is enforced — architectural statement. */
  enforcement: "onchain-policy";
}

/** Aggregate figures derived from tabs — computed, never seeded directly. */
export interface TreasuryTotals {
  treasuryTotalUsd: number;
  /** Sum of caps across active tabs. */
  allocatedUsd: number;
  /** Remaining balances across active tabs. */
  exposureUsd: number;
  /** Funds neither allocated nor awaiting reclaim. */
  availableUsd: number;
  /** Remaining balances on expired tabs awaiting reclaim. */
  reclaimableUsd: number;
  activeTabCount: number;
  reclaimableTabCount: number;
}

export interface AccountSnapshot {
  account: UserAccount;
  agents: Agent[];
  tabs: Tab[];
  recipients: Recipient[];
  activity: ActivityRecord[];
  security: SecurityState;
  totals: TreasuryTotals;
}

export interface NewCapabilityInput {
  agentId: string;
  capUsd: number;
  maxPerCallUsd: number;
  allowedRecipients: string[];
  expiresInHours: number;
}

/**
 * Read and relay surface. The chain accepts or rejects the action.
 * These methods do not invent a successful tab, close, or payment.
 */
export interface DataProvider {
  loadAccount(): Promise<AccountSnapshot>;
  createCapability(input: NewCapabilityInput): Promise<Tab>;
  closeCapability(tabId: string): Promise<void>;
  reclaimCapability(tabId: string): Promise<void>;
  rotateAgentKey(agentId: string): Promise<void>;
}
