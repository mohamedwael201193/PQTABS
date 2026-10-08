export type Decision = {
  decision: "ALLOW" | "REFUSE" | "NO_PAYMENT";
  reason: string[];
};

export type SpendFacts = {
  now: bigint;
  amount: bigint;
  payee: string;
  /** Null when this process has not recovered the signer. The tab contract still checks it. */
  signer: string | null;
  tabAgent: string;
  payees: readonly string[];
  maxPerCall: bigint;
  balance: bigint;
  expiry: bigint;
  open: boolean;
  openExposure: bigint;
  maxOpenExposure: bigint;
  serviceAvailable: boolean;
};

export type OpenFacts = {
  cap: bigint;
  openExposure: bigint;
  maxOpenExposure: bigint;
};

function same(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** A payment is allowed only when every listed fact passes. No timer and no random choice. */
export function decideSpend(facts: SpendFacts): Decision {
  if (!facts.serviceAvailable) return { decision: "NO_PAYMENT", reason: ["service_unavailable"] };
  const reason: string[] = [];
  if (!facts.open) reason.push("capability_inactive");
  if (facts.now >= facts.expiry) reason.push("expired");
  if (facts.signer != null && !same(facts.signer, facts.tabAgent)) reason.push("wrong_agent");
  if (!facts.payees.some((payee) => same(payee, facts.payee))) reason.push("wrong_payee");
  if (facts.amount <= 0n) reason.push("bad_amount");
  if (facts.amount > facts.maxPerCall) reason.push("max_per_call");
  if (facts.amount > facts.balance) reason.push("balance");
  if (facts.openExposure > facts.maxOpenExposure) reason.push("exposure");
  if (reason.length > 0) return { decision: "REFUSE", reason };
  const allow = ["capability_active", "payee_allowlisted", "within_max_per_call", "within_balance", "within_root_exposure", "not_expired"];
  if (facts.signer != null) allow.push("agent_matches");
  return { decision: "ALLOW", reason: allow };
}

/** Opening a capability refuses when the new cap would pass the root ceiling. */
export function decideOpen(facts: OpenFacts): Decision {
  if (facts.cap <= 0n) return { decision: "REFUSE", reason: ["bad_amount"] };
  if (facts.openExposure + facts.cap > facts.maxOpenExposure) return { decision: "REFUSE", reason: ["exposure"] };
  return { decision: "ALLOW", reason: ["within_exposure"] };
}
