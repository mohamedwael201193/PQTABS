import type { Sql } from "./sql.js";

/** The hash already broadcast for this exact authorization, including after a process restart. */
export async function recallSpend(sql: Sql | null, calldata: string): Promise<string | null> {
  if (!sql) return null;
  const rows = await sql.query<{ tx_hash: string }>("SELECT tx_hash FROM spend_attempts WHERE calldata = $1", [calldata]);
  const hash = rows[0]?.tx_hash;
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : null;
}

export async function rememberSpend(sql: Sql | null, calldata: string, hash: string): Promise<void> {
  if (!sql || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return;
  await sql.query("INSERT INTO spend_attempts (calldata, tx_hash) VALUES ($1, $2) ON CONFLICT (calldata) DO NOTHING", [
    calldata,
    hash,
  ]);
}
