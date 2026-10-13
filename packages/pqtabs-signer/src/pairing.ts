import { type Address, getAddress } from "viem";
import { SignerError } from "./errors.js";

/**
 * Pairing proves that this machine holds the agent key that a page is about to trust. It is a plain EIP-191 message
 * signed by the agent. It is a different signing domain from the EIP-712 transfer authorization, so a pairing
 * signature can never be replayed as a payment. It authorizes nothing: a capability still needs its own root signature.
 */

export const PAIRING_CHAIN_ID = 5042;
/** A pairing request is valid for five minutes. The longest it may ever be is ten. */
export const PAIRING_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 600;

export type PairingRequest = {
  agent: Address;
  /** The page origin that asks for the pairing, for example https://pqtabs.vercel.app. Bound into the message. */
  origin: string;
  /** 32 random bytes, hex, issued by the page. Each pairing uses a new nonce. */
  nonce: string;
  /** Canonical ISO-8601 UTC time (Date.prototype.toISOString form). */
  expiresAt: string;
};

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

function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return (url.protocol === "https:" || local) && url.origin === origin;
}

/**
 * Refuses a pairing that is not short-lived, not bound to a clean origin, or not for this exact agent format.
 * `nowSeconds` is the current Unix time in seconds.
 */
export function assertPairingRequest(input: { agent: string; origin: string; nonce: string; expiresAt: string }, nowSeconds: number): PairingRequest {
  let agent: Address;
  try {
    agent = getAddress(input.agent);
  } catch {
    throw new SignerError("bad_pairing", "The agent address is not a valid Ethereum address.");
  }
  if (!isAllowedOrigin(input.origin)) {
    throw new SignerError("bad_pairing", "The origin must be https://host, or http://localhost, with no path.");
  }
  if (!/^[0-9a-f]{64}$/.test(input.nonce)) {
    throw new SignerError("bad_pairing", "The nonce must be 64 lowercase hex characters.");
  }
  const expiresMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresMs) || new Date(expiresMs).toISOString() !== input.expiresAt) {
    throw new SignerError("bad_pairing", "The expiry must be a canonical ISO-8601 UTC time.");
  }
  const remaining = expiresMs / 1000 - nowSeconds;
  if (remaining <= 0) throw new SignerError("pairing_expired", "This pairing request expired. Ask the page for a new one.");
  if (remaining > MAX_TTL_SECONDS) throw new SignerError("bad_pairing", "The pairing request lasts longer than ten minutes. Ask the page for a new one.");
  return { agent, origin: input.origin, nonce: input.nonce, expiresAt: input.expiresAt };
}
