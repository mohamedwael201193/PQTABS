import { type Address, getAddress, type Hex } from "viem";
import type { Sql } from "./sql.js";

export type IndexEvent = {
  block: bigint;
  logIndex: number;
  tx: Hex;
  timestamp: string;
  root: Address;
  kind: "opened" | "closed" | "transfer" | "rotated" | "spend" | "root";
  tab?: Address;
  agent?: Address;
  payee?: Address;
  amount?: string;
  registrar?: Address;
  verifyingKey?: Hex;
  expiry?: string;
  permissionless?: boolean;
  swept?: boolean;
};

function addr(value: string): Address {
  return getAddress(value);
}

export async function readCursor(sql: Sql): Promise<bigint | null> {
  const rows = await sql.query<{ last_block: string | number }>("SELECT last_block FROM indexer_cursor WHERE id = 1");
  const value = rows[0]?.last_block;
  return value == null ? null : BigInt(value);
}

export async function resetIndex(sql: Sql): Promise<void> {
  await sql.tx(async (q) => {
    await q.query("DELETE FROM activity");
    await q.query("DELETE FROM capabilities");
    await q.query("DELETE FROM roots");
    await q.query("DELETE FROM indexer_cursor");
  });
}

/** Inserts logs and advances the cursor in one transaction. Replays are idempotent. */
export async function applyEvents(sql: Sql, events: readonly IndexEvent[], throughBlock: bigint): Promise<void> {
  await sql.tx((q) => writeEvents(q, events, throughBlock));
}

export async function writeEvents(sql: Sql, events: readonly IndexEvent[], throughBlock: bigint): Promise<void> {
  const ordered = [...events].sort((a, b) => (a.block === b.block ? a.logIndex - b.logIndex : a.block < b.block ? -1 : 1));
  for (const event of ordered) {
    if (event.kind === "root") await insertRoot(sql, event);
    else if (event.kind === "opened") await insertOpened(sql, event);
    else if (event.kind === "closed") await insertClosed(sql, event);
    else await insertActivity(sql, event);
  }
  await sql.query(
    `INSERT INTO indexer_cursor (id, last_block) VALUES (1, $1::bigint)
     ON CONFLICT (id) DO UPDATE SET last_block = GREATEST(indexer_cursor.last_block, EXCLUDED.last_block)`,
    [throughBlock.toString()],
  );
}

async function insertRoot(sql: Sql, event: IndexEvent): Promise<void> {
  if (!event.registrar || !event.verifyingKey || !event.amount) return;
  await sql.query(
    `INSERT INTO roots (address, registrar, verifying_key, max_exposure, created_block, created_tx, created_log_index)
     VALUES ($1, $2, $3, $4, $5::bigint, $6, $7)
     ON CONFLICT (address) DO NOTHING`,
    [addr(event.root), addr(event.registrar), event.verifyingKey, event.amount, event.block.toString(), event.tx, event.logIndex],
  );
}

async function insertOpened(sql: Sql, event: IndexEvent): Promise<void> {
  if (!event.tab || !event.agent || !event.amount || !event.expiry) return;
  await sql.query(
    `INSERT INTO capabilities (tab, root, agent, cap, expiry, opened_block, opened_tx, opened_log_index, opened_at)
     VALUES ($1, $2, $3, $4, $5, $6::bigint, $7, $8, $9)
     ON CONFLICT (tab) DO NOTHING`,
    [addr(event.tab), addr(event.root), addr(event.agent), event.amount, event.expiry, event.block.toString(), event.tx, event.logIndex, event.timestamp],
  );
  await insertActivity(sql, event);
}

async function insertClosed(sql: Sql, event: IndexEvent): Promise<void> {
  if (event.tab) {
    await sql.query(
      `UPDATE capabilities
       SET close_block = $2::bigint, close_tx = $3, close_log_index = $4, cap_released = $5, swept = $6, permissionless = $7
       WHERE lower(tab) = lower($1)`,
      [addr(event.tab), event.block.toString(), event.tx, event.logIndex, event.amount ?? null, event.swept === true, event.permissionless === true],
    );
  }
  await insertActivity(sql, event);
}

async function insertActivity(sql: Sql, event: IndexEvent): Promise<void> {
  if (event.kind === "root") return;
  let root = event.root;
  if (event.kind === "spend" && event.tab) {
    const rows = await sql.query<{ root: string }>("SELECT root FROM capabilities WHERE lower(tab) = lower($1)", [addr(event.tab)]);
    const found = rows[0]?.root;
    if (!found) return;
    root = addr(found);
  }
  await sql.query(
    `INSERT INTO activity (tx_hash, log_index, block_number, observed_at, root, kind, tab, agent, payee, amount, permissionless, swept)
     VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (tx_hash, log_index) DO NOTHING`,
    [
      event.tx,
      event.logIndex,
      event.block.toString(),
      event.timestamp,
      addr(root),
      event.kind,
      event.tab ? addr(event.tab) : null,
      event.agent ? addr(event.agent) : null,
      event.payee ? addr(event.payee) : null,
      event.amount ?? null,
      event.permissionless ?? null,
      event.swept ?? null,
    ],
  );
}
