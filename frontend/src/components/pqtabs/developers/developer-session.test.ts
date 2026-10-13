import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDeveloperSession,
  DeveloperSessionError,
  revokeDeveloperSession,
  signInDeveloperSession,
  tokenPreview,
} from "./developer-session.ts";

const BACKEND = "https://backend.example";
const WALLET = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
const ORIGIN = "https://pqtabs.vercel.app";
const NONCE = "ab".repeat(32);
const MESSAGE = "PQTABS developer authorization\nNonce: " + NONCE;
const TOKEN = "tok_0123456789abcdefghijklmnopqrstuvwxyz";

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };

/** A fake backend. Each route answers from a queue, so a test can make any step fail. */
function fakeBackend(answers: Record<string, Array<{ status: number; body: unknown }>>) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = new URL(url).pathname;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, headers });
    const queue = answers[path] ?? [];
    const next = queue.shift();
    if (!next) throw new Error(`no fake answer for ${path}`);
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

test("sign-in asks for a challenge, signs the server's message, and exchanges the signature for a read-only token", async () => {
  const { calls, fetchImpl } = fakeBackend({
    "/v1/dev/challenge": [{ status: 200, body: { nonce: NONCE, message: MESSAGE, expiresAt: 1 } }],
    "/v1/dev/session": [{ status: 200, body: { token: TOKEN, wallet: WALLET, scopes: ["read:roots"], expiresAt: 2 } }],
  });
  const signed: string[] = [];
  const session = await signInDeveloperSession({
    backendUrl: `${BACKEND}/`,
    wallet: WALLET,
    origin: ORIGIN,
    signMessage: async (message) => {
      signed.push(message);
      return `0x${"22".repeat(65)}`;
    },
    fetchImpl,
  });

  assert.equal(session.token, TOKEN);
  assert.deepEqual(session.scopes, ["read:roots"]);
  assert.deepEqual(signed, [MESSAGE], "the wallet signs only the server's sign-in message");
  assert.deepEqual(calls.map((call) => call.url), [`${BACKEND}/v1/dev/challenge`, `${BACKEND}/v1/dev/session`]);
  assert.deepEqual(calls[0].body, { wallet: WALLET, origin: ORIGIN, scopes: ["read:roots"] });
  assert.deepEqual((calls[1].body as { nonce: string }).nonce, NONCE);
});

test("a session that does not grant read:roots is refused, never accepted as a partial session", async () => {
  const { fetchImpl } = fakeBackend({
    "/v1/dev/challenge": [{ status: 200, body: { nonce: NONCE, message: MESSAGE, expiresAt: 1 } }],
    "/v1/dev/session": [{ status: 200, body: { token: TOKEN, wallet: WALLET, scopes: [], expiresAt: 2 } }],
  });
  await assert.rejects(
    () => signInDeveloperSession({ backendUrl: BACKEND, wallet: WALLET, origin: ORIGIN, signMessage: async () => "0x", fetchImpl }),
    (error: unknown) => error instanceof DeveloperSessionError && error.code === "bad_response",
  );
});

test("a refused signature says that no session was created, in plain language", async () => {
  const { fetchImpl } = fakeBackend({
    "/v1/dev/challenge": [{ status: 200, body: { nonce: NONCE, message: MESSAGE, expiresAt: 1 } }],
    "/v1/dev/session": [{ status: 401, body: { error: "invalid_signature", detail: "signature does not match" } }],
  });
  await assert.rejects(
    () => signInDeveloperSession({ backendUrl: BACKEND, wallet: WALLET, origin: ORIGIN, signMessage: async () => "0x", fetchImpl }),
    (error: unknown) =>
      error instanceof DeveloperSessionError &&
      error.code === "invalid_signature" &&
      error.message.includes("No session was created"),
  );
});

test("an unknown error code gets the safe fallback that says no payment was signed", async () => {
  const { fetchImpl } = fakeBackend({
    "/v1/dev/challenge": [{ status: 500, body: { error: "something_new" } }],
  });
  await assert.rejects(
    () => signInDeveloperSession({ backendUrl: BACKEND, wallet: WALLET, origin: ORIGIN, signMessage: async () => "0x", fetchImpl }),
    (error: unknown) => error instanceof DeveloperSessionError && error.message.includes("No payment was signed"),
  );
});

test("status and revoke send the token only as a bearer header", async () => {
  const { calls, fetchImpl } = fakeBackend({
    "/v1/dev/session": [{ status: 200, body: { wallet: WALLET, scopes: ["read:roots"], expiresAt: 9 } }],
    "/v1/dev/revoke": [{ status: 200, body: { revoked: true } }],
  });
  const status = await checkDeveloperSession({ backendUrl: BACKEND, token: TOKEN, fetchImpl });
  assert.deepEqual(status.scopes, ["read:roots"]);
  await revokeDeveloperSession({ backendUrl: BACKEND, token: TOKEN, fetchImpl });
  assert.equal(calls[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1].body, null, "revoke sends no body, so the token never appears in JSON");
});

test("the screen shows only a short token preview", () => {
  const preview = tokenPreview(TOKEN);
  assert.equal(preview, "tok_01…wxyz");
  assert.equal(preview.includes(TOKEN.slice(6, 20)), false);
});
