export type QuotedDecision = "ALLOW" | "REFUSE" | "NO_PAYMENT";
export type StoredDecision = QuotedDecision | "NOT_SETTLED";

export type DecisionReceipt = {
  status: string;
  blockNumber: string;
};

export type DecisionFacts = {
  task: string;
  service: string;
  resource: string;
  price: string;
  asset: string;
  network: string;
  payee: string;
  agent: string;
  capability: string;
  remaining_capability_balance: string;
  maxPerCall: string;
  root_exposure: string;
  maxOpenExposure: string;
  expiry: string;
  decision: QuotedDecision;
  reason: string[];
  registrar: string;
};

export type DecisionRecord = Omit<DecisionFacts, "decision"> & {
  decision: StoredDecision;
  agentId: null;
  txHash: string;
  receipt: DecisionReceipt | null;
  result: string;
  /** ArcRouter's metered charge in raw USDC. Empty when the header was absent. Not a chain balance. */
  charge: string;
  at: string;
};

export type SettlementProof = {
  txHash: string;
  receipt: DecisionReceipt;
  result: string;
  charge?: string;
};

/** An allow without a receipt is not stored as a payment. */
export function decisionRecord(facts: DecisionFacts, at: string): DecisionRecord {
  const allowed = facts.decision === "ALLOW";
  return {
    ...facts,
    decision: allowed ? "NOT_SETTLED" : facts.decision,
    reason: allowed ? [...facts.reason, "receipt_missing"] : [...facts.reason],
    agentId: null,
    txHash: "",
    receipt: null,
    result: "",
    charge: "",
    at,
  };
}

/** A settled record keeps ALLOW only when the receipt and transaction are present. */
export function settledDecision(facts: DecisionFacts, proof: SettlementProof, at: string): DecisionRecord {
  if (facts.decision !== "ALLOW") throw new Error("A refusal cannot be stored as a settled payment.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(proof.txHash)) throw new Error("A settled payment needs a transaction hash.");
  if (!proof.receipt?.status || !proof.receipt.blockNumber) throw new Error("A settled payment needs a receipt.");
  const result = proof.result.trim();
  const rawCharge = (proof.charge ?? "").trim();
  const charge = /^[0-9]+$/.test(rawCharge) ? rawCharge : "";
  const reason = result ? [...facts.reason] : [...facts.reason, "result_unusable"];
  if (charge && /^[0-9]+$/.test(facts.price) && BigInt(charge) > BigInt(facts.price)) reason.push("charge_above_payment");
  return {
    ...facts,
    decision: "ALLOW",
    reason,
    agentId: null,
    txHash: proof.txHash,
    receipt: { status: proof.receipt.status, blockNumber: proof.receipt.blockNumber },
    result,
    charge,
    at,
  };
}

export function decisionsForRegistrar(records: readonly DecisionRecord[], registrar: string): DecisionRecord[] {
  const wanted = registrar.toLowerCase();
  return records.filter((record) => record.registrar.toLowerCase() === wanted);
}

const REASON_SENTENCE: Record<string, string> = {
  capability_inactive: "The capability is not active.",
  expired: "The capability has expired.",
  wrong_agent: "This device key is not the agent on this capability.",
  wrong_payee: "The service recipient is not allowed.",
  bad_amount: "The service price is not a payment.",
  max_per_call: "Service price exceeds the capability's per-payment limit.",
  balance: "The service price exceeds the remaining capability balance.",
  exposure: "The root exposure ceiling is already full.",
  service_unavailable: "The service was unavailable.",
  receipt_missing: "No Arc receipt was recorded.",
  result_unusable: "The service result was not usable.",
  charge_above_payment: "The service charge was above the signed payment.",
  capability_active: "The capability is active.",
  payee_allowlisted: "The recipient is allowlisted.",
  within_max_per_call: "The price is within the per-payment limit.",
  within_balance: "The price is within the remaining balance.",
  within_root_exposure: "The price is within the root exposure ceiling.",
  not_expired: "The capability has not expired.",
  agent_matches: "The agent matches the capability.",
  no_arc_exact: "The service did not ask for an Arc exact payment.",
};

export function paymentReasonSentence(reason: string): string {
  return REASON_SENTENCE[reason] ?? reason;
}
