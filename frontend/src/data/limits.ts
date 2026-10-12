const BUSY = "Too many requests from this browser. Wait a minute, then try again. Nothing was sent.";

/**
 * Copy for a request the backend refused for rate. A refused request is never processed, so nothing was sent.
 * Returns null for any other error so the caller can keep its own wording.
 */
export function busyMessage(detail: string | undefined): string | null {
  if (!detail) return null;
  if (detail.startsWith("Too many requests")) return detail;
  if (/rate_limited/i.test(detail)) return BUSY;
  return null;
}

/** Wait before the next portfolio read while the indexer catches up. Grows from 3 s to a 15 s cap. */
export function indexingPause(previousMs: number): number {
  return Math.min(Math.round(previousMs * 1.5), 15_000);
}
