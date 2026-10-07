import { digestFor, encodeClose, encodeOpen, signatureBytes } from "./actions";
import { arcClient } from "./wallet";
import type { Hex } from "viem";
import type {
  AccountSnapshot,
  ActivityKind,
  ActivityRecord,
  ActivityStatus,
  Agent,
  Recipient,
  SecurityState,
  Tab,
  TabStatus,
  TreasuryTotals,
  UserAccount,
} from "./types";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://pqtabs.onrender.com";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.arc.io";

const REGISTRAR_KEY = "pqtabs.registrar";

/** The connected wallet. Empty until the user connects. Never a built-in account. */
export function currentRegistrar(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(REGISTRAR_KEY);
  return stored && stored.startsWith("0x") && stored.length === 42 ? stored : "";
}

export function rememberRegistrar(address: string): void {
  window.localStorage.setItem(REGISTRAR_KEY, address);
}

type ConfigJson = {
  chainId: number;
  factory: string;
  usdc: string;
  barkeep: string;
  explorer: string;
};

type RootJson = {
  root: string;
  pqVk: string;
  registrar: string;
  nextNonce: string;
  maxOpenExposure: string;
  openExposure: string;
  usdc: string;
};

type PortfolioTab = {
  tab: string;
  agent: string;
  cap: string;
  expiry: string;
  open: boolean;
  needsSweep: boolean;
  owner: string;
  maxPerCall: string;
  usdc: string;
  payees: string[];
  openedTx: string;
  openedAt: string;
};

type PortfolioEvent = {
  kind: "opened" | "closed" | "transfer" | "rotated" | "spend";
  tx: string;
  block: string;
  timestamp: string;
  tab?: string;
  agent?: string;
  amount?: string;
  to?: string;
};

function readableError(detail: string | undefined, fallback: string): string {
  if (!detail) return fallback;
  if (detail.includes("rate limit") || detail.includes("429")) {
    return "Arc is rate limiting reads. Try again in a moment.";
  }
  return detail.length > 240 ? `${detail.slice(0, 240)}…` : detail;
}

function usdc(raw: string | undefined): number {
  if (!raw) return 0;
  return Number(raw) / 1_000_000;
}

function hoursBetween(unixSeconds: number, nowSeconds: number): number {
  return (nowSeconds - unixSeconds) / 3600;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function tabStatus(row: PortfolioTab, now: number): TabStatus {
  if (!row.open) return "closed";
  if (Number(row.expiry) <= now) return "expired";
  return "active";
}

async function readBody(response: Response): Promise<{ error?: string; detail?: string }> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; detail?: string };
  } catch {
    throw new Error(`The backend returned ${response.status}.`);
  }
}

