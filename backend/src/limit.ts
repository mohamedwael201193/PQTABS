import { READS_PER_MINUTE, RELAYS_PER_MINUTE } from "./constants.js";

type Bucket = { stamps: number[] };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  allow(key: string, kind: "read" | "relay"): boolean {
    const limit = kind === "relay" ? RELAYS_PER_MINUTE : READS_PER_MINUTE;
    const windowStart = this.now() - 60_000;
    const bucket = this.buckets.get(key) ?? { stamps: [] };
    bucket.stamps = bucket.stamps.filter((stamp) => stamp > windowStart);
    if (bucket.stamps.length >= limit) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.stamps.push(this.now());
    this.buckets.set(key, bucket);
    return true;
  }
}
