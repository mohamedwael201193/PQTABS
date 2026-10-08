import { digestFor, encodeClose, encodeOpen, signatureBytes } from "./actions";
import { rootSignatureBlock } from "./root-sign-check";
import { usd } from "./formatters";
import { paymentSignatureHeader, quotedCharge, receiptSettlesSpend, serviceAnswer, settlementFailure, transactionFromPaymentResponse, type SpendAuthorization } from "./x402-pay";
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
  usdc?: string;
  balancesConfirmed?: boolean;
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
  balanceKnown?: boolean;
  limitKnown?: boolean;
};

type PortfolioJson = {
  tabs: PortfolioTab[];
  activity: PortfolioEvent[];
  asOf?: string;
  freshness?: "live" | "recent" | "indexing" | "degraded";
  indexedThrough?: string;
  head?: string;
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
  permissionless?: boolean;
  swept?: boolean;
};

function readableError(detail: string | undefined, fallback: string): string {
  if (!detail) return fallback;
  if (detail.includes("rate limit") || detail.includes("429")) {
    return "Network reads are busy. Your last confirmed state is still safe.";
  }
  if (detail.includes("temporarily unavailable")) return "Arc is temporarily unavailable. Your funds are safe. Try again.";
  if (/NotExpired/i.test(detail)) return "Arc has not reached this capability's expiry yet. Nothing was submitted.";
  if (/AlreadyClosed/i.test(detail)) return "This capability is already closed.";
  if (/ExposureExceeded/i.test(detail)) return "This amount would pass the exposure ceiling. Nothing was submitted.";
  if (/ExpiryNotFuture/i.test(detail)) return "The expiry must be in the future. Nothing was submitted.";
  if (/SweepNotNeeded/i.test(detail)) return "There is no USDC left to return.";
  if (/invalid signature/i.test(detail) || /InvalidSignature/i.test(detail)) {
    return "Arc rejected the signature. Nothing was submitted.";
  }
  const cleaned = detail.replace(/0x[a-fA-F0-9]{8,}/g, "").replace(/\s+/g, " ").trim();
  const text = cleaned || fallback;
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
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
  const response = await fetch(`${BACKEND_URL}${path}`);
  const body = (await readBody(response)) as T & { error?: string; detail?: string };
  if (response.ok) return body;
  throw new Error(readableError(body.detail || body.error, `read failed (${response.status})`));
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
  gate?: { cancelled: boolean; onIndex?: (note: string) => void },
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
  const portfolio = await waitForPortfolio(root, gate);
  return mapSnapshot(registrar, state, portfolio.tabs, portfolio.activity, config, portfolio.asOf, portfolio);
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
    waitForPortfolio(root),
  ]);
  return mapSnapshot(registrar, state, portfolio.tabs, portfolio.activity, config, portfolio.asOf, portfolio);
}

const ROOT_KEY = "pqtabs.root";

