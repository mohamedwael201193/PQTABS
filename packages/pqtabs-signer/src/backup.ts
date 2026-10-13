import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { type Address, getAddress, type Hex, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SignerError } from "./errors.js";

/**
 * Opens a PQTABS agent backup file, the encrypted JSON that the dashboard's "Export agent backup" writes.
 * The format matches frontend/src/data/agent-vault.ts: PBKDF2-SHA-256 with a random salt, then AES-256-GCM
 * over the 32-byte key. The GCM tag is the last 16 bytes of the ciphertext, as WebCrypto appends it.
 */
export const BACKUP_FORMAT = "PQTABS-AGENT-1";
const BACKUP_KDF = "PBKDF2-SHA-256";
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 1_000_000;
const TAG_BYTES = 16;

export type OpenedBackup = { address: Address; privateKey: Hex };

type BackupFile = {
  format: string;
  address: string;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

/** Decrypts a backup. Any problem throws a SignerError. The passphrase is never echoed or stored. */
export function openAgentBackup(fileText: string, passphrase: string): OpenedBackup {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(fileText) as BackupFile;
  } catch {
    throw new SignerError("backup_invalid", "This file is not a PQTABS agent backup.");
  }
  if (parsed.format !== BACKUP_FORMAT || parsed.kdf !== BACKUP_KDF) {
    throw new SignerError("backup_invalid", "This file is not a PQTABS agent backup.");
  }
  const iterations = Number(parsed.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new SignerError("backup_invalid", "This backup uses an unsupported passphrase setup.");
  }
  let expectedAddress: Address;
  try {
    expectedAddress = getAddress(String(parsed.address));
  } catch {
    throw new SignerError("backup_invalid", "This backup does not name a valid agent address.");
  }
  if (passphrase.length < 8) {
    throw new SignerError("passphrase_short", "The backup passphrase is at least 8 characters.");
  }

  const salt = Buffer.from(String(parsed.salt), "base64");
  const iv = Buffer.from(String(parsed.iv), "base64");
  const sealed = Buffer.from(String(parsed.ciphertext), "base64");
  if (salt.length !== 16 || iv.length !== 12 || sealed.length <= TAG_BYTES) {
    throw new SignerError("backup_invalid", "This backup is damaged.");
  }

  const wrapping = pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, iterations, 32, "sha256");
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv("aes-256-gcm", wrapping, iv);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    plaintext = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]);
  } catch {
    throw new SignerError("passphrase_wrong", "That passphrase did not open this backup.");
  }
  if (plaintext.length !== 32) {
    throw new SignerError("backup_invalid", "This backup does not contain a 32-byte agent key.");
  }
  const privateKey = toHex(new Uint8Array(plaintext));
  plaintext.fill(0);
  const address = privateKeyToAccount(privateKey).address;
  if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new SignerError("backup_address_mismatch", "This backup does not match the agent it names.");
  }
  return { address, privateKey };
}
