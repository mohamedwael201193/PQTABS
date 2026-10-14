import type { AccountSnapshot } from "./types";

export type DepositPhase = "idle" | "pending" | "confirmed" | "failed";

export type ChainCash = {
  root: string;
  raw: string;
  readId: number;
};

/** A read that started earlier must not replace a balance already taken from a later read. */
export function shouldApplyBalanceRead(appliedReadId: number, readId: number): boolean {
  return readId >= appliedReadId;
}

export function depositPhaseLabel(phase: DepositPhase): string | null {
  if (phase === "pending") return "Pending";
  if (phase === "confirmed") return "Confirmed";
  if (phase === "failed") return "Failed";
  return null;
}

/**
 * Confirmed root cash comes from a balance read after the receipt.
 * Pending and failed keep the last figure. Another account shows nothing from this deposit.
 */
export function rootCashAfterDeposit(input: {
  phase: DepositPhase;
  sameAccount: boolean;
  previousRaw: bigint | null;
  chainRaw: bigint | null;
}): bigint | null {
  if (!input.sameAccount) return null;
  if (input.phase === "confirmed" && input.chainRaw != null) return input.chainRaw;
  return input.previousRaw;
}

/** The chain read wins. The indexed figure is only a stand-in when that read did not return. */
export function reconciledRootCash(chainRaw: bigint | null, indexedRaw: bigint): bigint {
  return chainRaw ?? indexedRaw;
}

export function overlayChainCash(snapshot: AccountSnapshot, chain: ChainCash | null): AccountSnapshot {
  const root = snapshot.account.rootAddress;
  if (!chain || !root || root.toLowerCase() !== chain.root.toLowerCase()) return snapshot;
  return {
    ...snapshot,
    account: {
      ...snapshot.account,
      treasuryTotalUsd: Number(chain.raw) / 1_000_000,
      treasuryKnown: true,
    },
  };
}
