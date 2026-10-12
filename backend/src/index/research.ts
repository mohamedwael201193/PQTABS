import { type Address, getAddress, type Hex, keccak256, toBytes } from "viem";
import { USDC } from "../constants.js";
import { erc20SpendRaw } from "./usdc-event.js";

export const RESEARCH_SCHEME = "pqtabs-barkeep";
export const RESEARCH_MAX_TOKENS = 400;
export const RESEARCH_TTL_SECONDS = 600;
/**
 * Groq lists openai/gpt-oss-120b at $0.15 per 1M input tokens and $0.60 per 1M output tokens.
 * 800 input tokens are 120 raw USDC. 400 output tokens are 240 raw USDC. 360 raw is that ceiling.
 * It is not a measured provider invoice, and it does not raise the capability cap.
 */
export const DEFAULT_RESEARCH_TARIFF = 360n;
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const ARC_NETWORK = "eip155:5042";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export type ResearchQuote = {
  id: string;
  task: string;
  bodyHash: Hex;
  price: string;
  payee: Address;
  maxTokens: number;
  expiresAt: number;
  paymentRequired: ResearchPayment;
};

export type ResearchPayment = {
  x402Version: 2;
  scheme: typeof RESEARCH_SCHEME;
  standardExact: false;
  resource: { url: string; description: string };
  accepts: [ResearchAccept];
};

type ResearchAccept = {
  scheme: typeof RESEARCH_SCHEME;
  network: typeof ARC_NETWORK;
  asset: string;
  amount: string;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: {
    quoteId: string;
    bodyHash: Hex;
    service: "Arc Research";
    provider: "Groq";
    model: string;
    maxTokens: number;
    tariff: true;
    name: "USDC";
    version: "2";
  };
};

export type ParsedResearch = {
  quoteId: string;
  bodyHash: string;
  price: string;
  payee: string;
  expiresAt: number;
  maxTokens: number;
  resource: string;
};

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A configured receiving address that is not the relayer, the zero address, or another forbidden account. */
export function dedicatedPayee(raw: string | undefined, forbidden: readonly string[]): Address | null {
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw.trim())) return null;
  let address: Address;
  try {
    address = getAddress(raw.trim());
  } catch {
    return null;
  }
  if (address === "0x0000000000000000000000000000000000000000") return null;
  if (forbidden.some((item) => item.toLowerCase() === address.toLowerCase())) return null;
  return address;
}

export function researchIdentity(env: NodeJS.ProcessEnv = process.env): { provider: "Groq"; model: string } {
  const model = env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  return { provider: "Groq", model };
}

/** The published tariff in raw USDC. This is a bounded ceiling, not a measured Groq invoice. */
export function researchTariff(env: NodeJS.ProcessEnv = process.env): bigint {
  const raw = env.RESEARCH_PRICE_RAW?.trim() || DEFAULT_RESEARCH_TARIFF.toString();
  if (!/^[1-9][0-9]*$/.test(raw)) return DEFAULT_RESEARCH_TARIFF;
  return BigInt(raw);
}

export function researchBodyHash(task: string, price: string, payee: string, maxTokens: number): Hex {
  const canonical = JSON.stringify({ maxTokens, payee: payee.toLowerCase(), price, task: task.trim() });
  return keccak256(toBytes(canonical));
}

export function buildResearchQuote(input: {
  id: string;
  task: string;
  payee: Address;
  price: bigint;
  now: number;
  resourceUrl: string;
}): ResearchQuote {
  const task = input.task.trim();
  if (!task || task.length > 2_000) throw new Error("task_length");
  if (input.price <= 0n) throw new Error("bad_price");
  const price = input.price.toString();
  const identity = researchIdentity();
  const bodyHash = researchBodyHash(task, price, input.payee, RESEARCH_MAX_TOKENS);
  const expiresAt = input.now + RESEARCH_TTL_SECONDS;
  const accept: ResearchAccept = {
    scheme: RESEARCH_SCHEME,
    network: ARC_NETWORK,
    asset: USDC,
    amount: price,
    payTo: input.payee,
    maxTimeoutSeconds: RESEARCH_TTL_SECONDS,
    extra: {
      quoteId: input.id,
      bodyHash,
      service: "Arc Research",
      provider: identity.provider,
      model: identity.model,
      maxTokens: RESEARCH_MAX_TOKENS,
      tariff: true,
      name: "USDC",
      version: "2",
    },
  };
  return {
    id: input.id,
    task,
    bodyHash,
    price,
    payee: input.payee,
    maxTokens: RESEARCH_MAX_TOKENS,
    expiresAt,
    paymentRequired: {
      x402Version: 2,
      scheme: RESEARCH_SCHEME,
      standardExact: false,
      resource: { url: input.resourceUrl, description: "Arc Research answer" },
      accepts: [accept],
    },
  };
}

