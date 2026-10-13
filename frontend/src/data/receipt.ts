/**
 * Waiting for an Arc transaction receipt.
 *
 * A receipt's status ("success" or "reverted") is the only definitive result.
 * Anything else while waiting (no receipt yet, a transient head error such as
 * Arc's -32014 "catching up", a rate limit, or an unrecognised error) means the
 * outcome is unknown. Those are retried with bounded backoff and then reported
 * as ReceiptPendingError. A pending receipt is never reported as a failed payment.
 */

export type ReceiptSource<R extends { status: string }> = {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<R>;
};

export type ReceiptWaitOptions = {
  /** Total time to wait before reporting pending. Default 90 seconds. */
  timeoutMs?: number;
  /** Delay between checks while the receipt is not yet mined. Default 1.5 seconds. */
  pollMs?: number;
  /** First backoff after a transient error. Doubles each consecutive error. Default 1 second. */
  baseBackoffMs?: number;
  /** Upper bound for a single backoff. Default 8 seconds. */
  maxBackoffMs?: number;
  /** Consecutive transient errors allowed before reporting pending. Default 6. */
  maxTransientErrors?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type PendingReason = "timeout" | "rpc_unavailable" | "unknown_error";

export class ReceiptPendingError extends Error {
  hash: string;
  reason: PendingReason;

  constructor(hash: string, reason: PendingReason) {
    super(
      `Submitted to Arc (${hash}). Arc has not returned a receipt yet, so the outcome is not known. This is not a failure. Check the transaction in the explorer before you retry.`,
    );
    this.name = "ReceiptPendingError";
    this.hash = hash;
    this.reason = reason;
  }
}

type ErrorLink = { name?: string; code?: unknown; message?: string };

function errorChain(error: unknown): ErrorLink[] {
  const links: ErrorLink[] = [];
  if (typeof error === "string") return [{ message: error }];
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 6; depth += 1) {
    const item = current as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    links.push({
      name: typeof item.name === "string" ? item.name : undefined,
      code: item.code,
      message: typeof item.message === "string" ? item.message : undefined,
    });
    current = item.cause;
  }
  return links;
}

/** True when Arc has not mined the transaction yet. The receipt is simply absent. */
export function isNotYetMined(error: unknown): boolean {
  return errorChain(error).some(
    (link) => link.name === "TransactionReceiptNotFoundError" || /receipt.*could not be found/i.test(link.message ?? ""),
  );
}

/** Arc's load-balanced nodes return -32014 while they catch up to the head. It is transient. */
export function isTransientRpcError(error: unknown): boolean {
  return errorChain(error).some(
    (link) =>
      link.code === -32014 ||
      link.code === 429 ||
      /-32014/.test(link.message ?? "") ||
      /too many requests|rate limit|catching up|fetch failed|econnreset|etimedout|timed? ?out|\b(429|502|503|504)\b/i.test(
        link.message ?? "",
      ),
  );
}

function resolveOptions(options: ReceiptWaitOptions) {
  return {
    timeoutMs: options.timeoutMs ?? 90_000,
    pollMs: options.pollMs ?? 1_500,
    baseBackoffMs: options.baseBackoffMs ?? 1_000,
    maxBackoffMs: options.maxBackoffMs ?? 8_000,
    maxTransientErrors: options.maxTransientErrors ?? 6,
    now: options.now ?? (() => Date.now()),
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
  };
}

/**
 * Resolve with the receipt once Arc reports a status. Throws ReceiptPendingError
 * when the outcome is still unknown. It never resolves with a guessed status.
 */
export async function awaitReceipt<R extends { status: string }>(
  source: ReceiptSource<R>,
  hash: `0x${string}`,
  options: ReceiptWaitOptions = {},
): Promise<R & { status: "success" | "reverted" }> {
  const o = resolveOptions(options);
  const deadline = o.now() + o.timeoutMs;
  let transientErrors = 0;

  for (;;) {
    let pauseMs = o.pollMs;
    try {
      const receipt = await source.getTransactionReceipt({ hash });
      if (receipt.status === "success" || receipt.status === "reverted") {
        return receipt as R & { status: "success" | "reverted" };
      }
      transientErrors = 0;
    } catch (error: unknown) {
      if (isNotYetMined(error)) {
        transientErrors = 0;
      } else if (isTransientRpcError(error)) {
        transientErrors += 1;
        if (transientErrors > o.maxTransientErrors) throw new ReceiptPendingError(hash, "rpc_unavailable");
        pauseMs = Math.min(o.maxBackoffMs, o.baseBackoffMs * 2 ** (transientErrors - 1));
      } else {
        throw new ReceiptPendingError(hash, "unknown_error");
      }
    }
    if (o.now() + pauseMs >= deadline) throw new ReceiptPendingError(hash, "timeout");
    await o.sleep(pauseMs);
  }
}
