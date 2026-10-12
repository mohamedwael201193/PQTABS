export type PqtabsErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "chain_mismatch"
  | "backend_unavailable"
  | "backend_error"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "schema_mismatch"
  | "quote_invalid"
  | "quote_expired"
  | "exceeds_max_price"
  | "policy_refused"
  | "signer_mismatch"
  | "authorization_expired"
  | "settlement_unknown"
  | "receipt_mismatch"
  | "rpc_error"
  | "rpc_rate_limited"
  | "attempt_not_found";

export type PqtabsErrorOptions = {
  status?: number;
  retryable?: boolean;
  requestId?: string;
  /** The backend's short machine error code, for example `policy_refused` or `quote_mismatch`. */
  errorCode?: string;
  /** The backend's human detail. It never contains a key or a signature. */
  detail?: string;
  cause?: unknown;
};

/** Base error. Every failure from the SDK is an instance of this class. */
export class PqtabsError extends Error {
  readonly code: PqtabsErrorCode;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly requestId: string | undefined;
  readonly errorCode: string | undefined;
  readonly detail: string | undefined;

  constructor(code: PqtabsErrorCode, message: string, options: PqtabsErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PqtabsError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.errorCode = options.errorCode;
    this.detail = options.detail;
  }
}

/** The policy check refused the spend. Nothing was signed and nothing was broadcast. */
export class PolicyRefusedError extends PqtabsError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[], options: PqtabsErrorOptions = {}) {
    const list = reasons.length > 0 ? reasons.join(", ") : "unknown";
    super("policy_refused", `The capability refused this payment (${list}). Nothing was signed. Nothing was broadcast.`, {
      retryable: false,
      ...options,
    });
    this.name = "PolicyRefusedError";
    this.reasons = reasons;
  }
}

/** The backend or RPC asked us to slow down. This is not a payment failure. */
export class RateLimitedError extends PqtabsError {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number, options: PqtabsErrorOptions = {}) {
    super("rate_limited", message, { retryable: true, ...options });
    this.name = "RateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isPqtabsError(value: unknown): value is PqtabsError {
  return value instanceof PqtabsError;
}
