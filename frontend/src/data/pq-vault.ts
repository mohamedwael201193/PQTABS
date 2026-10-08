"use client";

/**
 * The browser holds the PQ signing key in memory after the user creates it
 * or unlocks a PQTABS1 backup. The key is never sent to the backend.
 * Signing uses signer/wasm, which calls the same sign_digest as the CLI.
 */

type WasmSigner = {
  default: (input?: { module_or_path?: string }) => Promise<unknown>;
  keygen_json: () => string;
  sign_hex: (signingKeyHex: string, digestHex: string) => string;
  backup_encrypt_hex: (passphrase: string, plaintext: string) => string;
  backup_decrypt_utf8: (passphrase: string, blobHex: string) => string;
};

type RootMaterial = {
  signingKeyHex: string;
  verifyingKeyHex: string;
  registrar: string;
};

function material(json: string, registrar: string): RootMaterial {
  const parsed = JSON.parse(json) as { signing_key_hex?: string; verifying_key_hex?: string };
  if (!parsed.signing_key_hex || !parsed.verifying_key_hex) {
    throw new Error("That file is not a PQTABS security key.");
  }
  if (!registrar) throw new Error("Connect a wallet before unlocking a security key.");
  return { signingKeyHex: parsed.signing_key_hex, verifyingKeyHex: parsed.verifying_key_hex, registrar };
}

let unlocked: RootMaterial | null = null;
let creating: Promise<{ verifyingKey: string; backup: Blob }> | null = null;

export const ROOT_IDLE_MS = 30 * 60 * 1000;
export type RootSessionState = "LOCKED" | "UNLOCKING" | "UNLOCKED" | "EXPIRED";

let idleLimit = ROOT_IDLE_MS;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let session: RootSessionState = "LOCKED";
const sessionListeners = new Set<() => void>();

function publish(next: RootSessionState): void {
  session = next;
  for (const listener of sessionListeners) listener();
}

export function rootSession(): RootSessionState {
  return session;
}

export function subscribeRootSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

export function setRootIdleMs(ms: number): void {
  idleLimit = ms;
}

function armIdle(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    unlocked = null;
    idleTimer = null;
    publish("EXPIRED");
  }, idleLimit);
}

function markUnlocked(): void {
  publish("UNLOCKED");
  armIdle();
}

function restoreSession(): void {
  if (unlocked) markUnlocked();
  else publish("LOCKED");
}

function holds(registrar: string): boolean {
  return Boolean(registrar) && unlocked !== null && unlocked.registrar.toLowerCase() === registrar.toLowerCase();
}
let loading: Promise<WasmSigner> | null = null;

async function signer(): Promise<WasmSigner> {
  if (!loading) {
    loading = import("@/lib/pq/pqtabs_sign_wasm.js").then(async (mod) => {
      const api = mod as unknown as WasmSigner;
      await api.default({ module_or_path: "/pq/pqtabs_sign_wasm_bg.wasm" });
      return api;
    });
  }
  return loading;
}

export function rootUnlocked(registrar: string): boolean {
  return holds(registrar);
}

export function verifyingKey(registrar: string): string | null {
  return holds(registrar) && unlocked ? `0x${unlocked.verifyingKeyHex}` : null;
}

export function lockRoot(): void {
  unlocked = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  publish("LOCKED");
}

export function noteRootActivity(): void {
  if (session === "UNLOCKED" && unlocked) armIdle();
}

export function createRootKey(registrar: string, passphrase: string): Promise<{ verifyingKey: string; backup: Blob }> {
  if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters. It never leaves this device.");
  if (holds(registrar)) {
    throw new Error("This browser session already holds this wallet's security key. Use the backup that was just saved.");
  }
  if (creating) return creating;
  creating = mintRootKey(registrar, passphrase).finally(() => {
    creating = null;
  });
  return creating;
}

async function mintRootKey(registrar: string, passphrase: string): Promise<{ verifyingKey: string; backup: Blob }> {
  const api = await signer();
  const json = api.keygen_json();
  const parsed = material(json, registrar);
  const blobHex = api.backup_encrypt_hex(passphrase, json);
  const bytes = hexToBytes(blobHex);
  unlocked = parsed;
  markUnlocked();
  return {
    verifyingKey: `0x${parsed.verifyingKeyHex}`,
    backup: new Blob([bytes.slice()], { type: "application/octet-stream" }),
  };
}

export async function unlockBackup(registrar: string, file: ArrayBuffer, passphrase: string): Promise<string> {
  publish("UNLOCKING");
  try {
    const api = await signer();
    const json = api.backup_decrypt_utf8(passphrase, bytesToHex(new Uint8Array(file)));
    const parsed = material(json, registrar);
    unlocked = parsed;
    markUnlocked();
    return `0x${parsed.verifyingKeyHex}`;
  } catch (error) {
    restoreSession();
    throw error;
  }
}

export async function signRootDigest(registrar: string, digestHex: string): Promise<string> {
  if (!holds(registrar) || !unlocked) throw new Error("Unlock your security key to authorize this.");
  noteRootActivity();
  const api = await signer();
  const signature = api.sign_hex(unlocked.signingKeyHex, digestHex.replace(/^0x/, ""));
  return signature.startsWith("0x") ? signature : `0x${signature}`;
}

function hexToBytes(hex: string): Uint8Array {
  const body = hex.replace(/^0x/, "");
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
