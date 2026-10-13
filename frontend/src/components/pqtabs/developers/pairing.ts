import { type Address, getAddress, type Hex, verifyMessage } from "viem";

/**
 * Pairing proves that the local signer for one public agent address is on this machine and is the one the page
 * is about to trust. The browser never sees a key. It issues a one-time nonce, the user signs it with
 * `pqtabs-signer pair`, and the browser recovers the signer address from the returned signature.
 *
 * A pairing authorizes nothing. A capability still needs its own root signature in the PQTABS app.
 */

export const PAIRING_CHAIN_ID = 5042;
export const PAIRING_TTL_MS = 5 * 60 * 1000;

export type PairingRequest = {
  agent: Address;
  /** The exact origin of this page. The signer binds it into the message, so a pairing cannot move to another site. */
  origin: string;
  /** 64 lowercase hex characters, from 32 random bytes. */
  nonce: string;
  /** Canonical ISO-8601 UTC time (Date.prototype.toISOString form). */
  expiresAt: string;
};

/** The same text the signer builds in packages/pqtabs-signer/src/pairing.ts. Change both or neither. */
export function pairingMessage(request: PairingRequest): string {
  return [
    "PQTABS agent pairing",
    `Agent: ${request.agent}`,
    `Origin: ${request.origin}`,
    `Chain ID: ${PAIRING_CHAIN_ID}`,
    `Nonce: ${request.nonce}`,
    `Expires at: ${request.expiresAt}`,
    "This signature proves that this device controls the agent key. It does not authorize any payment or capability. A capability still needs its own root signature.",
  ].join("\n");
}

export function newPairingRequest(input: { agent: string; origin: string; nowMs: number; random?: (length: number) => Uint8Array }): PairingRequest {
  const random = input.random ?? ((length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)));
  const nonce = Array.from(random(32), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    agent: getAddress(input.agent),
    origin: input.origin,
    nonce,
    expiresAt: new Date(input.nowMs + PAIRING_TTL_MS).toISOString(),
  };
}

/** The command a developer runs on the machine that holds the key. The path is the signer's CLI. */
export function pairingCommand(request: PairingRequest, signerPath = "<path to packages/pqtabs-signer/dist/src/cli.js>"): string {
  return `node "${signerPath}" pair --agent ${request.agent} --origin ${request.origin} --nonce ${request.nonce} --expires ${request.expiresAt}`;
}

/** Accepts the raw signature, or the JSON that `pqtabs-signer pair` prints. Returns null for anything else. */
export function extractSignature(text: string): Hex | null {
  const trimmed = text.trim();
  let candidate = trimmed;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { signature?: unknown };
      candidate = typeof parsed.signature === "string" ? parsed.signature.trim() : "";
    } catch {
      return null;
    }
  }
  return /^0x[0-9a-fA-F]{130}$/.test(candidate) ? (candidate as Hex) : null;
}

export type PairingCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "wrong_origin" | "malformed_signature" | "not_signed_by_agent" };

/** Checks the time, the page origin, and the signature. Nothing here touches a key or the network. */
export async function verifyPairing(input: { request: PairingRequest; signature: string; pageOrigin: string; nowMs: number }): Promise<PairingCheck> {
  if (input.nowMs >= Date.parse(input.request.expiresAt)) return { ok: false, reason: "expired" };
  if (input.pageOrigin !== input.request.origin) return { ok: false, reason: "wrong_origin" };
  const signature = extractSignature(input.signature);
  if (!signature) return { ok: false, reason: "malformed_signature" };
  try {
    const valid = await verifyMessage({
      address: input.request.agent,
      message: pairingMessage(input.request),
      signature,
    });
    return valid ? { ok: true } : { ok: false, reason: "not_signed_by_agent" };
  } catch {
    return { ok: false, reason: "malformed_signature" };
  }
}
