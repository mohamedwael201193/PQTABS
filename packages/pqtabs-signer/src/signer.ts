import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { assertSignableAuthorization, type TransferAuthorization, transferTypedData } from "./authorization.js";
import { SignerError } from "./errors.js";
import { loadAgentKey } from "./keystore.js";
import type { Protector } from "./protect.js";

/** The agent's signing boundary. The key stays inside the closure and is never a property of this object. */
export interface AgentSigner {
  readonly address: Address;
  signTransferAuthorization(authorization: TransferAuthorization, now?: bigint): Promise<Hex>;
  toJSON(): { address: Address };
}

/**
 * Unlocks the stored key for `agent` and returns a signer. Fails closed if the key is missing, cannot be unlocked,
 * or does not derive `agent`. The returned signer exposes only the address and a signing method.
 */
export async function openKeystoreSigner(options: { dir: string; agent: string; protector: Protector }): Promise<AgentSigner> {
  const key = await loadAgentKey(options);
  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    async signTransferAuthorization(authorization, now) {
      assertSignableAuthorization(authorization, now ?? BigInt(Math.floor(Date.now() / 1000)));
      return account.signTypedData(transferTypedData(authorization));
    },
    toJSON() {
      return { address: account.address };
    },
  };
}

/** Parses the JSON that the `sign` command reads from stdin. Values arrive as decimal or hex strings. */
export function parseAuthorizationJson(text: string): TransferAuthorization {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SignerError("bad_authorization", "The authorization is not valid JSON.");
  }
  const big = (key: string): bigint => {
    const value = raw[key];
    if (typeof value !== "string" && typeof value !== "number") throw new SignerError("bad_authorization", `The field ${key} is missing.`);
    return BigInt(value);
  };
  return {
    chainId: Number(raw.chainId),
    asset: raw.asset as Address,
    from: raw.from as Address,
    to: raw.to as Address,
    value: big("value"),
    validAfter: big("validAfter"),
    validBefore: big("validBefore"),
    nonce: raw.nonce as Hex,
  };
}