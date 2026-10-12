import type { ResearchQuote } from "./research.js";
import type { Sql } from "./sql.js";

export type StoredQuote = {
  id: string;
  body_hash: string;
  task: string;
  price: string;
  payee: string;
  max_tokens: number;
  expires_at: string;
  tx_hash: string | null;
  status: string;
  result: string;
  model: string;
};

export async function openQuote(sql: Sql | null, bodyHash: string, now: number): Promise<StoredQuote | null> {
  if (!sql) return null;
  const rows = await sql.query<StoredQuote>(
    "SELECT id, body_hash, task, price, payee, max_tokens, expires_at, tx_hash, status, result, model FROM research_quotes WHERE body_hash = $1 AND status = 'quoted' AND expires_at > $2 ORDER BY expires_at DESC LIMIT 1",
    [bodyHash, now],
  );
  return rows[0] ?? null;
}

export async function rememberQuote(sql: Sql | null, quote: ResearchQuote): Promise<void> {
  if (!sql) return;
  await sql.query(
    "INSERT INTO research_quotes (id, body_hash, task, price, payee, max_tokens, expires_at, tx_hash, status, result, model) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'quoted', '', '') ON CONFLICT (id) DO NOTHING",
    [quote.id, quote.bodyHash, quote.task, quote.price, quote.payee, quote.maxTokens, quote.expiresAt],
  );
}

export async function readQuote(sql: Sql | null, id: string): Promise<StoredQuote | null> {
  if (!sql) return null;
  const rows = await sql.query<StoredQuote>(
    "SELECT id, body_hash, task, price, payee, max_tokens, expires_at, tx_hash, status, result, model FROM research_quotes WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function saveDelivery(
  sql: Sql | null,
  id: string,
  txHash: string,
  status: "result_pending" | "complete",
  result: string,
  model: string,
): Promise<void> {
  if (!sql) return;
  await sql.query(
    "UPDATE research_quotes SET tx_hash = $2, status = $3, result = $4, model = $5 WHERE id = $1 AND (tx_hash IS NULL OR tx_hash = $2)",
    [id, txHash, status, result, model],
  );
}
