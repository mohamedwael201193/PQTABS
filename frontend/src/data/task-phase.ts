export const TASK_PHASES = [
  "READY",
  "FETCHING_QUOTE",
  "POLICY_REFUSED",
  "AUTHORIZING",
  "VERIFYING_PAYMENT",
  "SETTLEMENT_PENDING",
  "SETTLED",
  "FAILED_NO_SETTLEMENT",
] as const;

export type TaskPhase = (typeof TASK_PHASES)[number];

export const TASK_STEPS = ["Quote", "Policy", "Authorization", "Settlement", "Result"] as const;

/** The first paid task does not consult prior settlements. Replay is a separate check. */
export function stepIndex(phase: TaskPhase): number {
  switch (phase) {
    case "READY":
    case "FETCHING_QUOTE":
      return 0;
    case "POLICY_REFUSED":
      return 1;
    case "AUTHORIZING":
      return 2;
    case "VERIFYING_PAYMENT":
    case "SETTLEMENT_PENDING":
    case "FAILED_NO_SETTLEMENT":
      return 3;
    case "SETTLED":
      return 4;
  }
}

export function closedCapabilityMessage(): string {
  return "This capability is closed. Nothing was signed. Nothing was broadcast.";
}

export function replayCheckMessage(): string {
  return "Replay check: no settled payment is on this capability. Nothing was signed.";
}

export function explorerTxUrl(explorer: string, hash: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return `${explorer.replace(/\/$/, "")}/tx/${hash}`;
}

export function facilitatorCode(message: string): string {
  const match = /\(([^)]+)\)/.exec(message);
  const code = match?.[1]?.trim();
  return code || message.trim() || "invalid signature";
}

export function signedRejectionMessage(reason: string): string {
  if (/rate_limited/i.test(reason)) {
    return "Arc is busy. A local signature was created. No transaction was sent. Run the task again.";
  }
  const detail = facilitatorCode(reason);
  return `Signature rejected before broadcast (${detail}). A local signature was created. No transaction was sent.`;
}

export function signedRejectionToast(reason: string, signedLocally: boolean): string {
  if (!signedLocally) return "Payment blocked.";
  if (/rate_limited/i.test(reason)) return "Arc is busy. Nothing was sent.";
  return "Signature rejected before broadcast.";
}
