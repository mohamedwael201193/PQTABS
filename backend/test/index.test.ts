import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex, PublicClient } from "viem";
import { applyEvents, type IndexEvent, readCursor, resetIndex, writeEvents } from "../src/index/apply.js";
import { readRegistrarRoots, readRootState } from "../src/index/account.js";
import { headFromSubscription, httpToWebSocket } from "../src/index/heads.js";
import { indexCoversHead, noteIndexCursor, noteIndexHead, noteRateLimit } from "../src/index/lane.js";
import { tabFromStored, readIndexedPortfolio } from "../src/index/portfolio.js";
import { openMemory, type Sql } from "../src/index/sql.js";

const rootA = "0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf" as Address;
const rootB = "0x27F441D82d6b364E06eb906889BE8Fc02Df8F762" as Address;
const registrarA = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3" as Address;
const tabA = "0x56377522376b5273a97313992c7970B106cB3837" as Address;
const tabB = "0xe3051e8173fdbec33b826352cb177a306b9d5109" as Address;
const agentA = "0x54113A5C0195821c42CB831d280A73670951166D" as Address;
const payee = "0xC485B657C140C9677846f3E9ca6a3158e5623044" as Address;
const tx = "0x313b912a0f8eccc4d3f082f344520076541fced85060a7e26f49f09c21e3accd" as Hex;

function opened(root: Address, tab: Address, logIndex: number): IndexEvent {
  return {
    block: 100n,
    logIndex,
    tx,
    timestamp: "1790000000",
    root,
    kind: "opened",
    tab,
    agent: agentA,
    amount: "10000",
    expiry: "1790100000",
  };
}

async function countActivity(sql: Sql, root: Address): Promise<number> {
  const rows = await sql.query<{ n: string | number }>("SELECT count(*)::text AS n FROM activity WHERE lower(root) = lower($1)", [root]);
  return Number(rows[0]?.n ?? 0);
}

