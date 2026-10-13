import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Address, verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SignerError } from "../../src/errors.js";
import { saveAgentKey } from "../../src/keystore.js";
import { assertPairingRequest, PAIRING_CHAIN_ID, pairingMessage } from "../../src/pairing.js";
import type { Protector } from "../../src/protect.js";
import { openKeystoreSigner } from "../../src/signer.js";

// A reversible test-only protector. It is NOT production code and never leaves this test file.
const pad = Buffer.from("pairing-test-pad-not-a-secret-abcdef", "utf8");
const testProtector: Protector = {
  name: "test-xor",
  async protect(plaintext) {
    return Buffer.from(plaintext).map((byte, index) => byte ^ (pad[index % pad.length] ?? 0));
  },
  async unprotect(ciphertext) {
    return Buffer.from(ciphertext).map((byte, index) => byte ^ (pad[index % pad.length] ?? 0));
  },
};

const NONCE = "ab".repeat(32);
const ORIGIN = "https://pqtabs.vercel.app";
const EXPIRES = "2026-10-13T12:05:00.000Z";
const NOW = Date.parse("2026-10-13T12:00:00.000Z") / 1000;

/** The same text the page builds in frontend/src/components/pqtabs/developers/pairing.ts. Change both or neither. */
const VECTOR = [
  "PQTABS agent pairing",
  "Agent: 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  "Origin: https://pqtabs.vercel.app",
  "Chain ID: 5042",
  `Nonce: ${NONCE}`,
  "Expires at: 2026-10-13T12:05:00.000Z",
  "This signature proves that this device controls the agent key. It does not authorize any payment or capability. A capability still needs its own root signature.",
].join("\n");

describe("pairing message", () => {
  it("is the fixed template, bound to the agent, origin, nonce, expiry, and Arc", () => {
    assert.equal(PAIRING_CHAIN_ID, 5042);
    assert.equal(
      pairingMessage({ agent: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf", origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES }),
      VECTOR,
    );
  });
});

describe("pairing request checks", () => {
  const base = { agent: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf", origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES };

  it("accepts an https origin and a local development origin", () => {
    assert.equal(assertPairingRequest(base, NOW).origin, ORIGIN);
    assert.equal(assertPairingRequest({ ...base, origin: "http://localhost:3000" }, NOW).origin, "http://localhost:3000");
  });

  it("refuses plain http, paths, trailing slashes, and other schemes", () => {
    for (const origin of ["http://pqtabs.example", "https://pqtabs.vercel.app/", "https://pqtabs.vercel.app/app", "javascript:alert(1)"]) {
      assert.throws(
        () => assertPairingRequest({ ...base, origin }, NOW),
        (error: unknown) => error instanceof SignerError && error.code === "bad_pairing",
        origin,
      );
    }
  });

  it("refuses a nonce that is not 32 lowercase random bytes", () => {
    for (const nonce of ["ab".repeat(31), "AB".repeat(32), `0x${"ab".repeat(32)}`]) {
      assert.throws(() => assertPairingRequest({ ...base, nonce }, NOW), (error: unknown) => error instanceof SignerError && error.code === "bad_pairing");
    }
  });

  it("refuses an expiry that is not canonical, already past, or more than ten minutes away", () => {
    assert.throws(() => assertPairingRequest({ ...base, expiresAt: "2026-10-13T12:05:00Z" }, NOW), /canonical/);
    assert.throws(
      () => assertPairingRequest({ ...base, expiresAt: "2026-10-13T11:59:59.000Z" }, NOW),
      (error: unknown) => error instanceof SignerError && error.code === "pairing_expired",
    );
    assert.throws(
      () => assertPairingRequest({ ...base, expiresAt: "2026-10-13T12:20:00.000Z" }, NOW),
      (error: unknown) => error instanceof SignerError && error.code === "bad_pairing",
    );
  });

  it("refuses an agent that is not an Ethereum address", () => {
    assert.throws(() => assertPairingRequest({ ...base, agent: "0x1234" }, NOW), /valid Ethereum address/);
  });
});

describe("signing a pairing", () => {
  let dir: string;
  let agent: Address;
  const key = generatePrivateKey();

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "pqtabs-pairing-"));
    agent = privateKeyToAccount(key).address;
    await saveAgentKey({ dir, agent, privateKey: key, protector: testProtector, replace: false });
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces a signature that recovers to the agent for exactly this message", async () => {
    const signer = await openKeystoreSigner({ dir, agent, protector: testProtector });
    const signature = await signer.signPairing({ agent, origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES }, NOW);
    const message = pairingMessage({ agent, origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES });
    assert.equal(await verifyMessage({ address: agent, message, signature }), true);
    const otherOrigin = pairingMessage({ agent, origin: "https://evil.example", nonce: NONCE, expiresAt: EXPIRES });
    assert.equal(await verifyMessage({ address: agent, message: otherOrigin, signature }), false, "a pairing never transfers to another origin");
  });

  it("refuses to pair for an agent this key does not hold", async () => {
    const signer = await openKeystoreSigner({ dir, agent, protector: testProtector });
    const stranger = "0x1111111111111111111111111111111111111111";
    await assert.rejects(
      () => signer.signPairing({ agent: stranger, origin: ORIGIN, nonce: NONCE, expiresAt: EXPIRES }, NOW),
      (error: unknown) => error instanceof SignerError && error.code === "address_mismatch",
    );
  });

  it("exposes only fixed-format signing methods, never a generic message or raw-hash signer", async () => {
    const signer = await openKeystoreSigner({ dir, agent, protector: testProtector });
    assert.deepEqual(Object.keys(signer).sort(), ["address", "signPairing", "signTransferAuthorization", "toJSON"]);
    assert.equal(JSON.stringify(signer).includes(key.slice(2)), false, "the key never serializes");
  });
});
