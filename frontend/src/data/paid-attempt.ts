export type PaidAttempt = {
  tab: string;
  task: string;
  price: string;
  payee: string;
  nonce: string;
  validBefore: string;
  signature: string;
  txHash: string;
  settled: boolean;
};

export type PaidAction = "reuse" | "sign" | "confirm";

export class ChargeConfirm extends Error {
  constructor() {
    super("This question already has an Arc receipt.");
    this.name = "ChargeConfirm";
  }
}

/** A retry of the same question resubmits the authorization. A second charge waits for a second click. */
export function reconcileAttempt(
  attempt: PaidAttempt | null,
  request: { tab: string; task: string; price: string; payee: string },
  chargeAgain: boolean,
  nowSeconds: number,
): PaidAction {
  if (!attempt?.signature) return "sign";
  if (attempt.tab.toLowerCase() !== request.tab.toLowerCase()) return "sign";
  if (attempt.task !== request.task || attempt.price !== request.price) return "sign";
  if (attempt.payee.toLowerCase() !== request.payee.toLowerCase()) return "sign";
  if (attempt.settled) return chargeAgain ? "sign" : "confirm";
  if (attempt.txHash) return "reuse";
  const expiry = Number(attempt.validBefore);
  if (!Number.isFinite(expiry) || expiry <= nowSeconds) return "sign";
  return "reuse";
}

const KEY = "pqtabs.paidAttempt.";

export function readAttempt(storage: Pick<Storage, "getItem">, tab: string): PaidAttempt | null {
  const raw = storage.getItem(KEY + tab.toLowerCase());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PaidAttempt;
    if (!parsed || parsed.tab?.toLowerCase() !== tab.toLowerCase() || !parsed.signature) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAttempt(storage: Pick<Storage, "setItem">, attempt: PaidAttempt): void {
  storage.setItem(KEY + attempt.tab.toLowerCase(), JSON.stringify(attempt));
}