/** A PQTABS Barkeep requirement. An `exact` row is not this quote. */
export function parseBarkeepPayment(payload: unknown): ParsedResearch | null {
  const body = record(payload);
  if (!body || body.scheme !== RESEARCH_SCHEME || body.standardExact !== false || !Array.isArray(body.accepts)) return null;
  const resource = record(body.resource);
  const url = resource && typeof resource.url === "string" ? resource.url : "";
  for (const item of body.accepts) {
    const row = record(item);
    if (!row || row.scheme !== RESEARCH_SCHEME || row.network !== ARC_NETWORK) continue;
    if (typeof row.asset !== "string" || row.asset.toLowerCase() !== USDC.toLowerCase()) continue;
    if (typeof row.amount !== "string" || !/^[0-9]+$/.test(row.amount)) continue;
    if (typeof row.payTo !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(row.payTo)) continue;
    const extra = record(row.extra);
    if (!extra || extra.tariff !== true || extra.service !== "Arc Research") continue;
    if (typeof extra.quoteId !== "string" || !/^[0-9a-f-]{36}$/.test(extra.quoteId)) continue;
    if (typeof extra.bodyHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(extra.bodyHash)) continue;
    if (extra.maxTokens !== RESEARCH_MAX_TOKENS) continue;
    const timeout = row.maxTimeoutSeconds;
    if (timeout !== RESEARCH_TTL_SECONDS) continue;
    return {
      quoteId: extra.quoteId,
      bodyHash: extra.bodyHash,
      price: row.amount,
      payee: getAddress(row.payTo),
      expiresAt: 0,
      maxTokens: RESEARCH_MAX_TOKENS,
      resource: url,
    };
  }
  return null;
}

export type TransferLog = { address?: string; topics?: readonly string[]; data?: string };

/** Exactly one 6-decimal USDC transfer. The 18-decimal system log does not count. A reverted receipt does not count. */
export function oneUsdcTransfer(
  receipt: { status?: string | number | null; logs?: readonly TransferLog[] } | null,
  expected: { from: string; to: string; value: string },
): boolean {
  if (!receipt || (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1")) return false;
  const fromTopic = `0x${expected.from.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const toTopic = `0x${expected.to.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const data = `0x${BigInt(expected.value).toString(16).padStart(64, "0")}`;
  const matches = (receipt.logs ?? []).filter((log) => {
    const topics = log.topics ?? [];
    let value: bigint;
    try {
      value = BigInt(log.data ?? "0x0");
    } catch {
      return false;
    }
    const raw = erc20SpendRaw(log.address ?? "", value);
    return raw != null
      && topics[0]?.toLowerCase() === TRANSFER_TOPIC
      && topics[1]?.toLowerCase() === fromTopic
      && topics[2]?.toLowerCase() === toTopic
      && log.data?.toLowerCase() === data;
  });
  return matches.length === 1;
}

export function quoteAgrees(
  stored: { price: string; payee: string; body_hash: string; expires_at: string },
  parsed: ParsedResearch,
  to: string,
  value: string,
  now: number,
): "ok" | "quote_expired" | "quote_mismatch" {
  if (Number(stored.expires_at) <= now) return "quote_expired";
  if (stored.price !== value || stored.price !== parsed.price) return "quote_mismatch";
  if (stored.payee.toLowerCase() !== to.toLowerCase() || stored.payee.toLowerCase() !== parsed.payee.toLowerCase()) return "quote_mismatch";
  if (stored.body_hash.toLowerCase() !== parsed.bodyHash.toLowerCase()) return "quote_mismatch";
  return "ok";
}

/** Groq text. A missing key, error, timeout, or empty completion is not an answer. The key is never logged. */
export async function askGroq(task: string, env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<{ text: string; model: string }> {
  const key = env.GROQ_API_KEY?.trim() ?? "";
  const model = researchIdentity(env).model;
  const base = (env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  if (!key || !model) return { text: "", model: "" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: task }],
        max_tokens: RESEARCH_MAX_TOKENS,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== "object") return { text: "", model: "" };
    const body = payload as { error?: unknown; model?: unknown; choices?: { message?: { content?: unknown } }[] };
    if (body.error || !Array.isArray(body.choices) || !body.choices[0]) return { text: "", model: "" };
    const content = body.choices[0].message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    const reported = typeof body.model === "string" && body.model ? body.model : model;
    return { text, model: text ? reported : "" };
  } catch {
    return { text: "", model: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** A paid task is complete only when the receipt matched and the model returned text. */
export function researchDelivery(receiptMatched: boolean, text: string): "unpaid" | "result_pending" | "complete" {
  if (!receiptMatched) return "unpaid";
  return text.trim() ? "complete" : "result_pending";
}
