import assert from "node:assert/strict";
import test from "node:test";
import { overlayChainCash, reconciledRootCash, rootCashAfterDeposit, shouldApplyBalanceRead } from "./deposit-state.ts";
import type { AccountSnapshot } from "./types.ts";

function snapshot(rawUsd: number): AccountSnapshot {
  return {
    account: {
      id: "0x11e59501646E90E0FA2A7189431A96429D966fe7",
      name: "root",
      rootLabel: "Registrar",
      treasuryTotalUsd: rawUsd,
      treasuryKnown: true,
      activeHours: 0,
      rootAddress: "0x11e59501646E90E0FA2A7189431A96429D966fe7",
      registrar: "0xd4654500128dCbe45dd9E1F871Bf3CCEcd9615D1",
    },
    agents: [],
    tabs: [],
    recipients: [],
    activity: [],
    security: {
      rootScheme: "SLH-DSA-SHA2-128s",
      rootStatus: "secured",
      lastRotationHoursAgo: null,
      rotationIntervalDays: 0,
      recoveryConfigured: false,
      enforcement: "onchain-policy",
    },
    totals: {
      treasuryTotalUsd: rawUsd,
      allocatedUsd: 0,
      exposureUsd: 0,
      availableUsd: 0,
      reclaimableUsd: 0,
      activeTabCount: 0,
      reclaimableTabCount: 0,
    },
  };
}

test("a confirmed deposit shows the chain balance and a pending or failed one does not invent one", () => {
  assert.equal(rootCashAfterDeposit({ phase: "pending", sameAccount: true, previousRaw: 0n, chainRaw: 80_000n }), 0n);
  assert.equal(rootCashAfterDeposit({ phase: "failed", sameAccount: true, previousRaw: 0n, chainRaw: 80_000n }), 0n);
  assert.equal(rootCashAfterDeposit({ phase: "confirmed", sameAccount: true, previousRaw: 0n, chainRaw: 80_000n }), 80_000n);
  assert.equal(rootCashAfterDeposit({ phase: "confirmed", sameAccount: true, previousRaw: 0n, chainRaw: null }), 0n);
  assert.equal(rootCashAfterDeposit({ phase: "confirmed", sameAccount: false, previousRaw: 80_000n, chainRaw: 80_000n }), null);
});

test("a stale indexed balance does not replace the chain read, and a later read replaces an earlier one", () => {
  assert.equal(reconciledRootCash(80_000n, 0n), 80_000n);
  assert.equal(reconciledRootCash(80_000n, 80_000n), 80_000n);
  assert.equal(reconciledRootCash(null, 0n), 0n);
  assert.equal(shouldApplyBalanceRead(2, 1), false);
  assert.equal(shouldApplyBalanceRead(2, 2), true);
  const shown = overlayChainCash(snapshot(0), {
    root: "0x11e59501646E90E0FA2A7189431A96429D966fe7",
    raw: "80000",
    readId: 2,
  });
  assert.equal(shown.account.treasuryTotalUsd, 0.08);
  const other = overlayChainCash(snapshot(0), {
    root: "0x0000000000000000000000000000000000000002",
    raw: "80000",
    readId: 3,
  });
  assert.equal(other.account.treasuryTotalUsd, 0);
});
