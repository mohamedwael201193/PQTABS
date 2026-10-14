import { type Address, getAddress, isAddress } from "viem";
import { ARC_NETWORK, MIN_VALIDITY_SECONDS, RESEARCH_MAX_TOKENS, SCHEME, USDC_ADDRESS } from "./constants.js";
import { PolicyRefusedError, PqtabsError } from "./errors.js";
import { type DecideResponse, type PaymentRequired, paymentRequiredSchema } from "./schemas.js";

export type ParsedQuote = {
  quoteId: string;
  bodyHash: string;
  price: bigint;
  payee: Address;
  resource: string;
  model: string;
  provider: string;
  maxTokens: number;
  /** Seconds the quote and its authorization may live, from the backend TTL. */
  lifetimeSeconds: number;
  paymentRequired: PaymentRequired;
};

/**
 * Validates a Barkeep quote before anything is signed. Checks the chain, the asset, the price cap,
 * and the payee shape. Throws quote_invalid, or exceeds_max_price when the price is above the cap.
 */
export function parseBarkeepQuote(input: unknown, maxPrice: bigint): ParsedQuote {
  const parsed = paymentRequiredSchema.safeParse(input);
  if (!parsed.success) {
    throw new PqtabsError("quote_invalid", "The price from PQTABS is not a valid Arc Research quote. Nothing was signed.", {
      detail: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    });
  }
  const quote = parsed.data;
  const barkeep = quote.accepts.filter((row) => row.scheme === SCHEME);
  const extras = quote.accepts.filter((row) => row.scheme !== SCHEME);
  const accept = barkeep[0];
  if (barkeep.length !== 1 || !accept || extras.some((row) => row.scheme !== "exact")) {
    throw new PqtabsError("quote_invalid", "The quote must contain exactly one Arc Research price. Nothing was signed.");
  }
  if (accept.network !== ARC_NETWORK) {
    throw new PqtabsError("quote_invalid", "The quote is not on the Arc network. Nothing was signed.");
  }
  if (extras.some((row) => row.network !== accept.network || row.amount !== accept.amount || row.payTo.toLowerCase() !== accept.payTo.toLowerCase())) {
    throw new PqtabsError("quote_invalid", "The exact row does not match the Arc Research price. Nothing was signed.");
  }
  if (accept.asset.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new PqtabsError("quote_invalid", "The quote does not price in Arc USDC. Nothing was signed.");
  }
  if (accept.extra.maxTokens !== RESEARCH_MAX_TOKENS) {
    throw new PqtabsError("quote_invalid", "The quote token ceiling is not the published one. Nothing was signed.");
  }
  if (!isAddress(accept.payTo) || accept.payTo.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new PqtabsError("quote_invalid", "The quote has no valid payee. Nothing was signed.");
  }
  const price = BigInt(accept.amount);
  if (price <= 0n) throw new PqtabsError("quote_invalid", "The quote price is zero. Nothing was signed.");
  if (price > maxPrice) {
    throw new PolicyRefusedError(["exceeds_max_price"], {
      errorCode: "exceeds_max_price",
      detail: `Quote ${price} is above the caller's limit ${maxPrice}.`,
    });
  }
  return {
    quoteId: accept.extra.quoteId,
    bodyHash: accept.extra.bodyHash,
    price,
    payee: getAddress(accept.payTo),
    resource: quote.resource.url,
    model: accept.extra.model,
    provider: accept.extra.provider,
    maxTokens: accept.extra.maxTokens,
    lifetimeSeconds: accept.maxTimeoutSeconds,
    paymentRequired: quote,
  };
}

/** Same rule as the browser: the authorization dies at the service window, and never after the capability. */
export function paymentDeadline(arcNow: bigint, capabilityExpiry: bigint, lifetimeSeconds: number): bigint {
  const window = arcNow + BigInt(lifetimeSeconds);
  const deadline = capabilityExpiry < window ? capabilityExpiry : window;
  if (deadline < arcNow + BigInt(MIN_VALIDITY_SECONDS)) {
    throw new PqtabsError("authorization_expired", "The capability expires too soon for a new authorization. Nothing was signed.");
  }
  return deadline;
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Checks the backend decision against the quote and the signer before any signature is made.
 * A refusal throws PolicyRefusedError with the backend's own reasons.
 */
export function evaluateDecision(
  decision: DecideResponse,
  context: { tab: string; quote: ParsedQuote; signerAddress: string },
): { price: bigint; payee: Address; expiry: bigint } {
  if (decision.decision !== "ALLOW") {
    throw new PolicyRefusedError(decision.reason.length > 0 ? decision.reason : ["unknown"]);
  }
  if (!same(decision.capability, context.tab)) {
    throw new PolicyRefusedError(["capability_mismatch"]);
  }
  if (!same(decision.payee, context.quote.payee)) {
    throw new PolicyRefusedError(["wrong_payee"]);
  }
  if (BigInt(decision.price) !== context.quote.price) {
    throw new PolicyRefusedError(["quote_mismatch"]);
  }
  if (!same(decision.agent, context.signerAddress)) {
    throw new PqtabsError(
      "signer_mismatch",
      "This signer is not the agent on this capability. Nothing was signed. Nothing was broadcast.",
    );
  }
  if (!isAddress(context.signerAddress)) {
    throw new PqtabsError("signer_mismatch", "The signer address is not valid. Nothing was signed.");
  }
  return {
    price: context.quote.price,
    payee: context.quote.payee,
    expiry: BigInt(decision.expiry),
  };
}