async function getJson<T>(path: string): Promise<T> {
  let pause = 2000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${BACKEND_URL}${path}`);
    const body = (await readBody(response)) as T & { error?: string; detail?: string };
    if (response.ok) return body;
    const message = readableError(body.detail || body.error, `read failed (${response.status})`);
    if (!message.includes("rate limit") || attempt === 2) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, pause));
    pause *= 2;
  }
  throw new Error("Arc is rate limiting reads. Try again in a moment.");
}

export async function loadConfig(): Promise<ConfigJson> {
  const config = await getJson<ConfigJson>("/v1/config");
  if (config.chainId !== 5042) {
    throw new Error(`This backend reports chain ${config.chainId}. PQTABS reads Arc mainnet (5042).`);
  }
  return config;
}

export async function loadAccount(
  registrar: string,
  onTreasury: (snapshot: AccountSnapshot) => void,
): Promise<AccountSnapshot> {
  const config = await loadConfig();
  const listed = await getJson<{ roots: string[] }>(`/v1/registrars/${registrar}/roots`);
  const preferred = currentRoot();
  const root = listed.roots.find((item) => item.toLowerCase() === preferred?.toLowerCase()) ?? listed.roots[0];
  if (!root) {
    const empty = emptySnapshot(registrar, config);
    onTreasury(empty);
    return empty;
  }
  const state = await getJson<RootJson>(`/v1/roots/${root}`);
  onTreasury(mapSnapshot(registrar, state, [], [], config));
  const portfolio = await getJson<{ tabs: PortfolioTab[]; activity: PortfolioEvent[] }>(`/v1/roots/${root}/portfolio`);
  return mapSnapshot(registrar, state, portfolio.tabs, portfolio.activity, config);
}

export async function loadSnapshot(registrar: string): Promise<AccountSnapshot> {
  const config = await loadConfig();
  const listed = await getJson<{ roots: string[] }>(`/v1/registrars/${registrar}/roots`);
  const preferred = currentRoot();
  const root = listed.roots.find((item) => item.toLowerCase() === preferred?.toLowerCase()) ?? listed.roots[0];
  if (!root) {
    return emptySnapshot(registrar, config);
  }
  const [state, portfolio] = await Promise.all([
    getJson<RootJson>(`/v1/roots/${root}`),
    getJson<{ tabs: PortfolioTab[]; activity: PortfolioEvent[] }>(`/v1/roots/${root}/portfolio`),
  ]);
  return mapSnapshot(registrar, state, portfolio.tabs, portfolio.activity, config);
}

const ROOT_KEY = "pqtabs.root";

export function currentRoot(): string | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(ROOT_KEY);
  return stored && stored.startsWith("0x") && stored.length === 42 ? stored : null;
}

export function rememberRoot(address: string): void {
  window.localStorage.setItem(ROOT_KEY, address);
}

function emptySnapshot(registrar: string, config?: ConfigJson): AccountSnapshot {
  const account: UserAccount = {
    id: registrar,
    name: short(registrar),
    rootLabel: "No root on this factory",
    treasuryTotalUsd: 0,
    activeHours: 0,
    maxExposureUsd: 0,
    rootAddress: "",
    registrar,
    pqVk: "",
    chainId: config?.chainId ?? 5042,
    factory: config?.factory,
    usdc: config?.usdc,
    explorer: config?.explorer ?? EXPLORER_URL,
    barkeep: config?.barkeep,
  };
  return {
    account,
    agents: [],
    tabs: [],
    recipients: [],
    activity: [],
    security: securityState(null),
    totals: totalsFrom(account, []),
  };
}

function mapSnapshot(
  registrar: string,
  state: RootJson,
  rows: PortfolioTab[],
  events: PortfolioEvent[],
  config?: ConfigJson,
): AccountSnapshot {
  const now = Date.now() / 1000;
  const recipients = new Map<string, Recipient>();
  const tabs: Tab[] = rows.map((row) => {
    for (const payee of row.payees) {
      recipients.set(payee.toLowerCase(), {
        id: payee,
        name: short(payee),
        address: payee,
        category: "Infrastructure",
      });
    }
    const status = tabStatus(row, now);
    const expiry = Number(row.expiry);
    return {
      id: row.tab,
      reference: short(row.tab),
      agentId: row.agent,
      status,
      capUsd: usdc(row.cap),
      balanceUsd: usdc(row.usdc),
      policy: {
        maxPerCallUsd: usdc(row.maxPerCall),
        allowedRecipients: row.payees,
        expiresInHours: status === "active" ? (expiry - now) / 3600 : 0,
      },
      openedHoursAgo: hoursBetween(Number(row.openedAt), now),
      expiredHoursAgo: status === "expired" ? hoursBetween(expiry, now) : 0,
      txHash: row.openedTx,
      expiryUnix: expiry,
    };
  });

  const agents: Agent[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    const key = tab.agentId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const related = tabs.filter((item) => item.agentId.toLowerCase() === key);
    const active = related.some((item) => item.status === "active");
    agents.push({
      id: tab.agentId,
      name: short(tab.agentId),
      address: tab.agentId,
      status: active ? "active" : "revoked",
      role: "ECDSA key bound to a Barkeep tab",
      addedHoursAgo: Math.min(...related.map((item) => item.openedHoursAgo)),
      lastActiveHoursAgo: related[0]?.openedHoursAgo ?? null,
    });
  }

  const activity: ActivityRecord[] = events.map((event) => ({
    id: event.tx,
    kind: activityKind(event.kind),
    status: "completed" as ActivityStatus,
    hoursAgo: hoursBetween(Number(event.timestamp), now),
    agentId: event.agent,
    tabId: event.tab,
    recipientId: event.to,
    amountUsd: event.amount ? usdc(event.amount) : undefined,
    summary: activitySummary(event, state.root),
    txHash: event.tx,
  }));

  const account: UserAccount = {
    id: state.root,
    name: short(state.root),
    rootLabel: `Registrar ${short(registrar)}`,
    treasuryTotalUsd: usdc(state.usdc),
    activeHours: 0,
    maxExposureUsd: usdc(state.maxOpenExposure),
    openExposureUsd: usdc(state.openExposure),
    rootAddress: state.root,
    registrar,
    pqVk: state.pqVk,
    chainId: config?.chainId ?? 5042,
    nonce: state.nextNonce,
    factory: config?.factory,
    usdc: config?.usdc,
    explorer: config?.explorer ?? EXPLORER_URL,
    barkeep: config?.barkeep,
  };
  const rotated = events.find((event) => event.kind === "rotated");
  return {
    account,
    agents,
    tabs,
    recipients: [...recipients.values()],
    activity,
    security: securityState(rotated ? Number(rotated.timestamp) : null),
    totals: totalsFrom(account, tabs),
  };
}

function securityState(rotatedAt: number | null): SecurityState {
  const now = Date.now() / 1000;
  return {
    rootScheme: "SLH-DSA-SHA2-128s",
    rootStatus: "secured",
    lastRotationHoursAgo: rotatedAt ? hoursBetween(rotatedAt, now) : 0,
    rotationIntervalDays: 0,
    recoveryConfigured: false,
    enforcement: "onchain-policy",
  };
}

function activityKind(kind: PortfolioEvent["kind"]): ActivityKind {
  if (kind === "opened") return "capability_opened";
  if (kind === "closed") return "capability_closed";
  if (kind === "spend") return "payment";
  if (kind === "rotated") return "key_rotated";
  if (kind === "transfer") return "payment";
  return "reclaim";
}

function activitySummary(event: PortfolioEvent, root: string): string {
  const amount = event.amount ? usdc(event.amount).toFixed(6) : "";
  if (event.kind === "opened") return `Opened a tab for ${amount} USDC.`;
  if (event.kind === "closed") return `Closed a tab and released ${amount} USDC of exposure.`;
  if (event.kind === "spend" && event.to?.toLowerCase() === root.toLowerCase()) {
    return `The tab returned ${amount} USDC to the root.`;
  }
  if (event.kind === "spend") return `Agent paid ${amount} USDC to ${event.to ? short(event.to) : "a recipient"}.`;
  if (event.kind === "rotated") return "Root verifying key rotated. Older signatures no longer verify.";
  return `Root transferred ${amount} USDC.`;
}

export function totalsFrom(account: UserAccount, tabs: Tab[]): TreasuryTotals {
  const active = tabs.filter((tab) => tab.status === "active");
  const reclaimable = tabs.filter((tab) => tab.status === "expired" && tab.balanceUsd > 0);
  return {
    treasuryTotalUsd: account.treasuryTotalUsd,
    allocatedUsd: account.openExposureUsd ?? active.reduce((sum, tab) => sum + tab.capUsd, 0),
    exposureUsd: active.reduce((sum, tab) => sum + tab.balanceUsd, 0),
    availableUsd: Math.max(0, (account.maxExposureUsd ?? 0) - (account.openExposureUsd ?? 0)),
    reclaimableUsd: reclaimable.reduce((sum, tab) => sum + tab.balanceUsd, 0),
    activeTabCount: active.length,
    reclaimableTabCount: reclaimable.length,
  };
}

async function relay(path: string, body: unknown): Promise<{ hash: string }> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await readBody(response)) as { hash?: string; error?: string; detail?: string };
  if (!response.ok || !payload.hash) {
    throw new Error(readableError(payload.detail || payload.error, "the chain did not accept this action"));
  }
  const receipt = await waitForReceipt(payload.hash);
  if (receipt.status !== "success") {
    throw new Error("the transaction reverted");
  }
  return { hash: payload.hash };
}

async function waitForReceipt(hash: string): Promise<{ status: string }> {
  const receipt = await arcClient().waitForTransactionReceipt({ hash: hash as Hex, timeout: 90_000 });
  return { status: receipt.status };
}

export type PreparedAction = {
  root: string;
  action: Hex;
  nonce: string;
  deadline: string;
  digest: Hex;
  expiry?: string;
};

export async function prepareOpen(input: {
  root: string;
  agent: string;
  payees: string[];
  capRaw: bigint;
  maxPerCallRaw: bigint;
  expiry: bigint;
}): Promise<PreparedAction> {
  const state = await getJson<RootJson>(`/v1/roots/${input.root}`);
  const nonce = BigInt(state.nextNonce);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
  const action = encodeOpen(input.agent, input.payees, input.maxPerCallRaw, input.expiry, input.capRaw);
  return {
    root: input.root,
    action,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    digest: digestFor(input.root, nonce, deadline, action),
    expiry: input.expiry.toString(),
  };
}

export async function prepareClose(root: string, tab: string): Promise<PreparedAction> {
  const state = await getJson<RootJson>(`/v1/roots/${root}`);
  const nonce = BigInt(state.nextNonce);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
  const action = encodeClose(tab);
  return {
    root,
    action,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    digest: digestFor(root, nonce, deadline, action),
  };
}

export async function submitPrepared(registrar: string, prepared: PreparedAction, signature: string): Promise<{ hash: string; snapshot: AccountSnapshot }> {
  if (signatureBytes(signature) !== 7856) {
    throw new Error("The root signature must be exactly 7856 bytes. Nothing was submitted.");
  }
  const signed = signature.trim().startsWith("0x") ? signature.trim() : `0x${signature.trim()}`;
  const result = await relay("/v1/relay/execute", {
    root: prepared.root,
    action: prepared.action,
    nonce: prepared.nonce,
    deadline: prepared.deadline,
    signature: signed,
  });
  try {
    return { hash: result.hash, snapshot: await loadSnapshot(registrar) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "the portfolio could not be read";
    throw new Error(`Arc accepted ${result.hash}. ${message}`);
  }
}

export async function submitSpend(input: {
  registrar: string;
  tab: string;
  to: string;
  value: string;
  validBefore: string;
  nonce: string;
  signature: string;
}): Promise<{ hash: string; snapshot: AccountSnapshot }> {
  const result = await relay("/v1/relay/spend", {
    tab: input.tab,
    to: input.to,
    value: input.value,
    validAfter: "0",
    validBefore: input.validBefore,
    nonce: input.nonce,
    signature: input.signature,
  });
  return { hash: result.hash, snapshot: await loadSnapshot(input.registrar) };
}

const PQ_REQUIRED =
  "This action needs a signature from the root PQ key. The server cannot sign it, and this screen will not mark it successful.";

export const productionProvider = {
  loadAccount: loadSnapshot,
  async createCapability(_input?: unknown): Promise<never> {
    throw new Error(PQ_REQUIRED);
  },
  async closeCapability(): Promise<never> {
    throw new Error(PQ_REQUIRED);
  },
  async rotateAgentKey(): Promise<never> {
    throw new Error(PQ_REQUIRED);
  },
  async reclaimCapability(root: string, tab: string): Promise<void> {
    await relay("/v1/relay/reclaim", { root, tab });
  },
};
