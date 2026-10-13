import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { type Address, type Hex, recoverTypedDataAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_CHAIN_ID, ARC_USDC, type TransferAuthorization, transferTypedData } from "../../src/authorization.js";
import { SignerError } from "../../src/errors.js";
import { saveAgentKey } from "../../src/keystore.js";
import type { Protector } from "../../src/protect.js";
import { openKeystoreSigner, parseAuthorizationJson } from "../../src/signer.js";

// A reversible test-only protector. It is NOT production code and never leaves this test file.
const pad = Buffer.from("signer-test-pad-not-a-secret-abcdef", "utf8");
const testProtector: Protector = {
  name: "test-xor",
  async protect(plaintext) {
    return Buffer.from(plaintext).map((byte, index) => byte ^ (pad[index % pad.length] ?? 0));
  },
  async unprotect(ciphertext) {
    return Buffer.from(ciphertext).map((byte, index) => byte ^ (pad[index % pad.length] ?? 0));
  },
};

// The public, well-known test key 0x…01. It controls no funds and is used only to check derivation and signing.
const TEST_KEY: Hex = "0x0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ADDRESS: Address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

const NOW = 1_800_000_000n;
const TAB = "0x2E93a080a35F9355c4dBB90b8C637Ba9e2BFBE48" as Address;
const PAYEE = "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3" as Address;
const NONCE = `0x${"ab".repeat(32)}` as Hex;

function authorization(overrides: Partial<TransferAuthorization> = {}): TransferAuthorization {
  return {
    chainId: ARC_CHAIN_ID,
    asset: ARC_USDC,
    from: TAB,
    to: PAYEE,
    value: 360n,
    validAfter: 0n,
    validBefore: NOW + 600n,
    nonce: NONCE,
    ...overrides,
  };
}

async function refusalCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof SignerError ? error.code : "unexpected";
  }
}

describe("openKeystoreSigner", () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), "pqtabs-signer-sign-"));
    await saveAgentKey({ dir, agent: TEST_ADDRESS, privateKey: TEST_KEY, protector: testProtector });
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("derives the expected address from the stored key", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(signer.address, TEST_ADDRESS);
    assert.equal(privateKeyToAccount(TEST_KEY).address, TEST_ADDRESS);
  });

  it("produces a 65-byte signature that recovers to the agent address over the USDC EIP-3009 digest", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    const auth = authorization();
    const signature = await signer.signTransferAuthorization(auth, NOW);
    assert.equal(signature.length, 132);
    const recovered = await recoverTypedDataAddress({ ...transferTypedData(auth), signature });
    assert.equal(recovered, TEST_ADDRESS);
    const v = Number.parseInt(signature.slice(-2), 16);
    assert.ok(v === 27 || v === 28, "v must be canonical 27 or 28 for Barkeep");
  });

  it("does not expose the key through its object, JSON, or enumerable properties", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    const serialized = JSON.stringify(signer);
    assert.equal(serialized, JSON.stringify({ address: TEST_ADDRESS }));
    assert.equal(serialized.includes(TEST_KEY.slice(2)), false);
    for (const key of Object.keys(signer)) {
      const value = (signer as unknown as Record<string, unknown>)[key];
      assert.equal(typeof value === "string" && value.toLowerCase().includes(TEST_KEY.slice(2)), false);
    }
  });

  it("refuses a chain other than Arc Mainnet", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ chainId: 1 }), NOW)), "refused_chain");
  });

  it("refuses an asset other than Arc USDC", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    const other = "0x1111111111111111111111111111111111111111" as Address;
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ asset: other }), NOW)), "refused_asset");
  });

  it("refuses zero or oversized amounts", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ value: 0n }), NOW)), "refused_amount");
    const tooLarge = (1n << 256n);
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ value: tooLarge }), NOW)), "refused_amount");
  });

  it("refuses an inverted or empty validity window", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(
      await refusalCode(signer.signTransferAuthorization(authorization({ validAfter: 10n, validBefore: 10n }), NOW)),
      "refused_window",
    );
  });

  it("refuses an authorization that has already expired", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ validBefore: NOW }), NOW)), "refused_expired");
  });

  it("refuses a nonce that is not 32 bytes", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ nonce: "0x1234" as Hex }), NOW)), "refused_nonce");
  });

  it("refuses an invalid payee or tab address", async () => {
    const signer = await openKeystoreSigner({ dir, agent: TEST_ADDRESS, protector: testProtector });
    assert.equal(await refusalCode(signer.signTransferAuthorization(authorization({ to: "0xnope" as Address }), NOW)), "refused_address");
  });

  it("fails closed when no key is stored for the requested agent", async () => {
    const unknown = privateKeyToAccount(generatePrivateKey()).address;
    assert.equal(await refusalCode(openKeystoreSigner({ dir, agent: unknown, protector: testProtector })), "not_stored");
  });
});

describe("parseAuthorizationJson", () => {
  it("parses decimal strings into bigints and keeps the address fields", () => {
    const parsed = parseAuthorizationJson(
      JSON.stringify({
        chainId: 5042,
        asset: ARC_USDC,
        from: TAB,
        to: PAYEE,
        value: "360",
        validAfter: "0",
        validBefore: "1800000600",
        nonce: NONCE,
      }),
    );
    assert.equal(parsed.value, 360n);
    assert.equal(parsed.validBefore, 1800000600n);
    assert.equal(parsed.chainId, 5042);
  });

  it("rejects input that is not JSON or is missing an amount", () => {
    assert.throws(() => parseAuthorizationJson("{nope"), (error: unknown) => error instanceof SignerError && error.code === "bad_authorization");
    assert.throws(
      () => parseAuthorizationJson(JSON.stringify({ chainId: 5042 })),
      (error: unknown) => error instanceof SignerError && error.code === "bad_authorization",
    );
  });
});