describe("derived index", () => {
  it("keeps one row when the same log is applied twice", async () => {
    const sql = await openMemory();
    const event = opened(rootA, tabA, 1);
    await applyEvents(sql, [event], 100n);
    await applyEvents(sql, [event], 100n);
    assert.equal(await countActivity(sql, rootA), 1);
    const caps = await sql.query("SELECT tab FROM capabilities");
    assert.equal(caps.length, 1);
    await sql.close();
  });

  it("rolls back the cursor when the transaction crashes", async () => {
    const sql = await openMemory();
    await assert.rejects(
      sql.tx(async (q) => {
        await writeEvents(q, [opened(rootA, tabA, 1)], 100n);
        throw new Error("crash before commit");
      }),
    );
    assert.equal(await readCursor(sql), null);
    assert.equal(await countActivity(sql, rootA), 0);
    await applyEvents(sql, [opened(rootA, tabA, 1)], 100n);
    assert.equal(await readCursor(sql), 100n);
    assert.equal(await countActivity(sql, rootA), 1);
    await sql.close();
  });

  it("rebuilds the same rows after the derived tables are wiped", async () => {
    const sql = await openMemory();
    const events = [opened(rootA, tabA, 1), opened(rootB, tabB, 2)];
    await applyEvents(sql, events, 100n);
    await resetIndex(sql);
    assert.equal(await readCursor(sql), null);
    await applyEvents(sql, events, 100n);
    assert.equal(await countActivity(sql, rootA), 1);
    assert.equal(await countActivity(sql, rootB), 1);
    await sql.close();
  });

  it("does not let one root's spend appear on another root", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [opened(rootA, tabA, 1), opened(rootB, tabB, 2)], 100n);
    await applyEvents(
      sql,
      [
        {
          block: 101n,
          logIndex: 4,
          tx: "0xfcbbe662e18c9f726381e90067ebd40df0c1d739407dccbf481d6cad8315b2cf",
          timestamp: "1790000001",
          root: rootB,
          kind: "spend",
          tab: tabA,
          payee,
          amount: "1",
        },
      ],
      101n,
    );
    assert.equal(await countActivity(sql, rootA), 2);
    assert.equal(await countActivity(sql, rootB), 1);
    const leaked = await sql.query("SELECT kind FROM activity WHERE lower(root) = lower($1) AND kind = 'spend'", [rootB]);
    assert.equal(leaked.length, 0);
    await sql.close();
  });

  it("counts a replayed spend once and keeps a second log as a separate movement", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [opened(rootA, tabA, 1)], 100n);
    const spend = {
      block: 101n,
      logIndex: 4,
      tx: "0xfcbbe662e18c9f726381e90067ebd40df0c1d739407dccbf481d6cad8315b2cf" as const,
      timestamp: "1790000001",
      root: rootA,
      kind: "spend" as const,
      tab: tabA,
      payee,
      amount: "7",
    };
    await applyEvents(sql, [spend], 101n);
    await applyEvents(sql, [spend], 101n);
    await applyEvents(sql, [{ ...spend, logIndex: 5, amount: "3" }], 101n);
    const rows = await sql.query<{ amount: string }>(
      "SELECT amount FROM activity WHERE lower(root) = lower($1) AND kind = 'spend' ORDER BY log_index",
      [rootA],
    );
    assert.deepEqual(rows.map((row) => row.amount), ["7", "3"]);
    const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    assert.equal(total, 10);
    await sql.close();
  });

  it("drops a spend whose capability was never opened", async () => {
    const sql = await openMemory();
    await applyEvents(
      sql,
      [
        {
          block: 50n,
          logIndex: 1,
          tx,
          timestamp: "1790000000",
          root: rootA,
          kind: "root",
          registrar: registrarA,
          verifyingKey: "0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50",
          amount: "200000",
        },
        {
          block: 51n,
          logIndex: 1,
          tx,
          timestamp: "1790000001",
          root: rootA,
          kind: "spend",
          tab: tabA,
          payee,
          amount: "1",
        },
      ],
      51n,
    );
    assert.equal(await countActivity(sql, rootA), 0);
    const roots = await sql.query<{ registrar: string }>("SELECT registrar FROM roots WHERE lower(address) = lower($1)", [rootA]);
    assert.equal(roots[0]?.registrar.toLowerCase(), registrarA.toLowerCase());
    const other = await sql.query("SELECT address FROM roots WHERE lower(address) = lower($1)", [rootB]);
    assert.equal(other.length, 0);
    await sql.close();
  });

  it("does not move the cursor backward", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [], 200n);
    await applyEvents(sql, [], 150n);
    assert.equal(await readCursor(sql), 200n);
    await sql.close();
  });

  it("treats a swept close as an empty balance and leaves an open balance unconfirmed", () => {
    const swept = tabFromStored(rootA, {
      tab: tabA,
      agent: agentA,
      cap: "10000",
      expiry: "1790100000",
      opened_block: 100,
      opened_tx: tx,
      opened_at: "1790000000",
      close_block: 110,
      swept: true,
    });
    assert.equal(swept.open, false);
    assert.equal(swept.balanceKnown, true);
    assert.equal(swept.usdc, "0");
    assert.equal(swept.limitKnown, false);
    const open = tabFromStored(rootA, {
      tab: tabB,
      agent: agentA,
      cap: "10000",
      expiry: "1790100000",
      opened_block: 100,
      opened_tx: tx,
      opened_at: "1790000000",
      close_block: null,
      swept: null,
    });
    assert.equal(open.open, true);
    assert.equal(open.balanceKnown, false);
    assert.equal(open.limitKnown, false);
  });

  it("treats a missing registrar as no root once the index is near head", async () => {
    const sql = await openMemory();
    const silent = { readContract: () => Promise.reject(new Error("Arc should not be read")) } as unknown as PublicClient;
    noteIndexHead(1_000n, "1790000000");
    noteIndexCursor(1_000n);
    noteRateLimit();
    assert.equal(indexCoversHead(), true);
    const none = await readRegistrarRoots(sql, silent, rootA, registrarA);
    assert.deepEqual(none, []);
    await applyEvents(sql, [{
      block: 100n,
      logIndex: 0,
      tx,
      timestamp: "1790000000",
      root: rootA,
      kind: "root",
      registrar: registrarA,
      verifyingKey: "0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50",
      amount: "200000",
    }], 100n);
    const found = await readRegistrarRoots(sql, silent, rootA, registrarA);
    assert.equal(found[0], rootA);
    noteIndexHead(2_000n, "1790001000");
    await assert.rejects(readRegistrarRoots(sql, silent, rootA, "0xBDfCee82bd42fefa58ee850b3709636a8b6b0034"), /temporarily unavailable/);
    await sql.close();
  });

  it("reads a newHeads notification and ignores the subscription acknowledgement", () => {
    assert.equal(httpToWebSocket("https://rpc.mainnet.arc.io"), "wss://rpc.mainnet.arc.io");
    assert.equal(headFromSubscription('{"jsonrpc":"2.0","id":1,"result":"0xabc"}'), null);
    const head = headFromSubscription('{"params":{"result":{"number":"0x17a268c","timestamp":"0x6ac6a21c"}}}');
    assert.equal(head?.number, 24782476n);
    assert.equal(head?.timestamp, "1791402524");
    assert.equal(headFromSubscription("not-json"), null);
  });

  it("reads a stored portfolio without asking Arc", async () => {
    const sql = await openMemory();
    await applyEvents(sql, [opened(rootA, tabA, 1)], 100n);
    noteIndexHead(100n, "1790000000");
    noteIndexCursor(100n);
    const silent = { readContract: () => Promise.reject(new Error("Arc should not be read")) } as unknown as PublicClient;
    const portfolio = await readIndexedPortfolio(sql, silent, rootA, rootA);
    assert.equal(portfolio.tabs.length, 1);
    assert.equal(portfolio.tabs[0]?.balanceKnown, false);
    assert.equal(portfolio.freshness, "live");
    assert.equal(portfolio.activity.length, 1);
    await sql.close();
  });

  it("keeps the creation key until a rotation, then reads the chain key", async () => {
    const sql = await openMemory();
    const original = "0xdbb8245905fe933f16b4ed744b0e0c7050c616f7f2c83207aa72a7a97ed1ef50";
    const next = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;
    const chain = "0x2222222222222222222222222222222222222222222222222222222222222222";
    await applyEvents(sql, [{
      block: 50n,
      logIndex: 1,
      tx,
      timestamp: "1790000000",
      root: rootA,
      kind: "root",
      registrar: registrarA,
      verifyingKey: original,
      amount: "200000",
    }], 50n);
    const silent = { readContract: () => Promise.reject(new Error("Arc should not be read")) } as unknown as PublicClient;
    const before = await readRootState(sql, silent, rootA, rootA);
    assert.equal(before.pqVk, original);
    await applyEvents(sql, [{
      block: 51n,
      logIndex: 2,
      tx,
      timestamp: "1790000001",
      root: rootA,
      kind: "rotated",
      verifyingKey: next,
    }], 51n);
    const stored = await sql.query<{ verifying_key: string }>("SELECT verifying_key FROM roots WHERE lower(address) = lower($1)", [rootA]);
    assert.equal(stored[0]?.verifying_key, next);
    const live = { readContract: () => Promise.resolve(chain) } as unknown as PublicClient;
    const after = await readRootState(sql, live, rootA, rootA);
    assert.equal(after.pqVk, chain);
    noteIndexHead(51n, "1790000001");
    noteIndexCursor(51n);
    const limited = { readContract: () => Promise.reject(new Error("429 Too Many Requests")) } as unknown as PublicClient;
    const fallback = await readRootState(sql, limited, rootA, rootA);
    assert.equal(fallback.pqVk, next);
    noteIndexHead(2_000n, "1790001000");
    await sql.close();
  });
});
