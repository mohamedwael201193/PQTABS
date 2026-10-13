import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Hex, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SignerError } from "../../src/errors.js";
import { loadAgentKey, removeAgentKey, saveAgentKey, storedAgents } from "../../src/keystore.js";
import type { Protector } from "../../src/protect.js";

// A reversible test-only protector. It is NOT production code and never leaves this test file.
const xorPad = Buffer.from("test-only-pad-not-a-secret-0123456789", "utf8");
const testProtector: Protector = {
  name: "test-xor",
  async protect(plaintext) {
    return Buffer.from(plaintext).map((byte, index) => byte ^ (xorPad[index % xorPad.length] ?? 0));
  },
  async unprotect(ciphertext) {
    return Buffer.from(ciphertext).map((byte, index) => byte ^ (xorPad[index % xorPad.length] ?? 0));
  },
};

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof SignerError ? error.code : "unexpected";
  }
}

describe("keystore", () => {
  let dir: string;
  const privateKey: Hex = generatePrivateKey();
  const agent = privateKeyToAccount(privateKey).address;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "pqtabs-signer-test-"));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores a key, unlocks it, and lists only the public address", async () => {
    await saveAgentKey({ dir, agent, privateKey, protector: testProtector });
    const unlocked = await loadAgentKey({ dir, agent, protector: testProtector });
    assert.equal(unlocked, privateKey);
    assert.deepEqual(await storedAgents(dir), [agent]);
  });

  it("never writes the plaintext key to disk", async () => {
    const files = await readdir(dir);
    for (const name of files) {
      const text = await readFile(join(dir, name), "utf8");
      assert.equal(text.includes(privateKey.slice(2)), false, `${name} contains key material`);
      assert.equal(text.toLowerCase().includes(privateKey.slice(2).toLowerCase()), false);
    }
  });

  it("refuses to store a key that derives a different address", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    assert.equal(await codeOf(saveAgentKey({ dir, agent: other, privateKey, protector: testProtector })), "address_mismatch");
    assert.equal((await storedAgents(dir)).some((a) => a.toLowerCase() === other.toLowerCase()), false);
  });

  it("refuses to overwrite without replace, and overwrites with it", async () => {
    assert.equal(await codeOf(saveAgentKey({ dir, agent, privateKey, protector: testProtector })), "already_stored");
    await saveAgentKey({ dir, agent, privateKey, protector: testProtector, replace: true });
    assert.equal(await loadAgentKey({ dir, agent, protector: testProtector }), privateKey);
  });

  it("refuses a malformed key before touching the store", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    assert.equal(await codeOf(saveAgentKey({ dir, agent: other, privateKey: "0x1234" as Hex, protector: testProtector })), "invalid_key");
  });

  it("fails closed when the key was protected by a different method", async () => {
    const otherMethod: Protector = { ...testProtector, name: "other-method" };
    assert.equal(await codeOf(loadAgentKey({ dir, agent, protector: otherMethod })), "protector_mismatch");
  });

  it("fails closed when the stored record names a different agent", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const target = join(dir, `${agent.toLowerCase()}.json`);
    const record = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
    const swapped = join(dir, `${other.toLowerCase()}.json`);
    await writeFile(swapped, JSON.stringify({ ...record, agent: other }));
    assert.equal(await codeOf(loadAgentKey({ dir, agent: other, protector: testProtector })), "address_mismatch");
    await rm(swapped, { force: true });
    await writeFile(target, JSON.stringify({ ...record, agent: other }));
    assert.equal(await codeOf(loadAgentKey({ dir, agent, protector: testProtector })), "store_corrupt");
    await writeFile(target, JSON.stringify(record));
  });

  it("fails closed when the unlocked bytes do not derive the agent", async () => {
    const wrongKey = toHex(new Uint8Array(32).fill(7));
    const otherProtector: Protector = {
      name: "test-xor",
      async protect(plaintext) {
        return testProtector.protect(plaintext);
      },
      async unprotect() {
        return testProtector.protect(Buffer.from(wrongKey.slice(2), "hex"));
      },
    };
    assert.equal(await codeOf(loadAgentKey({ dir, agent, protector: otherProtector })), "address_mismatch");
  });

  it("reports not_stored for an agent with no file", async () => {
    const unknown = privateKeyToAccount(generatePrivateKey()).address;
    assert.equal(await codeOf(loadAgentKey({ dir, agent: unknown, protector: testProtector })), "not_stored");
  });

  it("removes a stored key and reports whether it existed", async () => {
    assert.equal(await removeAgentKey({ dir, agent }), true);
    assert.equal(await removeAgentKey({ dir, agent }), false);
    assert.deepEqual(await storedAgents(dir), []);
  });
});
