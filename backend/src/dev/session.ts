import { createHash, randomBytes } from "node:crypto";
import { type Address, getAddress, type Hex, isAddress, verifyMessage } from "viem";
import { CHAIN_ID } from "../constants.js";
import type { Sql } from "../index/sql.js";

/**
 * Developer sessions. A session proves that a wallet authorized read-only API access from one origin.
 * It is never root authority: it cannot open, close, fund, or sign for a capability, and it cannot
 * change a payee, cap, expiry, or policy. Spending stays behind the capability's own signature and
 * decision checks, which this module never touches.
 */

export const DEV_AUDIENCE = "pqtabs-developer-api";
export const CHALLENGE_TTL_SECONDS = 300;
export const SESSION_TTL_SECONDS = 3600;
/** The only scopes that exist. There is deliberately no scope that can move money. */
export const DEV_SCOPES = ["read:roots"] as const;
export type DevScope = (typeof DEV_SCOPES)[number];

export class DevAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Challenge = {
  nonce: string;
  wallet: string;
  origin: string;
  scopes: DevScope[];
  issuedAt: number;
  expiresAt: number;
  usedAt: number | null;
};

export type Session = {
  tokenHash: string;
  wallet: string;
  origin: string;
  scopes: DevScope[];
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
};

export type ConsumeOutcome = { outcome: "consumed"; challenge: Challenge } | { outcome: "used" } | { outcome: "unknown" };

/** Storage contract. The Postgres and in-memory stores must behave identically. */
export interface DevStore {
  saveChallenge(challenge: Challenge): Promise<void>;
  /** Marks the challenge used in one atomic step. A second call for the same nonce returns "used". */
  consumeChallenge(nonce: string, usedAt: number): Promise<ConsumeOutcome>;
  saveSession(session: Session): Promise<void>;
  findSession(tokenHash: string): Promise<Session | null>;
  revokeSession(tokenHash: string, revokedAt: number): Promise<void>;
}

export class MemoryDevStore implements DevStore {
  private readonly challenges = new Map<string, Challenge>();
  private readonly sessions = new Map<string, Session>();

  async saveChallenge(challenge: Challenge): Promise<void> {
    this.challenges.set(challenge.nonce, { ...challenge });
  }

  async consumeChallenge(nonce: string, usedAt: number): Promise<ConsumeOutcome> {
    const found = this.challenges.get(nonce);
    if (!found) return { outcome: "unknown" };
    if (found.usedAt !== null) return { outcome: "used" };
    found.usedAt = usedAt;
    return { outcome: "consumed", challenge: { ...found } };
  }

  async saveSession(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, { ...session });
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const found = this.sessions.get(tokenHash);
    return found ? { ...found } : null;
  }

  async revokeSession(tokenHash: string, revokedAt: number): Promise<void> {
    const found = this.sessions.get(tokenHash);
    if (found && found.revokedAt === null) found.revokedAt = revokedAt;
  }
}

/** Creates the two tables. Idempotent, so it is safe on every start. */
export async function ensureDevTables(sql: Sql): Promise<void> {
  await sql.query(`CREATE TABLE IF NOT EXISTS dev_challenges (
    nonce text PRIMARY KEY,
    wallet text NOT NULL,
    origin text NOT NULL,
    scopes text NOT NULL,
    issued_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    used_at bigint
  )`);
  await sql.query(`CREATE TABLE IF NOT EXISTS dev_sessions (
    token_hash text PRIMARY KEY,
    wallet text NOT NULL,
    origin text NOT NULL,
    scopes text NOT NULL,
    issued_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    revoked_at bigint
  )`);
}

const num = (value: unknown): number => Number(value);
const parseScopes = (text: string): DevScope[] => text.split(",").filter((s): s is DevScope => (DEV_SCOPES as readonly string[]).includes(s));

/** Postgres-backed store. Works with the shared `Sql` wrapper, so PGlite in tests and pg in production run the same SQL. */
export class SqlDevStore implements DevStore {
  constructor(private readonly sql: Sql) {}

  async saveChallenge(c: Challenge): Promise<void> {
    await this.sql.query(
      "INSERT INTO dev_challenges (nonce, wallet, origin, scopes, issued_at, expires_at, used_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [c.nonce, c.wallet, c.origin, c.scopes.join(","), c.issuedAt, c.expiresAt, c.usedAt],
    );
  }

