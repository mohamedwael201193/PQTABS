import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { extractSignature, newPairingRequest, pairingCommand, pairingMessage, verifyPairing } from "./pairing.ts";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const ORIGIN = "https://pqtabs.vercel.app";
const NONCE = "ab".repeat(32);
const EXPIRES = "2026-10-13T12:05:00.000Z";

/** The same text the signer test pins in packages/pqtabs-signer/test/unit/pairing.test.ts. */
const VECTOR = [
  "PQTABS agent pairing",
  "Agent: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  "Origin: https://pqtabs.vercel.app",
  "Chain ID: 5042",
  `Nonce: ${NONCE}`,
  "Expires at: 2026-10-13T12:05:00.000Z",
  "This signature proves that this device controls the agent key. It does not authorize any payment or capability. A capability still needs its own root signature.",
].join("\n");

test("the pairing message is the fixed template the signer also signs", () => {
  assert.equal(
    pairingMessage({ agent: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf", origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES }),
    VECTOR,
  );
});

test("a new request has a 32-byte nonce, a five-minute canonical expiry, and a command with no key in it", () => {
  const agent = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as const;
  const request = newPairingRequest({ agent, origin: ORIGIN, nowMs: NOW, random: () => new Uint8Array(32).fill(0xab) });
  assert.equal(request.nonce, NONCE);
  assert.equal(request.expiresAt, EXPIRES);
  const command = pairingCommand(request);
  assert.ok(command.includes(`--agent ${agent}`));
  assert.ok(command.includes(`--origin ${ORIGIN}`));
  assert.ok(command.includes(`--nonce ${NONCE}`));
  assert.ok(command.includes(`--expires ${EXPIRES}`));
  assert.equal(/0x[0-9a-fA-F]{64}\b/.test(command), false, "the command never contains a 32-byte key-shaped value");
});

test("a real signature from the agent key pairs, and the same signature is refused for any other origin, time, or key", async () => {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const request = newPairingRequest({ agent: account.address, origin: ORIGIN, nowMs: NOW });
  const signature = await account.signMessage({ message: pairingMessage(request) });

  assert.deepEqual(await verifyPairing({ request, signature, pageOrigin: ORIGIN, nowMs: NOW + 1_000 }), { ok: true });
  assert.deepEqual(await verifyPairing({ request, signature, pageOrigin: "https://evil.example", nowMs: NOW + 1_000 }), {
    ok: false,
    reason: "wrong_origin",
  });
  assert.deepEqual(await verifyPairing({ request, signature, pageOrigin: ORIGIN, nowMs: Date.parse(EXPIRES) }), { ok: false, reason: "expired" });

  const other = privateKeyToAccount(generatePrivateKey());
  const foreign = await other.signMessage({ message: pairingMessage(request) });
  assert.deepEqual(await verifyPairing({ request, signature: foreign, pageOrigin: ORIGIN, nowMs: NOW + 1_000 }), {
    ok: false,
    reason: "not_signed_by_agent",
  });

  const otherNonce = { ...request, nonce: "cd".repeat(32) };
  assert.deepEqual(await verifyPairing({ request: otherNonce, signature, pageOrigin: ORIGIN, nowMs: NOW + 1_000 }), {
    ok: false,
    reason: "not_signed_by_agent",
  });
});

test("the signature field accepts the raw signature or the signer's JSON, and nothing key-shaped", () => {
  const signature = `0x${"11".repeat(65)}`;
  assert.equal(extractSignature(signature), signature);
  assert.equal(extractSignature(JSON.stringify({ ok: true, agent: "0x0", signature })), signature);
  assert.equal(extractSignature(`0x${"11".repeat(32)}`), null, "a 32-byte private key is not a signature");
  assert.equal(extractSignature("not a signature"), null);
  assert.equal(extractSignature("{not json"), null);
});

test("a lowercase address is pinned to its checksum form, so the signer and the page build the same message", () => {
  const request = newPairingRequest({
    agent: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
    origin: ORIGIN,
    nowMs: NOW,
    random: () => new Uint8Array(32).fill(0xab),
  });
  assert.equal(request.agent, "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf");
  assert.ok(pairingMessage(request).includes("Agent: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"));
});