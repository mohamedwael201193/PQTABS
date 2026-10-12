import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex, PublicClient } from "viem";
import { applyEvents, type IndexEvent } from "../src/index/apply.js";
import { noteIndexCursor, noteIndexHead } from "../src/index/lane.js";
import { capabilityFigures, paymentTotals, readIndexedPortfolio } from "../src/index/portfolio.js";
import { openMemory } from "../src/index/sql.js";

const root = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf" as Address;
const tab = "0x56377522376b5273a97313992c7970B106cB3837" as Address;
const agent = "0x54113A5C0195821c42CB831d280A73670951166D" as Address;
const payee = "0xC485B657C140C9677846f3E9ca6a3158e5623044" as Address;
const tx = "0x313b912a0f8eccc4d3f082f344520076541fced85060a7e26f49f09c21e3accd" as Hex;

function opened(cap: string): IndexEvent {
  return {
    block: 100n,
    logIndex: 1,
    tx,
    timestamp: "1790000000",
    root,
    kind: "opened",
    tab,
    agent,
    amount: cap,
    expiry: "1790100000",
  };
}

function spend(block: bigint, logIndex: number, to: Address, amount: string): IndexEvent {
  return { block, logIndex, tx, timestamp: "1790000050", root, kind: "spend", tab, payee: to, amount };
}

/** A stand-in for Arc's multicall that answers balanceOf per tab. A null balance is a failed read. */
function fakeArc(balances: Record<string, bigint | null>): PublicClient {
  return {
    multicall: async ({ contracts }: { contracts: readonly { args: readonly [Address] }[] }) =>
      contracts.map((contract) => {
        const balance = balances[contract.args[0].toLowerCase()];
        return balance == null ? { status: "failure", error: new Error("execution reverted") } : { status: "success", result: balance };
      }),
  } as unknown as PublicClient;
}

describe("capability figures", () => {
  it("an open capability spends its cap minus the chain balance", () => {
    const figures = capabilityFigures({ cap: 10_000n, open: true, swept: false, liveBalance: 6_400n, payments: 3_600n });
    assert.deepEqual(figures, { balanceKnown: true, balance: 6_400n, spentKnown: true, spent: 3_600n });
  });

  it("an open capability with a balance of zero shows the whole cap spent", () => {
    const figures = capabilityFigures({ cap: 360n, open: true, swept: false, liveBalance: 0n, payments: 360n });
    assert.deepEqual(figures, { balanceKnown: true, balance: 0n, spentKnown: true, spent: 360n });
  });

  it("a failed balance read is unknown for an open capability and never falls back to a stored value", () => {
    const figures = capabilityFigures({ cap: 360n, open: true, swept: false, liveBalance: null, payments: 360n });
    assert.equal(figures.balanceKnown, false);
    assert.equal(figures.spentKnown, false);
    assert.equal(figures.spent, 0n);
  });

  it("a closed capability reports its verified payments, not cap minus balance", () => {
    const figures = capabilityFigures({ cap: 10_000n, open: false, swept: false, liveBalance: 0n, payments: 360n });
    assert.deepEqual(figures, { balanceKnown: true, balance: 0n, spentKnown: true, spent: 360n });
  });

  it("a swept capability has no balance and reports its verified payments", () => {
    const figures = capabilityFigures({ cap: 10_000n, open: false, swept: true, liveBalance: null, payments: 1_200n });
    assert.deepEqual(figures, { balanceKnown: true, balance: 0n, spentKnown: true, spent: 1_200n });
  });

  it("a failed balance read on a closed capability keeps verified spend but leaves the balance unknown", () => {
    const figures = capabilityFigures({ cap: 10_000n, open: false, swept: false, liveBalance: null, payments: 360n });
    assert.equal(figures.balanceKnown, false);
    assert.equal(figures.spentKnown, true);
    assert.equal(figures.spent, 360n);
  });

  it("the open spend never goes negative when the balance exceeds the cap", () => {
    const figures = capabilityFigures({ cap: 360n, open: true, swept: false, liveBalance: 400n, payments: 0n });
    assert.equal(figures.spent, 0n);
  });
});

describe("payment totals", () => {
  it("sums spend payments per capability and skips returns to the root", () => {
    const totals = paymentTotals(
      [
        { kind: "spend", tab: tab, payee: payee, amount: "360" },
        { kind: "spend", tab: tab, payee: payee, amount: "240" },
        { kind: "spend", tab: tab, payee: root, amount: "100" },
        { kind: "opened", tab: tab, payee: null, amount: "10000" },
        { kind: "spend", tab: tab, payee: payee, amount: null },
      ],
      root,
    );
    assert.equal(totals.get(tab.toLowerCase()), 600n);
    assert.equal(totals.size, 1);
  });
});

describe("indexed portfolio accounting", () => {
  it("reports available from the chain and spent from cap minus that balance after a payment", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [opened("10000"), spend(101n, 0, payee, "360")], 101n);
    noteIndexHead(101n, "1790000050");
    noteIndexCursor(101n);
    const portfolio = await readIndexedPortfolio(sql, fakeArc({ [tab.toLowerCase()]: 9_640n }), root, root);
    const row = portfolio.tabs[0];
    assert.equal(row?.usdc, "9640");
    assert.equal(row?.balanceKnown, true);
    assert.equal(row?.spentRaw, "360");
    assert.equal(row?.spentKnown, true);
    await sql.close();
  });

  it("does not show a stored balance when the chain read fails", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [opened("10000"), spend(101n, 0, payee, "360")], 101n);
    noteIndexHead(101n, "1790000050");
    noteIndexCursor(101n);
    const portfolio = await readIndexedPortfolio(sql, fakeArc({ [tab.toLowerCase()]: null }), root, root);
    const row = portfolio.tabs[0];
    assert.equal(row?.balanceKnown, false);
    assert.equal(row?.usdc, "0");
    assert.equal(row?.spentKnown, false);
    await sql.close();
  });
});
