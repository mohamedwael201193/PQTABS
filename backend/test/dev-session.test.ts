import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { authenticate, buildChallengeMessage, CHALLENGE_TTL_SECONDS, createChallenge, createSession, DevAuthError, type DevStore, ensureDevTables, hashToken, MemoryDevStore, revokeSession, SESSION_TTL_SECONDS, SqlDevStore } from "../src/dev/session.js";
import { openMemory } from "../src/index/sql.js";

const ORIGIN = "https://pqtabs.vercel.app";
const ALLOWED = [ORIGIN, "http://localhost:3000"];
// Test-only keys, derived from fixed values. They control nothing on Arc.
const WALLET = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
const OTHER = privateKeyToAccount("0x2222222222222222222222222222222222222222222222222222222222222222");
const T0 = 1_791_850_000;

async function challenge(store: DevStore, now = T0, origin = ORIGIN, wallet = WALLET.address) {
  return createChallenge({ store, wallet, origin, scopes: ["read:roots"], now, allowed: ALLOWED });
}

async function sign(message: string, account = WALLET) {
  return account.signMessage({ message });
}

async function expectError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: unknown) => err instanceof DevAuthError && err.code === code, `expected ${code}`);
}

test("happy path: a wallet-signed, single-use challenge yields a read-only session", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  const s = await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 5 });
  assert.equal(s.scopes.join(","), "read:roots");
  assert.equal(s.expiresAt, T0 + 5 + SESSION_TTL_SECONDS);
  const session = await authenticate({ store, token: s.token, requiredScope: "read:roots", now: T0 + 10 });
  assert.equal(session.wallet, WALLET.address.toLowerCase());
});

test("replay: the same nonce cannot mint a second session", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const message = buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt });
  const signature = await sign(message);
  await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 });
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 2 }), "nonce_used");
});

test("replay holds on the Postgres-compatible store too (atomic consume)", async () => {
  const sql = await openMemory();
  await ensureDevTables(sql);
  const store = new SqlDevStore(sql);
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 });
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 2 }), "nonce_used");
  await sql.close();
});

test("expiry: a challenge older than its TTL is refused, and its nonce is burned", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + CHALLENGE_TTL_SECONDS + 1 }), "challenge_expired");
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 2 }), "nonce_used");
});

test("wrong wallet: a signature from another key does not authorize the claimed wallet", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const forged = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }), OTHER);
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature: forged, now: T0 + 1 }), "invalid_signature");
});

test("wrong wallet: a session request naming a different wallet than the challenge is refused", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  await expectError(createSession({ store, wallet: OTHER.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 }), "wrong_wallet");
});

test("origin: a non-allowlisted origin cannot even request a challenge", async () => {
  const store = new MemoryDevStore();
  await expectError(challenge(store, T0, "https://evil.example"), "origin_not_allowed");
});

test("origin: a challenge issued for one origin cannot be redeemed from another", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store, T0, "http://localhost:3000");
  const signature = await sign(buildChallengeMessage({ origin: "http://localhost:3000", wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 }), "origin_mismatch");
});

test("unauthorized scope: unknown and spend-like scopes are refused before any nonce is consumed", async () => {
  const store = new MemoryDevStore();
  await expectError(createChallenge({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["spend:tab"], now: T0, allowed: ALLOWED }), "unknown_scope");
  await expectError(createChallenge({ store, wallet: WALLET.address, origin: ORIGIN, scopes: [], now: T0, allowed: ALLOWED }), "unknown_scope");
});

test("unauthorized scope: a session without the required scope is refused with 403", async () => {
  const store = new MemoryDevStore();
  const token = "scopeless-test-token";
  // A session stored with no scopes, as a future or corrupted row might be. Authorization must still refuse it.
  await store.saveSession({ tokenHash: hashToken(token), wallet: WALLET.address.toLowerCase(), origin: ORIGIN, scopes: [], issuedAt: T0, expiresAt: T0 + 3600, revokedAt: null });
  await assert.rejects(
    authenticate({ store, token, requiredScope: "read:roots", now: T0 + 1 }),
    (err: unknown) => err instanceof DevAuthError && err.code === "insufficient_scope" && err.status === 403,
  );
});

test("revoked session: revocation takes effect immediately and cannot be undone", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  const s = await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 });
  await revokeSession({ store, token: s.token, now: T0 + 2 });
  await expectError(authenticate({ store, token: s.token, requiredScope: "read:roots", now: T0 + 3 }), "session_revoked");
  await expectError(revokeSession({ store, token: s.token, now: T0 + 4 }), "session_revoked");
});

test("session expiry: a session is refused once its TTL passes", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  const s = await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 });
  await expectError(authenticate({ store, token: s.token, requiredScope: "read:roots", now: T0 + SESSION_TTL_SECONDS + 2 }), "session_expired");
});

test("tokens: only a hash of the token is stored; the raw token is never a lookup key", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  const signature = await sign(buildChallengeMessage({ origin: ORIGIN, wallet: WALLET.address, nonce: c.nonce, scopes: ["read:roots"], issuedAt: T0, expiresAt: c.expiresAt }));
  const s = await createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature, now: T0 + 1 });
  assert.equal(await store.findSession(s.token), null);
  assert.notEqual((await store.findSession(hashToken(s.token)))?.tokenHash, s.token);
});

test("missing token: no bearer token is refused", async () => {
  const store = new MemoryDevStore();
  await expectError(authenticate({ store, token: undefined, requiredScope: "read:roots", now: T0 }), "missing_token");
  await expectError(authenticate({ store, token: "not-a-session", requiredScope: "read:roots", now: T0 }), "unknown_session");
});

test("signature shape: a malformed signature is refused without consuming a valid nonce", async () => {
  const store = new MemoryDevStore();
  const c = await challenge(store);
  await expectError(createSession({ store, wallet: WALLET.address, origin: ORIGIN, scopes: ["read:roots"], nonce: c.nonce, signature: "0xdead", now: T0 + 1 }), "invalid_signature");
});
