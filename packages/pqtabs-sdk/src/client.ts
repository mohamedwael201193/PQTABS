import { randomBytes } from "node:crypto";
import { type Address, getAddress, type Hex, isAddress } from "viem";
import type { ZodType } from "zod";
import {
  ARC_CHAIN_ID,
  DEFAULT_BACKEND_URL,
  DEFAULT_RECEIPT_POLL_MS,
  DEFAULT_RECEIPT_TIMEOUT_MS,
  DEFAULT_RPC_URL,
  DEFAULT_TIMEOUT_MS,
  USDC_ADDRESS,
} from "./constants.js";
import { PolicyRefusedError, PqtabsError, RateLimitedError } from "./errors.js";
import { defaultSleep, requestJson, type Sleep } from "./http.js";
import { evaluateDecision, type ParsedQuote, parseBarkeepQuote, paymentDeadline } from "./policy.js";
import { checkUsdcSettlement } from "./receipt.js";
import { type ArcReceipt, type ReceiptReader, viemReceiptReader, waitForReceipt } from "./rpc.js";
import {
  type Capability,
  type Config,
  capabilitySchema,
  configSchema,
  type DecideResponse,
  decideResponseSchema,
  healthSchema,
  type Portfolio,
  portfolioSchema,
  quoteResponseSchema,
  readySchema,
  researchResultSchema,
  spendResponseSchema,
  timeSchema,
} from "./schemas.js";
import { type AgentSigner, recoverAuthorizationSigner } from "./signer.js";
import { encodeSpendBlob } from "./spend-blob.js";
import { type AttemptStore, MemoryAttemptStore, type SpendAttempt } from "./store.js";

const UINT256_MAX = (1n << 256n) - 1n;

export type PqtabsClientOptions = {
  /** PQTABS backend. Defaults to the public hosted backend. Plain http is allowed only for localhost. */
  backendUrl?: string;
  /** Arc RPC used for read-only receipt checks and the chain id check. */
  rpcUrl?: string;
  /** Per-request timeout for backend calls. */
  timeoutMs?: number;
  /** How long to wait for an Arc receipt before reporting settlement_pending. */
  receiptTimeoutMs?: number;
  receiptPollMs?: number;
  /** Attempts for a relay. Each attempt re-sends the same signed authorization. It never signs again. */
  maxRelayAttempts?: number;
  fetch?: typeof fetch;
  receiptReader?: ReceiptReader;
  attemptStore?: AttemptStore;
  sleep?: Sleep;
};

export type CallOptions = { signal?: AbortSignal };

export type SpendStep = "quote" | "preflight" | "authorize" | "settle" | "verify_receipt" | "result";

export type PaidResearchInput = {
  /** The capability (tab) that pays. It must already be open and authorized by the root. */
  tab: string;
  /** The agent signer. Its address must be the capability's agent on chain. */
  signer: AgentSigner;
  /** Required. The most this run may pay, in raw USDC units (6 decimals). */
  maxPriceRaw: bigint | string;
  /** The question to ask. Used when `paymentRequired` is not given. */
  task?: string;
  /** A quote you already hold. The backend still checks it against its stored quote. */
  paymentRequired?: unknown;
  /** Refuse unless the quote pays this address. Use it when you want to pin the payee. */
  expectedPayee?: string;
  signal?: AbortSignal;
  onProgress?: (step: SpendStep) => void;
};

export type ResearchOutcome =
  | {
      status: "complete";
      quoteId: string;
      txHash: string;
      result: string;
      model: string;
      tab: string;
      payee: string;
      amountRaw: string;
      receiptBlock: string;
      chainId: typeof ARC_CHAIN_ID;
    }
  | {
      status: "result_pending";
      quoteId: string;
      txHash: string;
      tab: string;
      payee: string;
      amountRaw: string;
      receiptBlock: string;
      chainId: typeof ARC_CHAIN_ID;
      note: string;
    }
  | {
      status: "settlement_pending";
      quoteId: string;
      txHash?: string;
      tab: string;
      payee: string;
      amountRaw: string;
      chainId: typeof ARC_CHAIN_ID;
      note: string;
    };

