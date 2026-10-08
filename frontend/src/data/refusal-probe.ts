export const UNAVAILABLE_SERVICE_URL = "https://service.invalid/v1/chat/completions";

const USDC = "0x3600000000000000000000000000000000000000";
const ARC = "eip155:5042";
const RESOURCE = "https://arcrouter.co/v1/chat/completions";
const OTHER_PAYEE = "0x0000000000000000000000000000000000000001";

export type ProbeName = "wrong_payee" | "above_per_payment" | "above_balance" | "wrong_network";

/** The raw amount for one refusal check. Null when the live limits cannot separate that case. */
export function probeAmount(name: ProbeName, maxPerCall: string, balance: string): string | null {
  if (!/^[0-9]+$/.test(maxPerCall) || !/^[0-9]+$/.test(balance)) return null;
  const max = BigInt(maxPerCall);
  const remaining = BigInt(balance);
  if (name === "above_per_payment") return (max + 1n).toString();
  if (name === "above_balance") {
    if (remaining >= max) return null;
    return (remaining + 1n).toString();
  }
  return "1";
}

/** A 402-shaped document. It is not a signature and it is not sent to the service. */
export function probePayment(name: ProbeName, payee: string, amount: string): {
  x402Version: 2;
  resource: { url: string };
  accepts: Array<Record<string, unknown>>;
} {
  return {
    x402Version: 2,
    resource: { url: RESOURCE },
    accepts: [
      {
        scheme: "exact",
        network: name === "wrong_network" ? "eip155:1" : ARC,
        asset: USDC,
        amount,
        payTo: name === "wrong_payee" ? OTHER_PAYEE : payee,
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2" },
      },
    ],
  };
}

export type ProbeBody = {
  decision?: unknown;
  reason?: unknown;
  error?: unknown;
  detail?: unknown;
  hash?: unknown;
  transaction?: unknown;
  tx?: unknown;
};

function tx(body: ProbeBody): string {
  for (const value of [body.hash, body.transaction, body.tx]) {
    if (typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  }
  return "";
}

/** A refusal with no transaction. An allow, or any hash, is not a blocked check. */
export function probeRefusal(
  status: number,
  body: ProbeBody | null,
): { decision: "REFUSE" | "NO_PAYMENT"; reason: string[] } | null {
  if (!body || tx(body)) return null;
  if (body.decision === "ALLOW") return null;
  if ((status === 200 && body.decision === "REFUSE") || body.decision === "NO_PAYMENT") {
    const reason = Array.isArray(body.reason) ? body.reason.filter((item): item is string => typeof item === "string") : [];
    if (reason.length === 0) return null;
    return { decision: body.decision, reason };
  }
  if (status === 400 && body.error === "bad_signature_length") {
    return { decision: "REFUSE", reason: ["bad_signature_length"] };
  }
  if (status === 400 && body.error === "policy_refused" && body.detail === "no_arc_exact") {
    return { decision: "NO_PAYMENT", reason: ["no_arc_exact"] };
  }
  if (status === 400 && body.error === "policy_refused" && body.detail === "wrong_agent") {
    return { decision: "REFUSE", reason: ["wrong_agent"] };
  }
  return null;
}

/** True while Arc's clock is still before the capability expiry. A bad clock or expiry is not a payment. */
export function expiryStillOpen(now: number, expiry: number): boolean {
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Could not read Arc's clock. Nothing was signed.");
  if (!Number.isSafeInteger(expiry) || expiry <= 0) throw new Error("The capability expiry could not be read. Nothing was signed.");
  return now < expiry;
}

/** A real policy refusal whose reason is expiry, with no transaction. */
export function expiredRefusal(
  status: number,
  body: ProbeBody | null,
): { decision: "REFUSE"; reason: string[] } | null {
  const outcome = probeRefusal(status, body);
  if (!outcome || outcome.decision !== "REFUSE" || !outcome.reason.includes("expired")) return null;
  return { decision: "REFUSE", reason: outcome.reason };
}

/** An Arc exact requirement for the capability's own recipient. It is not a signature. */
export function capabilityPayment(payee: string, amount: string) {
  return probePayment("above_balance", payee, amount);
}

/** A service that never returned HTTP 402. A priced 402 is not this check. */
export function unavailableServiceRefusal(status: number | null): { decision: "NO_PAYMENT"; reason: ["service_unavailable"] } | null {
  if (status === 402) return null;
  if (status !== null && status < 500) return null;
  return { decision: "NO_PAYMENT", reason: ["service_unavailable"] };
}

export type SpentAuthorization = { from: string; to: string; value: string; nonce: string };

/** The nonce inside a mined USDC transferWithAuthorization. Any other call is not a replay. */
export function spentAuthorization(input: string): SpentAuthorization | null {
  const body = input.toLowerCase().replace(/^0x/, "");
  if (!body.startsWith("cf092995") || body.length < 8 + 64 * 6) return null;
  const word = (index: number) => body.slice(8 + index * 64, 8 + (index + 1) * 64);
  const fromWord = word(0);
  const toWord = word(1);
  const valueWord = word(2);
  const nonce = word(5);
  if (!fromWord.startsWith("0".repeat(24)) || !toWord.startsWith("0".repeat(24))) return null;
  return {
    from: `0x${fromWord.slice(24)}`,
    to: `0x${toWord.slice(24)}`,
    value: BigInt(`0x${valueWord}`).toString(),
    nonce: `0x${nonce}`,
  };
}

/** A used authorization cannot be paid again. An unused nonce is not reported as a replay. */
export function replayRefusal(used: boolean): { decision: "REFUSE"; reason: ["replay"] } | null {
  if (!used) return null;
  return { decision: "REFUSE", reason: ["replay"] };
}
