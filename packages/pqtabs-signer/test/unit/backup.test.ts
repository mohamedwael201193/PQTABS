import assert from "node:assert/strict";
import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { getAddress, type Hex, hexToBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openAgentBackup } from "../../src/backup.js";
import { SignerError } from "../../src/errors.js";

// Mirrors frontend/src/data/agent-vault.ts sealAgentBackup. The key is generated here and never printed.
function sealBackup(privateKey: Hex, address: string, passphrase: string, iterations = 210_000): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrapping = pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", wrapping, iv);
  const ciphertext = Buffer.concat([cipher.update(hexToBytes(privateKey)), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({
    format: "PQTABS-AGENT-1",
    address: getAddress(address),
    kdf: "PBKDF2-SHA-256",
    iterations,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof SignerError ? error.code : "unexpected";
  }
}

describe("openAgentBackup", () => {
  const passphrase = "correct horse battery";
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;

  it("opens a dashboard backup and returns the key that derives the named agent", () => {
    const opened = openAgentBackup(sealBackup(privateKey, address, passphrase), passphrase);
    assert.equal(opened.address, address);
    assert.equal(opened.privateKey, privateKey);
  });

  it("refuses a wrong passphrase with a human-readable code", () => {
    assert.equal(codeOf(() => openAgentBackup(sealBackup(privateKey, address, passphrase), "wrong passphrase")), "passphrase_wrong");
  });

  it("refuses a tampered ciphertext because the GCM tag fails", () => {
    const parsed = JSON.parse(sealBackup(privateKey, address, passphrase)) as { ciphertext: string };
    const bytes = Buffer.from(parsed.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = JSON.stringify({ ...parsed, ciphertext: bytes.toString("base64") });
    assert.equal(codeOf(() => openAgentBackup(tampered, passphrase)), "passphrase_wrong");
  });

  it("refuses a backup whose named address does not match its key", () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    assert.equal(codeOf(() => openAgentBackup(sealBackup(privateKey, other, passphrase), passphrase)), "backup_address_mismatch");
  });

  it("refuses files that are not PQTABS backups", () => {
    assert.equal(codeOf(() => openAgentBackup("not json", passphrase)), "backup_invalid");
    assert.equal(codeOf(() => openAgentBackup(JSON.stringify({ format: "other" }), passphrase)), "backup_invalid");
  });

  it("refuses iteration counts outside the supported range", () => {
    assert.equal(codeOf(() => openAgentBackup(sealBackup(privateKey, address, passphrase, 1_000), passphrase)), "backup_invalid");
    const tooMany = JSON.parse(sealBackup(privateKey, address, passphrase)) as Record<string, unknown>;
    tooMany.iterations = 5_000_000;
    assert.equal(codeOf(() => openAgentBackup(JSON.stringify(tooMany), passphrase)), "backup_invalid");
  });

  it("refuses a short passphrase before doing any work", () => {
    assert.equal(codeOf(() => openAgentBackup(sealBackup(privateKey, address, passphrase), "short")), "passphrase_short");
  });
});