export type ReceiptCheck =
  | { status: "settled"; blockNumber: string; txHash: string }
  | { status: "reverted"; txHash: string }
  | { status: "not_found"; txHash: string }
  | { status: "mismatch"; txHash: string; reason: "no_matching_transfer" | "multiple_matching_transfers" };

export type PolicyResult = {
  allowed: boolean;
  decision: "ALLOW" | "REFUSE" | "NO_PAYMENT";
  reasons: string[];
  capability: string;
  priceRaw: string;
  payee: string;
  agent: string;
  expiry: string;
  remainingBalanceRaw: string;
  maxPerCallRaw: string;
  rootExposureRaw: string;
  maxOpenExposureRaw: string;
};

export type QuoteResult = {
  quoteId: string;
  replayed: boolean;
  priceRaw: string;
  payee: string;
  model: string;
  provider: string;
  expiresInSeconds: number;
  resource: string;
  paymentRequired: unknown;
};

/**
 * PQTABS client. Methods are split by risk:
 *   - `read`: never moves money.
 *   - `research`: quotes, policy checks, receipt checks, and result recovery. Never moves money.
 *   - `spend`: moves money, but only inside a capability the root already authorized, and only
 *     after every check passes. Requires an AgentSigner.
 */
export class PqtabsClient {
  readonly read: {
    health(options?: CallOptions): Promise<{ ok: true }>;
    ready(options?: CallOptions): Promise<{ ok: boolean; chainId: number; factory: string; relayer: boolean }>;
    config(options?: CallOptions): Promise<Config>;
    /** The chain id the SDK's own Arc RPC reports. Read straight from the RPC, never assumed. */
    rpcChainId(): Promise<number>;
    time(options?: CallOptions): Promise<bigint>;
    portfolio(root: string, options?: CallOptions): Promise<Portfolio>;
    capability(root: string, tab: string, options?: CallOptions): Promise<Capability>;
  };
  readonly research: {
    quote(task: string, options?: CallOptions): Promise<QuoteResult>;
    checkPolicy(input: { tab: string; paymentRequired: unknown }, options?: CallOptions): Promise<PolicyResult>;
    verifyReceipt(
      input: { txHash: string; tab: string; payee: string; valueRaw: bigint | string },
      options?: CallOptions,
    ): Promise<ReceiptCheck>;
    recoverResult(
      input: { quoteId: string; txHash: string; tab: string; payee?: string; valueRaw?: bigint | string },
      options?: CallOptions,
    ): Promise<ResearchOutcome>;
  };
  readonly spend: {
    research(input: PaidResearchInput): Promise<ResearchOutcome>;
    resume(input: { quoteId: string; tab: string; signal?: AbortSignal; onProgress?: (step: SpendStep) => void }): Promise<ResearchOutcome>;
  };

  private readonly backendUrl: string;
  private readonly timeoutMs: number;
  private readonly receiptTimeoutMs: number;
  private readonly receiptPollMs: number;
  private readonly maxRelayAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: Sleep;
  private readonly reader: ReceiptReader;
  private readonly store: AttemptStore;