  async consumeChallenge(nonce: string, usedAt: number): Promise<ConsumeOutcome> {
    const rows = await this.sql.query<{ nonce: string; wallet: string; origin: string; scopes: string; issued_at: unknown; expires_at: unknown }>(
      "UPDATE dev_challenges SET used_at = $2 WHERE nonce = $1 AND used_at IS NULL RETURNING nonce, wallet, origin, scopes, issued_at, expires_at",
      [nonce, usedAt],
    );
    const row = rows[0];
    if (row) {
      return {
        outcome: "consumed",
        challenge: {
          nonce: row.nonce,
          wallet: row.wallet,
          origin: row.origin,
          scopes: parseScopes(row.scopes),
          issuedAt: num(row.issued_at),
          expiresAt: num(row.expires_at),
          usedAt,
        },
      };
    }
    const existing = await this.sql.query<{ used_at: unknown }>("SELECT used_at FROM dev_challenges WHERE nonce = $1", [nonce]);
    return existing.length === 0 ? { outcome: "unknown" } : { outcome: "used" };
  }

  async saveSession(s: Session): Promise<void> {
    await this.sql.query(
      "INSERT INTO dev_sessions (token_hash, wallet, origin, scopes, issued_at, expires_at, revoked_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [s.tokenHash, s.wallet, s.origin, s.scopes.join(","), s.issuedAt, s.expiresAt, s.revokedAt],
    );
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const rows = await this.sql.query<{ token_hash: string; wallet: string; origin: string; scopes: string; issued_at: unknown; expires_at: unknown; revoked_at: unknown }>(
      "SELECT token_hash, wallet, origin, scopes, issued_at, expires_at, revoked_at FROM dev_sessions WHERE token_hash = $1",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tokenHash: row.token_hash,
      wallet: row.wallet,
      origin: row.origin,
      scopes: parseScopes(row.scopes),
      issuedAt: num(row.issued_at),
      expiresAt: num(row.expires_at),
      revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : num(row.revoked_at),
    };
  }

  async revokeSession(tokenHash: string, revokedAt: number): Promise<void> {
    await this.sql.query("UPDATE dev_sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL", [tokenHash, revokedAt]);
  }
}

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.DEV_ALLOWED_ORIGINS || "https://pqtabs.vercel.app,http://localhost:3000,http://localhost:3100")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeWallet(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new DevAuthError("invalid_request", 400, "wallet must be a 0x address");
  }
  return getAddress(value);
}

