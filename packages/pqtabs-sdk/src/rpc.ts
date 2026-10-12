import { createPublicClient, type Hex, HttpRequestError, http } from "viem";
import { PqtabsError } from "./errors.js";
import type { Sleep } from "./http.js";

export type ReceiptLog = { address: string; topics: readonly string[]; data: string };

export type ArcReceipt = {
  transactionHash: string;
  status: "success" | "reverted";
  blockNumber: bigint;
  logs: readonly ReceiptLog[];
};

/**
 * Read-only access to Arc. The default implementation uses viem over HTTP.
 * Tests and private RPC providers can pass their own reader.
 */
export interface ReceiptReader {
  chainId(): Promise<number>;
  /** Null when the transaction is not mined yet. Throws rpc_rate_limited on HTTP 429. */
  getReceipt(hash: Hex): Promise<ArcReceipt | null>;
}

export function viemReceiptReader(rpcUrl: string, timeoutMs: number, fetchImpl: typeof fetch): ReceiptReader {
  const client = createPublicClient({
    transport: http(rpcUrl, { timeout: timeoutMs, fetchFn: fetchImpl, retryCount: 0 }),
  });
  return {
    async chainId() {
      try {
        return await client.getChainId();
      } catch (error) {
        throw rpcFailure(error, "Arc RPC did not return a chain id.");
      }
    },
    async getReceipt(hash) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        return {
          transactionHash: receipt.transactionHash,
          status: receipt.status,
          blockNumber: receipt.blockNumber,
          logs: receipt.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw rpcFailure(error, "Arc RPC did not return the receipt.");
      }
    },
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "TransactionReceiptNotFoundError";
}

function rpcFailure(error: unknown, message: string): PqtabsError {
  if (error instanceof HttpRequestError && error.status === 429) {
    // A 429 is a read limit on the RPC. It proves nothing about the transaction.
    return new PqtabsError("rpc_rate_limited", "Arc RPC is rate limiting reads. Nothing was decided from this read.", {
      status: 429,
      retryable: true,
      cause: error,
    });
  }
  return new PqtabsError("rpc_error", message, { retryable: true, cause: error });
}

/**
 * Polls for a receipt. A rate limit or a transient RPC error is retried until the deadline.
 * Returns null when no receipt appeared before the deadline. That is `settlement_pending`, not a failure.
 */
export async function waitForReceipt(
  reader: ReceiptReader,
  hash: Hex,
  options: { timeoutMs: number; pollMs: number; signal?: AbortSignal; sleep: Sleep },
): Promise<ArcReceipt | null> {
  const deadline = Date.now() + options.timeoutMs;
  for (;;) {
    try {
      const receipt = await reader.getReceipt(hash);
      if (receipt) return receipt;
    } catch (error) {
      if (!(error instanceof PqtabsError) || !error.retryable) throw error;
    }
    if (Date.now() >= deadline) return null;
    await options.sleep(Math.min(options.pollMs, Math.max(deadline - Date.now(), 0)), options.signal);
  }
}