  constructor(options: PqtabsClientOptions = {}) {
    this.backendUrl = normalizeBackendUrl(options.backendUrl ?? DEFAULT_BACKEND_URL);
    this.timeoutMs = positive(options.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
    this.receiptTimeoutMs = positive(options.receiptTimeoutMs, DEFAULT_RECEIPT_TIMEOUT_MS, "receiptTimeoutMs");
    this.receiptPollMs = positive(options.receiptPollMs, DEFAULT_RECEIPT_POLL_MS, "receiptPollMs");
    this.maxRelayAttempts = Math.min(positive(options.maxRelayAttempts, 4, "maxRelayAttempts"), 10);
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.reader =
      options.receiptReader ?? viemReceiptReader(options.rpcUrl ?? DEFAULT_RPC_URL, this.timeoutMs, this.fetchImpl);
    this.store = options.attemptStore ?? new MemoryAttemptStore();

    this.read = {
      health: (o) => this.get("/health", healthSchema, o),
      ready: (o) => this.get("/ready", readySchema, o),
      config: (o) => this.loadConfig(o),
      rpcChainId: () => this.reader.chainId(),
      time: async (o) => BigInt((await this.get("/v1/time", timeSchema, o)).asOf),
      portfolio: (root, o) => this.get(`/v1/roots/${addr(root, "root")}/portfolio`, portfolioSchema, o),
      capability: (root, tab, o) =>
        this.get(`/v1/roots/${addr(root, "root")}/tabs/${addr(tab, "tab")}`, capabilitySchema, o),
    };

    this.research = {
      quote: (task, o) => this.createQuote(task, o),
      checkPolicy: (input, o) => this.checkPolicy(input, o),
      verifyReceipt: (input, o) => this.verifyReceipt(input, o),
      recoverResult: (input, o) => this.recoverResult(input, o),
    };

    this.spend = {
      research: (input) => this.payResearch(input),
      resume: (input) => this.resumeResearch(input),
    };
  }

  // ---------- read ----------

  private get<T>(path: string, schema: ZodType<T>, options: CallOptions = {}): Promise<T> {
    return requestJson(`${this.backendUrl}${path}`, schema, {
      method: "GET",
      signal: options.signal,
      timeoutMs: this.timeoutMs,
      retries: 2,
      fetch: this.fetchImpl,
      sleep: this.sleep,
    });
  }

  private post<T>(
    path: string,
    body: unknown,
    schema: ZodType<T>,
    options: { signal?: AbortSignal; retries: number },
  ): Promise<T> {
    return requestJson(`${this.backendUrl}${path}`, schema, {
      method: "POST",
      body,
      signal: options.signal,
      timeoutMs: this.timeoutMs,
      retries: options.retries,
      fetch: this.fetchImpl,
      sleep: this.sleep,
    });
  }

  /** Reads the backend config and refuses unless it is Arc mainnet with the published USDC. */
  private async loadConfig(options: CallOptions = {}): Promise<Config> {
    const config = await this.get("/v1/config", configSchema, options);
    if (config.chainId !== ARC_CHAIN_ID) {
      throw new PqtabsError("chain_mismatch", `The backend reports chain ${config.chainId}, not Arc (${ARC_CHAIN_ID}).`);
    }
    if (config.usdc.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
      throw new PqtabsError("chain_mismatch", "The backend reports a different USDC address than Arc's.");
    }
    return config;
  }

  /** Checks both the backend and the RPC are on Arc before any spend. */
  private async assertArc(signal?: AbortSignal): Promise<void> {
    await this.loadConfig({ signal });
    const rpcChain = await this.reader.chainId();
    if (rpcChain !== ARC_CHAIN_ID) {
      throw new PqtabsError("chain_mismatch", `The RPC reports chain ${rpcChain}, not Arc (${ARC_CHAIN_ID}). Nothing was signed.`);
    }
  }

  // ---------- research (no money) ----------

  private async createQuote(task: string, options: CallOptions = {}): Promise<QuoteResult> {
    const trimmed = task.trim();
    if (!trimmed) throw new PqtabsError("invalid_input", "The question is empty. Nothing was priced.");
    const response = await this.post("/v1/research/quote", { task: trimmed }, quoteResponseSchema, {
      signal: options.signal,
      retries: 1,
    });
    const quote = parseBarkeepQuote(response.paymentRequired, UINT256_MAX);
    if (quote.quoteId !== response.quoteId) {
      throw new PqtabsError("quote_invalid", "The quote id in the response does not match the price. Nothing was signed.");
    }
    return {
      quoteId: quote.quoteId,
      replayed: response.replayed,
      priceRaw: quote.price.toString(),
      payee: quote.payee,
      model: quote.model,
      provider: quote.provider,
      expiresInSeconds: quote.lifetimeSeconds,
      resource: quote.resource,
      paymentRequired: response.paymentRequired,
    };
  }

  private async checkPolicy(input: { tab: string; paymentRequired: unknown }, options: CallOptions = {}): Promise<PolicyResult> {
    const tab = addr(input.tab, "tab");
    const decision: DecideResponse = await this.post(
      "/v1/x402/decide",
      { tab, paymentRequired: input.paymentRequired },
      decideResponseSchema,
      { signal: options.signal, retries: 1 },
    );
    return {
      allowed: decision.decision === "ALLOW",
      decision: decision.decision,
      reasons: decision.reason,
      capability: decision.capability,
      priceRaw: decision.price,
      payee: decision.payee,
      agent: decision.agent,
      expiry: decision.expiry,
      remainingBalanceRaw: decision.remaining_capability_balance,
      maxPerCallRaw: decision.maxPerCall,
      rootExposureRaw: decision.root_exposure,
      maxOpenExposureRaw: decision.maxOpenExposure,
    };
  }

  private async verifyReceipt(
    input: { txHash: string; tab: string; payee: string; valueRaw: bigint | string },
    options: CallOptions = {},
  ): Promise<ReceiptCheck> {
    const txHash = hash(input.txHash, "txHash");
    const receipt = await waitingRead(this.reader, txHash, options.signal);
    return this.classifyReceipt(receipt, txHash, input.tab, input.payee, toBigInt(input.valueRaw, "valueRaw"));
  }

  private classifyReceipt(
    receipt: ArcReceipt | null,
    txHash: string,
    tab: string,
    payee: string,
    value: bigint,
  ): ReceiptCheck {
    if (!receipt) return { status: "not_found", txHash };
    if (receipt.status !== "success") return { status: "reverted", txHash };
    const check = checkUsdcSettlement(receipt, { from: addr(tab, "tab"), to: addr(payee, "payee"), value });
    if (!check.ok) {
      if (check.reason === "reverted") return { status: "reverted", txHash };
      return { status: "mismatch", txHash, reason: check.reason };
    }
    return { status: "settled", txHash, blockNumber: check.blockNumber.toString() };
  }

  private async recoverResult(
    input: { quoteId: string; txHash: string; tab: string; payee?: string; valueRaw?: bigint | string },
    options: CallOptions = {},
  ): Promise<ResearchOutcome> {
    const quoteId = uuid(input.quoteId, "quoteId");
    const txHash = hash(input.txHash, "txHash");
    const tab = addr(input.tab, "tab");
    const payee = input.payee ? addr(input.payee, "payee") : "";
    const value = input.valueRaw === undefined ? undefined : toBigInt(input.valueRaw, "valueRaw");
    if (payee && value !== undefined) {
      const receipt = await waitingRead(this.reader, txHash, options.signal);
      if (!receipt) {
        return { status: "settlement_pending", quoteId, txHash, tab, payee, amountRaw: value.toString(), chainId: ARC_CHAIN_ID, note: "The receipt is not mined yet. Nothing was charged again." };
      }
      const check = this.classifyReceipt(receipt, txHash, tab, payee, value);
      if (check.status !== "settled") {
        throw new PqtabsError("receipt_mismatch", `Arc receipt ${txHash} is not a settled payment for this quote (${check.status}). No result was produced.`);
      }
    }
    const answer = await this.fetchResult(quoteId, txHash, tab, options.signal);
    if (answer.status === "complete" && answer.result) {
      return {
        status: "complete",
        quoteId,
        txHash,
        result: answer.result,
        model: answer.model ?? "",
        tab,
        payee,
        amountRaw: value?.toString() ?? "",
        receiptBlock: "",
        chainId: ARC_CHAIN_ID,
      };
    }
    return {
      status: "result_pending",
      quoteId,
      txHash,
      tab,
      payee,
      amountRaw: value?.toString() ?? "",
      receiptBlock: "",
      chainId: ARC_CHAIN_ID,
      note: "The receipt matched, and the answer is not ready. Retrying does not charge again.",
    };
  }

  private fetchResult(quoteId: string, txHash: string, tab: string, signal?: AbortSignal) {
    return this.post("/v1/research/result", { quoteId, txHash, tab }, researchResultSchema, { signal, retries: 2 });
  }

  // ---------- spend (moves money inside a capability) ----------

  private async payResearch(input: PaidResearchInput): Promise<ResearchOutcome> {
    const tab = addr(input.tab, "tab");
    const maxPrice = toBigInt(input.maxPriceRaw, "maxPriceRaw");
    if (maxPrice <= 0n) throw new PqtabsError("invalid_input", "maxPriceRaw must be greater than zero.");
    if (!input.signer || !isAddress(input.signer.address)) {
      throw new PqtabsError("invalid_input", "A signer with a valid agent address is required to spend.");
    }
    const progress = (step: SpendStep) => input.onProgress?.(step);

    await this.assertArc(input.signal);
    progress("quote");
    let paymentRequired = input.paymentRequired;
    if (paymentRequired === undefined) {
      if (!input.task?.trim()) throw new PqtabsError("invalid_input", "Give a task or a paymentRequired quote.");
      paymentRequired = (await this.createQuote(input.task, { signal: input.signal })).paymentRequired;
    }
    const quote = parseBarkeepQuote(paymentRequired, maxPrice);
    if (input.expectedPayee && getAddress(input.expectedPayee) !== quote.payee) {
      throw new PolicyRefusedError(["wrong_payee"], { detail: "The quote pays a different address than expectedPayee." });
    }

    // Idempotency: a quote that already has an attempt is never signed again.
    const existing = await this.store.get(quote.quoteId);
    if (existing) {
      if (existing.tab.toLowerCase() !== tab.toLowerCase()) {
        throw new PqtabsError("invalid_input", "This quote already belongs to another capability. Nothing was signed.");
      }
      return this.settle(existing, input.signal, progress);
    }

    progress("preflight");
    const decision = await this.postDecision(tab, paymentRequired, input.signal);
    const verdict = evaluateDecision(decision, { tab, quote, signerAddress: input.signer.address });
    const arcNow = await this.read.time({ signal: input.signal });
    const deadline = paymentDeadline(arcNow, verdict.expiry, quote.lifetimeSeconds);

    progress("authorize");
    const attempt = await this.authorize({ input, tab, quote, deadline, paymentRequired });
    await this.store.put(attempt);
    return this.settle(attempt, input.signal, progress);
  }

  private async resumeResearch(input: { quoteId: string; tab: string; signal?: AbortSignal; onProgress?: (step: SpendStep) => void }) {
    const quoteId = uuid(input.quoteId, "quoteId");
    const tab = addr(input.tab, "tab");
    const attempt = await this.store.get(quoteId);
    if (!attempt) {
      throw new PqtabsError("attempt_not_found", "No stored authorization for this quote on this machine. Nothing was signed.");
    }
    if (attempt.tab.toLowerCase() !== tab.toLowerCase()) {
      throw new PqtabsError("invalid_input", "This quote belongs to another capability.");
    }
    await this.assertArc(input.signal);
    return this.settle(attempt, input.signal, (step) => input.onProgress?.(step));
  }

  private postDecision(tab: string, paymentRequired: unknown, signal?: AbortSignal): Promise<DecideResponse> {
    return this.post("/v1/x402/decide", { tab, paymentRequired }, decideResponseSchema, { signal, retries: 1 });
  }

  private async authorize(args: {
    input: PaidResearchInput;
    tab: string;
    quote: ParsedQuote;
    deadline: bigint;
    paymentRequired: unknown;
  }): Promise<SpendAttempt> {
    const { input, tab, quote, deadline } = args;
    const nonce = randomHex32();
    const authorization = {
      chainId: ARC_CHAIN_ID,
      asset: USDC_ADDRESS as Address,
      from: tab as Address,
      to: quote.payee,
      value: quote.price,
      validAfter: 0n,
      validBefore: deadline,
      nonce,
    };
    const signature = await input.signer.signTransferAuthorization(authorization);
    // The signature must recover to the agent. Otherwise the backend would refuse it, or worse, accept a different signer.
    const recovered = await recoverAuthorizationSigner(authorization, signature);
    if (recovered.toLowerCase() !== input.signer.address.toLowerCase()) {
      throw new PqtabsError("signer_mismatch", "The signature does not recover to the agent address. Nothing was broadcast.");
    }
    return {
      quoteId: quote.quoteId,
      tab,
      payee: quote.payee,
      value: quote.price.toString(),
      validBefore: deadline.toString(),
      nonce,
      authorization: encodeSpendBlob({
        signature,
        to: quote.payee,
        value: quote.price,
        validAfter: 0n,
        validBefore: deadline,
        nonce,
      }),
      signerAddress: input.signer.address,
      paymentRequired: args.paymentRequired,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Relays the stored authorization and waits for the receipt. Safe to call again for the same quote:
   * a relay that already happened returns the same hash, and nothing is signed here.
   */
  private async settle(
    attempt: SpendAttempt,
    signal: AbortSignal | undefined,
    progress: (step: SpendStep) => void,
  ): Promise<ResearchOutcome> {
    const base = {
      quoteId: attempt.quoteId,
      tab: attempt.tab,
      payee: attempt.payee,
      amountRaw: attempt.value,
      chainId: ARC_CHAIN_ID,
    } as const;

    let current = attempt;
    if (!current.txHash) {
      const arcNow = await this.read.time({ signal });
      if (BigInt(current.validBefore) <= arcNow) {
        throw new PqtabsError("authorization_expired", "The stored authorization expired before it was submitted. Nothing was broadcast. Start a new paid run.");
      }
      progress("settle");
      const txHash = await this.relay(current, signal);
      current = { ...current, txHash };
      await this.store.put(current);
    }

    progress("verify_receipt");
    const txHash = hash(current.txHash ?? "", "txHash");
    const receipt = await waitingReceipt(this.reader, txHash, {
      timeoutMs: this.receiptTimeoutMs,
      pollMs: this.receiptPollMs,
      signal,
      sleep: this.sleep,
    });
    if (!receipt) {
      return {
        ...base,
        status: "settlement_pending",
        txHash,
        note: "Submitted to Arc. The receipt is not confirmed yet. Call resume later with the same quote id. It will not charge again.",
      };
    }
    const check = this.classifyReceipt(receipt, txHash, attempt.tab, attempt.payee, BigInt(attempt.value));
    if (check.status !== "settled") {
      throw new PqtabsError(
        "receipt_mismatch",
        `Arc included ${txHash}, but that receipt is not a settled payment for this quote (${check.status}). No result was produced.`,
      );
    }

    progress("result");
    try {
      const answer = await this.fetchResult(attempt.quoteId, txHash, attempt.tab, signal);
      if (answer.status === "complete" && answer.result) {
        return {
          ...base,
          status: "complete",
          txHash,
          result: answer.result,
          model: answer.model ?? "",
          receiptBlock: check.blockNumber,
        };
      }
      return {
        ...base,
        status: "result_pending",
        txHash,
        receiptBlock: check.blockNumber,
        note: "The receipt matched, and the answer is not ready. Call recoverResult later. It will not charge again.",
      };
    } catch (error) {
      if (error instanceof PqtabsError && error.code === "receipt_mismatch") throw error;
      return {
        ...base,
        status: "result_pending",
        txHash,
        receiptBlock: check.blockNumber,
        note: `The receipt matched, but the answer could not be fetched (${error instanceof Error ? error.message : "unknown error"}). Call recoverResult later. It will not charge again.`,
      };
    }
  }

  /**
   * Sends the stored authorization. Every failure mode is classified:
   * - a refusal (HTTP 400, 409) means the backend did not broadcast; the error is returned to the caller;
   * - a rate limit (HTTP 429) waits and sends the same authorization again;
   * - a timeout or 5xx may or may not have broadcast; the same authorization is sent again, and the
   *   backend returns the prior hash, so this cannot charge twice.
   */
  private async relay(attempt: SpendAttempt, signal?: AbortSignal): Promise<string> {
    const body = {
      tab: attempt.tab,
      to: attempt.payee,
      value: attempt.value,
      validAfter: "0",
      validBefore: attempt.validBefore,
      nonce: attempt.nonce,
      signature: attempt.authorization,
      paymentRequired: attempt.paymentRequired,
    };
    for (let round = 1; round <= this.maxRelayAttempts; round += 1) {
      try {
        const response = await this.post("/v1/relay/spend", body, spendResponseSchema, { signal, retries: 0 });
        return response.hash;
      } catch (error) {
        if (!(error instanceof PqtabsError)) throw error;
        if (error.code === "aborted") {
          throw new PqtabsError("settlement_unknown", "The submission was cancelled before the answer. Call resume with the same quote id.", { cause: error });
        }
        if (error.code === "backend_error") {
          if (error.status === 400 && error.errorCode === "policy_refused") {
            const reasons = (error.detail ?? "").split(",").map((item) => item.trim()).filter(Boolean);
            throw new PolicyRefusedError(reasons.length > 0 ? reasons : ["unknown"], { status: 400, errorCode: error.errorCode, detail: error.detail });
          }
          throw error;
        }
        if (error.code === "rate_limited") {
          const wait = error instanceof RateLimitedError ? error.retryAfterSeconds : 5;
          if (round >= this.maxRelayAttempts) break;
          await this.sleep(Math.min(wait, 30) * 1000, signal);
          continue;
        }
        if (!error.retryable) throw error;
        if (round >= this.maxRelayAttempts) break;
        await this.sleep(Math.min(500 * 2 ** (round - 1), 4_000), signal);
      }
    }
    throw new PqtabsError(
      "settlement_unknown",
      "The backend did not confirm the submission. It may or may not have broadcast. Call resume with the same quote id. Nothing was signed again.",
      { retryable: true },
    );
  }
}

// ---------- helpers ----------

function normalizeBackendUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PqtabsError("invalid_config", "backendUrl is not a valid URL.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new PqtabsError("invalid_config", "backendUrl must use https (plain http is allowed only for localhost).");
  }
  return url.toString().replace(/\/$/, "");
}

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new PqtabsError("invalid_config", `${name} must be a positive number.`);
  return value;
}

function addr(value: string, name: string): Address {
  if (!isAddress(value)) throw new PqtabsError("invalid_input", `${name} must be an EVM address.`);
  return getAddress(value);
}

function hash(value: string, name: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new PqtabsError("invalid_input", `${name} must be a 32-byte transaction hash.`);
  return value.toLowerCase() as Hex;
}

function uuid(value: string, name: string): string {
  if (!/^[0-9a-f-]{36}$/.test(value)) throw new PqtabsError("invalid_input", `${name} must be a quote id.`);
  return value;
}

function toBigInt(value: bigint | string, name: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new PqtabsError("invalid_input", `${name} must not be negative.`);
    return value;
  }
  if (!/^[0-9]+$/.test(value)) throw new PqtabsError("invalid_input", `${name} must be a whole number of raw units.`);
  return BigInt(value);
}

function randomHex32(): Hex {
  return `0x${Buffer.from(randomBytes(32)).toString("hex")}` as Hex;
}

async function waitingRead(reader: ReceiptReader, txHash: Hex, signal?: AbortSignal): Promise<ArcReceipt | null> {
  if (signal?.aborted) throw new PqtabsError("aborted", "The request was cancelled.");
  return reader.getReceipt(txHash);
}

function waitingReceipt(
  reader: ReceiptReader,
  txHash: Hex,
  options: { timeoutMs: number; pollMs: number; signal?: AbortSignal; sleep: Sleep },
): Promise<ArcReceipt | null> {
  return waitForReceipt(reader, txHash, options);
}
