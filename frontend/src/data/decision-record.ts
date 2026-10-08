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
  at: string;
};

export type SettlementProof = {
  txHash: string;
  receipt: DecisionReceipt;
  result: string;
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
    at,
  };
}

/** A settled record keeps ALLOW only when the receipt and transaction are present. */
export function settledDecision(facts: DecisionFacts, proof: SettlementProof, at: string): DecisionRecord {
  if (facts.decision !== "ALLOW") throw new Error("A refusal cannot be stored as a settled payment.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(proof.txHash)) throw new Error("A settled payment needs a transaction hash.");
  if (!proof.receipt?.status || !proof.receipt.blockNumber) throw new Error("A settled payment needs a receipt.");
  const result = proof.result.trim();
  return {
    ...facts,
    decision: "ALLOW",
    reason: result ? [...facts.reason] : [...facts.reason, "result_unusable"],
    agentId: null,
    txHash: proof.txHash,
    receipt: { status: proof.receipt.status, blockNumber: proof.receipt.blockNumber },
    result,
    at,
  };
}

export function decisionsForRegistrar(records: readonly DecisionRecord[], registrar: string): DecisionRecord[] {
  const wanted = registrar.toLowerCase();
  return records.filter((record) => record.registrar.toLowerCase() === wanted);
}