async function waitForPortfolio(root: string, gate?: { cancelled: boolean; onIndex?: (note: string) => void }): Promise<PortfolioJson> {
  for (;;) {
    const portfolio = await getJson<PortfolioJson>(`/v1/roots/${root}/portfolio`);
    if (portfolio.freshness !== "indexing" || portfolio.tabs.length > 0 || gate?.cancelled) return portfolio;
    gate?.onIndex?.(`Updating through Arc block ${portfolio.indexedThrough ?? "0"}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

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
  asOf?: string,
  portfolio?: PortfolioJson,
): AccountSnapshot {
  const chainNow = asOf ? Number(asOf) : Number.NaN;
  const timed = Number.isFinite(chainNow) && chainNow > 0;
  if (!timed && rows.length > 0) throw new Error("Could not read Arc's clock.");
  const now = timed ? chainNow : 0;
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
    const balanceKnown = row.balanceKnown !== false;
    const limitKnown = row.limitKnown !== false;
    return {
      id: row.tab,
      reference: short(row.tab),
      agentId: row.agent,
      status,
      capUsd: usdc(row.cap),
      balanceUsd: balanceKnown ? usdc(row.usdc) : 0,
      balanceKnown,
      limitKnown,
      balanceRaw: balanceKnown ? row.usdc : undefined,
      maxPerCallRaw: limitKnown ? row.maxPerCall : undefined,
      policy: {
        maxPerCallUsd: limitKnown ? usdc(row.maxPerCall) : 0,
        allowedRecipients: row.payees,
        expiresInHours: status === "active" ? (expiry - now) / 3600 : 0,
      },
      openedHoursAgo: hoursBetween(Number(row.openedAt), now),
      expiredHoursAgo: status === "expired" ? hoursBetween(expiry, now) : 0,
      txHash: row.openedTx,
      expiryUnix: expiry,
      needsSweep: row.needsSweep,
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
      status: active ? "active" : "paused",
      role: "Spends only inside a capability.",
      addedHoursAgo: Math.min(...related.map((item) => item.openedHoursAgo)),
      lastActiveHoursAgo: related[0]?.openedHoursAgo ?? null,
    });
  }

  const activity: ActivityRecord[] = events.map((event) => ({
    id: `${event.kind}:${event.tx}:${event.tab ?? ""}`,
    kind: activityKind(event),
    status: "completed" as ActivityStatus,
    hoursAgo: hoursBetween(Number(event.timestamp), now),
    agentId:
      event.agent ??
      tabs.find((tab) => tab.id.toLowerCase() === event.tab?.toLowerCase())?.agentId,
    tabId: event.tab,
    recipientId: event.to,
    amountUsd: event.kind === "closed" || !event.amount ? undefined : usdc(event.amount),
    limitUsd: event.kind === "closed" && event.amount ? usdc(event.amount) : undefined,
    summary: activitySummary(event, state.root),
    txHash: event.tx,
  }));

  const treasuryKnown = Boolean(state.usdc);
  const account: UserAccount = {
    id: state.root,
    name: short(state.root),
    rootLabel: `Registrar ${short(registrar)}`,
    treasuryTotalUsd: treasuryKnown ? usdc(state.usdc) : 0,
    treasuryKnown,
    activeHours: 0,
    maxExposureUsd: state.maxOpenExposure ? usdc(state.maxOpenExposure) : undefined,
    openExposureUsd: state.openExposure ? usdc(state.openExposure) : undefined,
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
    security: securityState(rotated ? Number(rotated.timestamp) : null, now),
    totals: totalsFrom(account, tabs),
    indexFreshness: portfolio?.freshness,
    indexedThrough: portfolio?.indexedThrough,
  };
}

function securityState(rotatedAt: number | null, now = Date.now() / 1000): SecurityState {
  return {
    rootScheme: "SLH-DSA-SHA2-128s",
    rootStatus: "secured",
    lastRotationHoursAgo: rotatedAt ? hoursBetween(rotatedAt, now) : null,
    rotationIntervalDays: 0,
    recoveryConfigured: false,
    enforcement: "onchain-policy",
  };
}

function activityKind(event: PortfolioEvent): ActivityKind {
  if (event.kind === "opened") return "capability_opened";
  if (event.kind === "closed") return event.permissionless ? "reclaim" : "capability_closed";
  if (event.kind === "spend") return "payment";
  if (event.kind === "rotated") return "key_rotated";
  if (event.kind === "transfer") return "payment";
  return "reclaim";
}

function activitySummary(event: PortfolioEvent, root: string): string {
  const amount = event.amount ? usdc(event.amount).toFixed(6) : "";
  if (event.kind === "opened") return `Opened a capability for ${amount} USDC.`;
  if (event.kind === "closed" && event.permissionless && event.swept === false) {
    return "Reclaimed the capability after expiry. USDC is still on it until a return succeeds.";
  }
  if (event.kind === "closed" && event.permissionless) {
    return `Reclaimed the capability after expiry and released its ${amount} USDC limit.`;
  }
  if (event.kind === "closed") return `Closed a capability and released its ${amount} USDC limit.`;
  if (event.kind === "spend" && event.to?.toLowerCase() === root.toLowerCase()) {
    return `The capability returned ${amount} USDC to the treasury.`;
  }
  if (event.kind === "spend") return `Agent paid ${amount} USDC to ${event.to ? short(event.to) : "a recipient"}.`;
  if (event.kind === "rotated") return "Root verifying key rotated. Older signatures no longer verify.";
  return `Root transferred ${amount} USDC.`;
}

export function describeReturn(
  path: "reclaim" | "sweep",
  row: Pick<Tab, "status" | "balanceUsd" | "needsSweep"> | undefined,
  priorBalanceUsd: number,
): { settled: boolean; leftover: boolean; message: string } {
  if (path === "sweep") {
    if (!row || row.needsSweep || row.balanceUsd > 0) {
      return { settled: false, leftover: true, message: "The receipt succeeded, but the capability still holds USDC." };
    }
    return {
      settled: true,
      leftover: false,
      message: priorBalanceUsd > 0 ? `${usd(priorBalanceUsd)} returned to the treasury` : "The capability no longer holds USDC.",
    };
  }
  if (!row || row.status !== "closed") {
    return { settled: false, leftover: false, message: "Arc did not show this capability as closed." };
  }
  if (row.needsSweep || row.balanceUsd > 0) {
    return { settled: true, leftover: true, message: "The capability is closed. USDC is still on it until Return funds succeeds." };
  }
  return {
    settled: true,
    leftover: false,
    message: priorBalanceUsd > 0 ? `${usd(priorBalanceUsd)} returned to the treasury` : "The exposure limit was released.",
  };
}

export function totalsFrom(account: UserAccount, tabs: Tab[]): TreasuryTotals {
  const active = tabs.filter((tab) => tab.status === "active");
  const reclaimable = tabs.filter(
    (tab) => tab.status === "expired" || (Boolean(tab.needsSweep) && tab.balanceUsd > 0),
  );
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

export async function arcClock(): Promise<number> {
  const now = await chainNow();
  const seconds = Number(now);
  if (!Number.isSafeInteger(seconds)) throw new Error("Could not read Arc's clock. Nothing was signed.");
  return seconds;
}

async function chainNow(): Promise<bigint> {
  const body = await getJson<{ asOf?: string }>("/v1/time");
  const asOf = body.asOf ? BigInt(body.asOf) : BigInt(0);
  if (asOf <= BigInt(0)) throw new Error("Could not read Arc's clock. Nothing was signed.");
  return asOf;
}

export async function prepareOpen(input: {
  root: string;
  agent: string;
  payees: string[];
  capRaw: bigint;
  maxPerCallRaw: bigint;
  hours: number;
}): Promise<PreparedAction> {
  const [state, now] = await Promise.all([getJson<RootJson>(`/v1/roots/${input.root}`), chainNow()]);
  const nonce = BigInt(state.nextNonce);
  const deadline = now + BigInt(3600);
  const expiry = now + BigInt(input.hours) * BigInt(3600);
  const action = encodeOpen(input.agent, input.payees, input.maxPerCallRaw, expiry, input.capRaw);
  return {
    root: input.root,
    action,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    digest: digestFor(input.root, nonce, deadline, action),
    expiry: expiry.toString(),
  };
}

/** Read the root again. A stale nonce, key, clock, or expiry is not signed. */
export async function confirmRootSignature(prepared: PreparedAction, unlockedVk: string | null): Promise<void> {
  const [state, now] = await Promise.all([getJson<RootJson>(`/v1/roots/${prepared.root}`), chainNow()]);
  const blocked = rootSignatureBlock({
    unlockedVk,
    chainVk: state.pqVk,
    chainNonce: state.nextNonce,
    preparedNonce: prepared.nonce,
    now,
    expiry: prepared.expiry,
  });
  if (blocked) throw new Error(blocked);
}

export async function prepareClose(root: string, tab: string): Promise<PreparedAction> {
  const [state, now] = await Promise.all([getJson<RootJson>(`/v1/roots/${root}`), chainNow()]);
  const nonce = BigInt(state.nextNonce);
  const deadline = now + BigInt(3600);
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
  paymentRequired: unknown;
}): Promise<{ hash: string; snapshot: AccountSnapshot }> {
  const result = await relay("/v1/relay/spend", {
    tab: input.tab,
    to: input.to,
    value: input.value,
    validAfter: "0",
    validBefore: input.validBefore,
    nonce: input.nonce,
    signature: input.signature,
    paymentRequired: input.paymentRequired,
  });
  return { hash: result.hash, snapshot: await loadSnapshot(input.registrar) };
}

export const SERVICE_URL = "https://arcrouter.co/v1/chat/completions";

function serviceBody(task: string) {
  return {
    model: "llama-3.3-70b-instruct",
    messages: [{ role: "user", content: task }],
    max_tokens: 64,
  };
}

export async function requestServicePrice(task: string): Promise<unknown> {
  const response = await fetch(SERVICE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(serviceBody(task)),
  });
  const payload = await response.json().catch(() => null);
  if (response.status !== 402 || !payload) {
    throw new Error("The service did not return a price. Nothing was signed.");
  }
  return payload;
}

/** Retry the priced request. The service's facilitator broadcasts. This client does not. */
export async function settleService(
  task: string,
  paymentRequired: unknown,
  authorization: SpendAuthorization,
  signature: string,
): Promise<{ transaction: string; result: string; receipt: { status: string; blockNumber: string }; charge: string }> {
  const header = paymentSignatureHeader(paymentRequired, authorization, signature);
  const response = await fetch(SERVICE_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "PAYMENT-SIGNATURE": header,
    },
    body: JSON.stringify(serviceBody(task)),
  });
  const transaction = transactionFromPaymentResponse(response.headers.get("PAYMENT-RESPONSE"));
  if (!transaction) {
    const failure = await response.json().catch(() => null);
    throw new Error(settlementFailure(failure));
  }
  const receipt = await arcClient().waitForTransactionReceipt({ hash: transaction as Hex, timeout: 90_000 });
  if (!receiptSettlesSpend(receipt, { from: authorization.from, to: authorization.to, value: authorization.value })) {
    throw new Error("Arc did not include this payment. No receipt was recorded.");
  }
  const payload = await response.json().catch(() => null);
  return {
    transaction,
    result: serviceAnswer(response.status, payload),
    receipt: { status: receipt.status, blockNumber: receipt.blockNumber.toString() },
    charge: quotedCharge(response.headers.get("X-ArcRouter-Charge-USDC")),
  };
}

export type ServiceDecision = {
  decision: string;
  reason: string[];
  price: string;
  payee: string;
  resource: string;
  asset: string;
  network: string;
  agent: string;
  capability: string;
  remaining_capability_balance: string;
  maxPerCall: string;
  root_exposure: string;
  maxOpenExposure: string;
  expiry: string;
};

export async function decideServicePrice(tab: string, paymentRequired: unknown): Promise<ServiceDecision> {
  const response = await fetch(`${BACKEND_URL}/v1/x402/decide`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tab, paymentRequired }),
  });
  const payload = (await response.json().catch(() => null)) as (Partial<ServiceDecision> & {
    error?: string;
    detail?: string;
  }) | null;
  if (!response.ok || !payload?.decision || !payload.price || !payload.payee) {
    throw new Error(readableError(payload?.detail || payload?.error, "The price could not be checked. Nothing was signed."));
  }
  return {
    decision: payload.decision,
    reason: payload.reason ?? [],
    price: payload.price,
    payee: payload.payee,
    resource: payload.resource ?? "",
    asset: payload.asset ?? "",
    network: payload.network ?? "",
    agent: payload.agent ?? "",
    capability: payload.capability ?? tab,
    remaining_capability_balance: payload.remaining_capability_balance ?? "",
    maxPerCall: payload.maxPerCall ?? "",
    root_exposure: payload.root_exposure ?? "",
    maxOpenExposure: payload.maxOpenExposure ?? "",
    expiry: payload.expiry ?? "",
  };
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
  async retrySweep(root: string, tab: string): Promise<void> {
    await relay("/v1/relay/retry-sweep", { root, tab });
  },
};
