import { READS_PER_MINUTE, RELAYS_PER_MINUTE } from "./constants.js";

const WINDOW_MS = 60_000;

type Bucket = { stamps: number[] };
type Kind = "read" | "relay";

/**
 * Reads and relays keep separate buckets per client. A dashboard that reads often must not use up
 * the relay allowance, or every signed action is refused while the page is still loading.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  private bucket(key: string, kind: Kind): Bucket {
    const id = `${kind}:${key}`;
    const windowStart = this.now() - WINDOW_MS;
    const bucket = this.buckets.get(id) ?? { stamps: [] };
    bucket.stamps = bucket.stamps.filter((stamp) => stamp > windowStart);
    this.buckets.set(id, bucket);
    return bucket;
  }

  allow(key: string, kind: Kind): boolean {
    const limit = kind === "relay" ? RELAYS_PER_MINUTE : READS_PER_MINUTE;
    const bucket = this.bucket(key, kind);
    if (bucket.stamps.length >= limit) return false;
    bucket.stamps.push(this.now());
    return true;
  }

  /** Whole seconds until the oldest request in this bucket leaves the one-minute window. */
  retryAfterSeconds(key: string, kind: Kind): number {
    const oldest = this.bucket(key, kind).stamps[0];
    if (oldest === undefined) return 1;
    return Math.max(1, Math.ceil((oldest + WINDOW_MS - this.now()) / 1000));
  }
}
