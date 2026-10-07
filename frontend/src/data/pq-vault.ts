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
};

function material(json: string): RootMaterial {
  const parsed = JSON.parse(json) as { signing_key_hex?: string; verifying_key_hex?: string };
  if (!parsed.signing_key_hex || !parsed.verifying_key_hex) {
    throw new Error("That file is not a PQTABS security key.");
  }
  return { signingKeyHex: parsed.signing_key_hex, verifyingKeyHex: parsed.verifying_key_hex };
}

let unlocked: RootMaterial | null = null;
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

export function rootUnlocked(): boolean {
  return unlocked !== null;
}

export function verifyingKey(): string | null {
  return unlocked ? `0x${unlocked.verifyingKeyHex}` : null;
}

export function lockRoot(): void {
  unlocked = null;
}

export async function createRootKey(passphrase: string): Promise<{ verifyingKey: string; backup: Blob }> {
  if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters. It never leaves this device.");
  const api = await signer();
  const json = api.keygen_json();
  const parsed = material(json);
  unlocked = parsed;
  const blobHex = api.backup_encrypt_hex(passphrase, json);
  const bytes = hexToBytes(blobHex);
  return {
    verifyingKey: `0x${parsed.verifyingKeyHex}`,
    backup: new Blob([bytes], { type: "application/octet-stream" }),
  };
}

export async function unlockBackup(file: ArrayBuffer, passphrase: string): Promise<string> {
  const api = await signer();
  const json = api.backup_decrypt_utf8(passphrase, bytesToHex(new Uint8Array(file)));
  const parsed = material(json);
  unlocked = parsed;
  return `0x${parsed.verifyingKeyHex}`;
}

export async function signRootDigest(digestHex: string): Promise<string> {
  if (!unlocked) throw new Error("Unlock your security key to authorize this.");
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
