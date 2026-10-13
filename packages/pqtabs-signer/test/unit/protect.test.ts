import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignerError } from "../../src/errors.js";
import { dpapiProtector, platformProtector } from "../../src/protect.js";

describe("platformProtector", () => {
  it("names Windows DPAPI as the protector on Windows", () => {
    assert.equal(platformProtector("win32").name, "windows-dpapi-user");
  });

  it("fails closed on platforms without a tested key store", () => {
    assert.throws(
      () => platformProtector("linux"),
      (error: unknown) => error instanceof SignerError && error.code === "unsupported_platform",
    );
    assert.throws(
      () => platformProtector("darwin"),
      (error: unknown) => error instanceof SignerError && error.code === "unsupported_platform",
    );
  });
});

describe("dpapiProtector (real Windows DPAPI)", { skip: process.platform !== "win32" ? "Windows only" : false }, () => {
  it("round-trips bytes through DPAPI and never returns the plaintext as ciphertext", async () => {
    const protector = dpapiProtector();
    const plaintext = new Uint8Array(32).map((_, index) => index + 1);
    const sealed = await protector.protect(plaintext);
    assert.notDeepEqual(Buffer.from(sealed), Buffer.from(plaintext));
    const opened = await protector.unprotect(sealed);
    assert.deepEqual(Buffer.from(opened), Buffer.from(plaintext));
  });

  it("refuses to unlock tampered ciphertext", async () => {
    const protector = dpapiProtector();
    const sealed = await protector.protect(new Uint8Array(32).fill(9));
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0xff;
    await assert.rejects(
      protector.unprotect(tampered),
      (error: unknown) => error instanceof SignerError && error.code === "unlock_failed",
    );
  });
});
