import type { ZodType } from "zod";
import { PqtabsError, RateLimitedError } from "./errors.js";
import { errorBodySchema } from "./schemas.js";

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export type RequestOptions = {
  method: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs: number;
  /** Extra attempts for a call that is safe to repeat. Never set this for a relay. */
  retries: number;
  fetch: typeof fetch;
  sleep: Sleep;
};

export const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PqtabsError("aborted", "The request was cancelled."));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new PqtabsError("aborted", "The request was cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Calls the backend and validates the JSON against `schema`.
 * Only 429, 5xx, timeouts, and network errors are retryable. A 4xx is returned to the caller unchanged.
 */
export async function requestJson<T>(url: string, schema: ZodType<T>, options: RequestOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await requestOnce(url, schema, options);
    } catch (error) {
      const retryable = error instanceof PqtabsError && error.retryable;
      if (!retryable || attempt > options.retries) throw error;
      const wait =
        error instanceof RateLimitedError
          ? Math.min(error.retryAfterSeconds, 30) * 1000
          : Math.min(500 * 2 ** (attempt - 1), 4_000);
      await options.sleep(wait, options.signal);
    }
  }
}

async function requestOnce<T>(url: string, schema: ZodType<T>, options: RequestOptions): Promise<T> {
  if (options.signal?.aborted) throw new PqtabsError("aborted", "The request was cancelled.");
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  let response: Response;
  let text: string;
  try {
    response = await options.fetch(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (options.signal?.aborted) throw new PqtabsError("aborted", "The request was cancelled.", { cause: error });
    if (timedOut) {
      throw new PqtabsError("timeout", `The PQTABS backend did not answer within ${options.timeoutMs} ms.`, {
        retryable: true,
        cause: error,
      });
    }
    throw new PqtabsError("backend_unavailable", "The PQTABS backend could not be reached.", {
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  const body = parseJson(text);
  const parsedError = errorBodySchema.safeParse(body);
  const errorFields = parsedError.success ? parsedError.data : {};
  const requestId = response.headers.get("x-request-id") ?? errorFields.requestId ?? undefined;
  const status = response.status;

  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new RateLimitedError(
      errorFields.detail ?? "The PQTABS backend asked the client to wait. Nothing was sent.",
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5,
      { status, requestId, errorCode: errorFields.error ?? "rate_limited", detail: errorFields.detail },
    );
  }
  if (status >= 500) {
    throw new PqtabsError("backend_unavailable", `The PQTABS backend returned HTTP ${status}.`, {
      status,
      retryable: true,
      requestId,
      errorCode: errorFields.error,
      detail: errorFields.detail,
    });
  }
  if (!response.ok) {
    throw new PqtabsError("backend_error", errorFields.detail ?? `The PQTABS backend returned HTTP ${status}.`, {
      status,
      requestId,
      errorCode: errorFields.error ?? `http_${status}`,
      detail: errorFields.detail,
    });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new PqtabsError("schema_mismatch", "The PQTABS backend response did not match the protocol.", {
      status,
      requestId,
      detail: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; "),
    });
  }
  return parsed.data;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
