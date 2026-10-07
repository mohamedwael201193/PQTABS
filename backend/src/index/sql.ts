import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { SCHEMA } from "./schema.js";

export type Sql = {
  query<T extends Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>;
  tx<T>(run: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

function asRows<T extends Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows as T[];
}

function wrapPglite(db: Queryable & { transaction?: PGlite["transaction"]; close?: () => Promise<void> }, nested = false): Sql {
  return {
    query: async (text, params) => asRows(await db.query(text, params ? [...params] : []).then((result) => result.rows)),
    tx: async (run) => {
      if (nested || !db.transaction) return run(wrapPglite(db, true));
      return db.transaction((tx) => run(wrapPglite(tx, true)));
    },
    close: () => db.close?.() ?? Promise.resolve(),
  };
}

export async function openMemory(): Promise<Sql> {
  const db = new PGlite();
  await db.exec(SCHEMA);
  return wrapPglite(db);
}

export async function openIndex(env: NodeJS.ProcessEnv = process.env): Promise<Sql> {
  if (env.DATABASE_URL) return openPg(env.DATABASE_URL);
  const db = new PGlite(env.INDEX_PATH || ".pqtabs-index");
  await db.exec(SCHEMA);
  return wrapPglite(db);
}

async function openPg(connectionString: string): Promise<Sql> {
  const pool = new pg.Pool({ connectionString, max: 4 });
  await pool.query(SCHEMA);
  const root: Sql = {
    query: async (text, params) => asRows((await pool.query(text, params ? [...params] : undefined)).rows),
    tx: async (run) => {
      const client = await pool.connect();
      const bound: Sql = {
        query: async (text, params) => asRows((await client.query(text, params ? [...params] : undefined)).rows),
        tx: (inner) => inner(bound),
        close: async () => {},
      };
      try {
        await client.query("BEGIN");
        const value = await run(bound);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return root;
}
