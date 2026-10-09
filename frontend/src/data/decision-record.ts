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
  facilitator_rejected: "The facilitator rejected the signature. No Arc transaction was recorded.",
  result_unusable: "The service result was not usable.",
  charge_above_payment: "The service charge was above the signed payment.",
  capability_active: "The capability is active.",
  payee_allowlisted: "The recipient is allowlisted.",
  within_max_per_call: "The price is within the per-payment limit.",
  within_balance: "The price is within the remaining balance.",
  within_root_exposure: "The price is within the root exposure ceiling.",
  not_expired: "The capability has not expired.",
  not_yet_expired: "This capability has not expired.",
  agent_matches: "The agent matches the capability.",
  no_arc_exact: "The service did not ask for an Arc exact payment.",
  bad_signature_length: "The signature is not a capability authorization.",
  replay: "This payment authorization was already used.",
};

export function paymentReasonSentence(reason: string): string {
  return REASON_SENTENCE[reason] ?? reason;
}

/** A unix expiry from the chain, shown in UTC. Anything else stays as stored. */
export function expiryWhen(value: string): string {
  if (!/^[0-9]+$/.test(value)) return value || "—";
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return value;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(".000Z", " UTC").replace("T", " ");
}

/** The stored balance is the one read before payment. A settled receipt means that price left the capability. */
export function capabilityRemaining(record: {
  decision: string;
  txHash: string;
  remaining_capability_balance: string;
  price: string;
}): string {
  const remaining = record.remaining_capability_balance;
  if (record.decision !== "ALLOW" || !/^0x[0-9a-fA-F]{64}$/.test(record.txHash)) return remaining;
  if (!/^[0-9]+$/.test(remaining) || !/^[0-9]+$/.test(record.price)) return remaining;
  const left = BigInt(remaining);
  const price = BigInt(record.price);
  if (price > left) return remaining;
  return (left - price).toString();
}

const BLOCKING_REASONS = new Set([
  "receipt_missing",
  "facilitator_rejected",
  "result_unusable",
  "charge_above_payment",
  "capability_inactive",
  "expired",
  "not_yet_expired",
  "wrong_agent",
  "wrong_payee",
  "bad_amount",
  "max_per_call",
  "balance",
  "exposure",
  "service_unavailable",
  "no_arc_exact",
  "bad_signature_length",
  "replay",
]);

/** Blocking reasons lead. A passed policy check stays after the reason the payment stopped. */
export function orderedReasons(reasons: readonly string[]): string[] {
  const blocking: string[] = [];
  const passed: string[] = [];
  for (const reason of reasons) {
    if (BLOCKING_REASONS.has(reason)) blocking.push(reason);
    else passed.push(reason);
  }
  return [...blocking, ...passed];
}

/** A facilitator rejection is recorded from the service's settle failure, not from a guessed hash. */
export function settlementReasons(reasons: readonly string[], message: string): string[] {
  if (message.startsWith("The service did not settle the payment")) return [...reasons, "facilitator_rejected"];
  return [...reasons];
}

/** A refusal was never signed, except the wrong-agent check, which signs a different key and does not broadcast it. An allow with no receipt was signed and then not broadcast. */
export function paymentStatusLines(decision: string, txHash: string, reasons: readonly string[] = []): string[] {
  if (decision === "REFUSE" || decision === "NO_PAYMENT") {
    if (reasons.includes("wrong_agent")) {
      return ["Payment blocked", "The capability agent did not sign.", "Nothing was broadcast."];
    }
    return ["Payment blocked", "Nothing was signed.", "Nothing was broadcast."];
  }
  if (decision === "NOT_SETTLED" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return ["Payment blocked", "No Arc receipt was recorded.", "Nothing was broadcast."];
  }
  return [];
}
