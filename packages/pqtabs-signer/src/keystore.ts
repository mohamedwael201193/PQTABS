import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Address, getAddress, type Hex, hexToBytes, isHex, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { SignerError } from "./errors.js";
import type { Protector } from "./protect.js";

export const STORE_FORMAT = "PQTABS-SIGNER-1";

/**
 * Where protected agent keys live. The file name is the public agent address, so the directory never reveals
 * key material by listing alone. Contents are the protector's ciphertext, never plaintext.
 */
export function defaultKeyDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.PQTABS_SIGNER_DIR) return env.PQTABS_SIGNER_DIR;
  if (platform === "win32") {
    const base = env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(base, "pqtabs-signer", "keys");
  }
  return join(homedir(), ".pqtabs-signer", "keys");
}

type StoredRecord = {
  format: string;
  agent: string;
  protector: string;
  createdAt: string;
  ciphertext: string;
};

function fileFor(dir: string, agent: Address): string {
  return join(dir, `${agent.toLowerCase()}.json`);
}

function checksum(value: string): Address {
  try {
    return getAddress(value);
  } catch {
    throw new SignerError("invalid_address", "That is not a valid Ethereum address.");
  }
}

/** Stores a key only after its derived address matches `agent`. Refuses to overwrite unless `replace` is set. */
export async function saveAgentKey(options: {
  dir: string;
  agent: string;
  privateKey: Hex;
  protector: Protector;
  replace?: boolean;
  now?: Date;
}): Promise<Address> {
  const agent = checksum(options.agent);
  if (!isHex(options.privateKey) || options.privateKey.length !== 66) {
    throw new SignerError("invalid_key", "The agent key must be a 32-byte hex string.");
  }
  const derived = privateKeyToAccount(options.privateKey).address;
  if (derived.toLowerCase() !== agent.toLowerCase()) {
    throw new SignerError("address_mismatch", `The key derives ${derived}, not ${agent}. Nothing was stored.`);
  }
  await mkdir(options.dir, { recursive: true, mode: 0o700 });
  const target = fileFor(options.dir, agent);
  if (!options.replace && (await exists(target))) {
    throw new SignerError("already_stored", "A key for this agent is already stored on this machine. Use replace to overwrite it.");
  }
  const sealed = await options.protector.protect(hexToBytes(options.privateKey));
  const record: StoredRecord = {
    format: STORE_FORMAT,
    agent,
    protector: options.protector.name,
    createdAt: (options.now ?? new Date()).toISOString(),
    ciphertext: Buffer.from(sealed).toString("base64"),
  };
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600, flag: "w" });
  await rename(temp, target);
  await chmod(target, 0o600).catch(() => undefined);
  return agent;
}

/** Unlocks a stored key and returns it in memory only. Any mismatch fails closed. */
export async function loadAgentKey(options: { dir: string; agent: string; protector: Protector }): Promise<Hex> {
  const agent = checksum(options.agent);
  const target = fileFor(options.dir, agent);
  let text: string;
  try {
    text = await readFile(target, "utf8");
  } catch {
    throw new SignerError("not_stored", "No key for this agent is stored on this machine.");
  }
  let record: StoredRecord;
  try {
    record = JSON.parse(text) as StoredRecord;
  } catch {
    throw new SignerError("store_corrupt", "The stored key file is damaged. Nothing was used.");
  }
  if (record.format !== STORE_FORMAT || String(record.agent).toLowerCase() !== agent.toLowerCase()) {
    throw new SignerError("store_corrupt", "The stored key file does not belong to this agent. Nothing was used.");
  }
  if (record.protector !== options.protector.name) {
    throw new SignerError("protector_mismatch", "This key was protected by a different method. Nothing was used.");
  }
  const plaintext = await options.protector.unprotect(Buffer.from(record.ciphertext, "base64"));
  if (plaintext.length !== 32) {
    throw new SignerError("store_corrupt", "The unlocked key is not 32 bytes. Nothing was used.");
  }
  const key = toHex(new Uint8Array(plaintext));
  plaintext.fill(0);
  const derived = privateKeyToAccount(key).address;
  if (derived.toLowerCase() !== agent.toLowerCase()) {
    throw new SignerError("address_mismatch", "The stored key does not derive this agent. Nothing was used.");
  }
  return key;
}

/** Lists stored agent addresses without unlocking any key. */
export async function storedAgents(dir: string): Promise<Address[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const agents: Address[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const candidate = name.slice(0, -5);
    if (/^0x[0-9a-f]{40}$/.test(candidate)) agents.push(getAddress(candidate));
  }
  return agents.sort();
}

export async function removeAgentKey(options: { dir: string; agent: string }): Promise<boolean> {
  const agent = checksum(options.agent);
  const target = fileFor(options.dir, agent);
  if (!(await exists(target))) return false;
  await rm(target, { force: true });
  return true;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