function normalizeScopes(value: unknown): DevScope[] {
  if (!Array.isArray(value) || value.length === 0) throw new DevAuthError("unknown_scope", 400, "scopes must be a non-empty list");
  const out: DevScope[] = [];
  for (const scope of value) {
    if (typeof scope !== "string" || !(DEV_SCOPES as readonly string[]).includes(scope)) {
      throw new DevAuthError("unknown_scope", 400, `unknown scope: ${String(scope).slice(0, 40)}`);
    }
    if (!out.includes(scope as DevScope)) out.push(scope as DevScope);
  }
  return out.sort();
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/** The exact text the wallet signs. Every field the server checks is in it. */
export function buildChallengeMessage(p: { origin: string; wallet: string; nonce: string; scopes: DevScope[]; issuedAt: number; expiresAt: number }): string {
  return [
    "PQTABS developer authorization",
    `Origin: ${p.origin}`,
    `Audience: ${DEV_AUDIENCE}`,
    `Chain ID: ${CHAIN_ID}`,
    `Wallet: ${p.wallet}`,
    `Scopes: ${p.scopes.join(",")}`,
    `Nonce: ${p.nonce}`,
    `Issued at: ${iso(p.issuedAt)}`,
    `Expires at: ${iso(p.expiresAt)}`,
    "This signature grants read-only API access. It cannot open, close, fund, or sign for any capability and cannot move USDC.",
  ].join("\n");
}

export async function createChallenge(input: {
  store: DevStore;
  wallet: unknown;
  origin: unknown;
  scopes: unknown;
  now: number;
  allowed: string[];
}): Promise<{ nonce: string; message: string; expiresAt: number }> {
  const wallet = normalizeWallet(input.wallet);
  const scopes = normalizeScopes(input.scopes);
  if (typeof input.origin !== "string" || !input.allowed.includes(input.origin)) {
    throw new DevAuthError("origin_not_allowed", 403, "this origin is not allowed to request developer sessions");
  }
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = input.now + CHALLENGE_TTL_SECONDS;
  const challenge: Challenge = {
    nonce,
    wallet: wallet.toLowerCase(),
    origin: input.origin,
    scopes,
    issuedAt: input.now,
    expiresAt,
    usedAt: null,
  };
  await input.store.saveChallenge(challenge);
  const message = buildChallengeMessage({ origin: input.origin, wallet, nonce, scopes, issuedAt: input.now, expiresAt });
  return { nonce, message, expiresAt };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(input: {
  store: DevStore;
  wallet: unknown;
  origin: unknown;
  scopes: unknown;
  nonce: unknown;
  signature: unknown;
  now: number;
}): Promise<{ token: string; wallet: string; scopes: DevScope[]; expiresAt: number }> {
  const wallet = normalizeWallet(input.wallet);
  const scopes = normalizeScopes(input.scopes);
  if (typeof input.nonce !== "string" || !/^[0-9a-f]{64}$/.test(input.nonce)) {
    throw new DevAuthError("nonce_unknown", 401, "nonce is not a server-issued challenge");
  }
  if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
    throw new DevAuthError("invalid_signature", 401, "signature must be a 65-byte hex signature");
  }

  // Consuming first means a replay or any later failure burns the nonce. Nothing is retried with it.
  const consumed = await input.store.consumeChallenge(input.nonce, input.now);
  if (consumed.outcome === "unknown") throw new DevAuthError("nonce_unknown", 401, "nonce was never issued");
  if (consumed.outcome === "used") throw new DevAuthError("nonce_used", 401, "nonce was already used");
  const challenge = consumed.challenge;

  if (challenge.wallet !== wallet.toLowerCase()) throw new DevAuthError("wrong_wallet", 401, "challenge was issued to a different wallet");
  if (challenge.origin !== input.origin) throw new DevAuthError("origin_mismatch", 401, "challenge was issued for a different origin");
  if (challenge.scopes.join(",") !== scopes.join(",")) throw new DevAuthError("unknown_scope", 401, "requested scopes differ from the signed challenge");
  if (input.now > challenge.expiresAt) throw new DevAuthError("challenge_expired", 401, "challenge expired; request a new one");

  const message = buildChallengeMessage({
    origin: challenge.origin,
    wallet,
    nonce: challenge.nonce,
    scopes: challenge.scopes,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
  });
  let valid = false;
  try {
    valid = await verifyMessage({ address: wallet, message, signature: input.signature as Hex });
  } catch {
    valid = false;
  }
  if (!valid) throw new DevAuthError("invalid_signature", 401, "signature does not match the wallet and challenge");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = input.now + SESSION_TTL_SECONDS;
  await input.store.saveSession({
    tokenHash: hashToken(token),
    wallet: wallet.toLowerCase(),
    origin: challenge.origin,
    scopes,
    issuedAt: input.now,
    expiresAt,
    revokedAt: null,
  });
  return { token, wallet, scopes, expiresAt };
}

/** Checks a bearer token. Throws on a missing, unknown, revoked, expired, or under-scoped session. */
export async function authenticate(input: { store: DevStore; token: string | undefined; requiredScope?: DevScope; now: number }): Promise<Session> {
  if (!input.token) throw new DevAuthError("missing_token", 401, "send Authorization: Bearer <session token>");
  const session = await input.store.findSession(hashToken(input.token));
  if (!session) throw new DevAuthError("unknown_session", 401, "session is unknown");
  if (session.revokedAt !== null) throw new DevAuthError("session_revoked", 401, "session was revoked");
  if (input.now >= session.expiresAt) throw new DevAuthError("session_expired", 401, "session expired; authorize again");
  if (input.requiredScope && !session.scopes.includes(input.requiredScope)) {
    throw new DevAuthError("insufficient_scope", 403, `session lacks scope ${input.requiredScope}`);
  }
  return session;
}

export async function revokeSession(input: { store: DevStore; token: string | undefined; now: number }): Promise<void> {
  const session = await authenticate({ store: input.store, token: input.token, now: input.now });
  await input.store.revokeSession(session.tokenHash, input.now);
}
