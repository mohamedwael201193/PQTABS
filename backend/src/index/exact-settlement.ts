import { USDC } from "../constants.js";

/** Circle's facilitator documents this CAIP-2 id for Arc mainnet. Not advertised on the live quote. */
export const EXACT_NETWORK = "eip155:5042";

export type ExactAccept = {
  scheme: "exact";
  network: typeof EXACT_NETWORK;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: "USDC"; version: "2"; quoteId: string; bodyHash: string; assetTransferMethod: "eip3009" };
};

/** Arclight settled an unmodified EIP-3009 payload on Arc. Arcus rejected that same signature. */
export const DEFAULT_EXACT_FACILITATOR = "https://x402.arclight.finance";

export type SettlementReport = {
  status: string;
  network: string;
  asset: string;
  payee: string;
  amount: string;
  txHash: string;
  quoteId: string;
};

export type SettlementVerdict =
  | { ok: true }
  | { ok: false; reason: "failed" | "wrong_network" | "wrong_asset" | "wrong_payee" | "underpayment" | "wrong_quote" | "expired" | "replay" | "bad_tx" };

/** The standard exact row for one research quote. */
export function exactAccept(input: {
  id: string;
  bodyHash: string;
  price: string;
  payee: string;
  ttlSeconds: number;
}): ExactAccept {
  return {
    scheme: "exact",
    network: EXACT_NETWORK,
    asset: USDC,
    amount: input.price,
    payTo: input.payee,
    maxTimeoutSeconds: input.ttlSeconds,
    extra: { name: "USDC", version: "2", quoteId: input.id, bodyHash: input.bodyHash, assetTransferMethod: "eip3009" },
  };
}

/** Check a facilitator settlement against the quote. `seen` holds tx hashes already accepted. */
export function checkSettlement(
  expected: { quoteId: string; payee: string; amount: string; expiresAt: number; now: number },
  report: SettlementReport,
  seen: ReadonlySet<string>,
): SettlementVerdict {
  if (report.status !== "completed") return { ok: false, reason: "failed" };
  if (expected.now > expected.expiresAt) return { ok: false, reason: "expired" };
  if (report.network !== EXACT_NETWORK) return { ok: false, reason: "wrong_network" };
  if (report.asset.toLowerCase() !== USDC.toLowerCase()) return { ok: false, reason: "wrong_asset" };
  if (report.payee.toLowerCase() !== expected.payee.toLowerCase()) return { ok: false, reason: "wrong_payee" };
  if (!/^[0-9]+$/.test(report.amount) || BigInt(report.amount) < BigInt(expected.amount)) {
    return { ok: false, reason: "underpayment" };
  }
  if (report.quoteId !== expected.quoteId) return { ok: false, reason: "wrong_quote" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(report.txHash)) return { ok: false, reason: "bad_tx" };
  if (seen.has(report.txHash.toLowerCase())) return { ok: false, reason: "replay" };
  return { ok: true };
}

export function exactFacilitator(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.X402_EXACT_FACILITATOR?.trim() || DEFAULT_EXACT_FACILITATOR;
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(raw)) return DEFAULT_EXACT_FACILITATOR;
  return raw.replace(/\/$/, "");
}

export type FacilitatorSettlement =
  | { ok: true; transaction: string; payer: string }
  | { ok: false; reason: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** The payer in an exact payload, when that payload pays this quote. */
export function exactPayer(paymentPayload: unknown, requirements: ExactAccept): string | null {
  const body = asRecord(paymentPayload);
  const payload = asRecord(body?.payload);
  const authorization = asRecord(payload?.authorization);
  if (!authorization) return null;
  const from = typeof authorization.from === "string" ? authorization.from : "";
  const to = typeof authorization.to === "string" ? authorization.to : "";
  const value = typeof authorization.value === "string" ? authorization.value : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(from) || !/^0x[0-9a-fA-F]{40}$/.test(to)) return null;
  if (to.toLowerCase() !== requirements.payTo.toLowerCase()) return null;
  if (value !== requirements.amount) return null;
  return from;
}

/** POST the client's exact payload to the facilitator. A verify response is not a payment. */
export async function settleWithFacilitator(
  requirements: ExactAccept,
  paymentPayload: unknown,
  fetchImpl: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FacilitatorSettlement> {
  const base = exactFacilitator(env);
  const body = JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements });
  const headers = { "content-type": "application/json", accept: "application/json" };
  const verified = await fetchImpl(`${base}/verify`, { method: "POST", headers, body });
  const verifyBody = (await verified.json().catch(() => null)) as { isValid?: boolean; invalidReason?: string } | null;
  if (!verified.ok || verifyBody?.isValid !== true) {
    return { ok: false, reason: verifyBody?.invalidReason || "verify_rejected" };
  }
  const settled = await fetchImpl(`${base}/settle`, { method: "POST", headers, body });
  const settleBody = (await settled.json().catch(() => null)) as { success?: boolean; transaction?: string; payer?: string; errorReason?: string } | null;
  const tx = settleBody?.transaction ?? "";
  if (!settled.ok || settleBody?.success !== true || !/^0x[0-9a-fA-F]{64}$/.test(tx)) {
    return { ok: false, reason: settleBody?.errorReason || "not_settled" };
  }
  return { ok: true, transaction: tx, payer: typeof settleBody?.payer === "string" ? settleBody.payer : "" };
}
