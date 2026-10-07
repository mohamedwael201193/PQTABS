/** True while the backfill is inside an Arc read. Portfolio reads skip the chain then. */
let ingestActive = 0;
let livePausedUntil = 0;

export function ingestRpcInFlight(): boolean {
  return ingestActive > 0;
}

/** After Arc refuses a read, keep serving stored rows until this window ends. */
export function noteRateLimit(): void {
  livePausedUntil = Date.now() + 15_000;
}

export function liveReadsPaused(): boolean {
  return ingestActive > 0 || Date.now() < livePausedUntil;
}

export async function ingestRead<T>(read: () => Promise<T>): Promise<T> {
  ingestActive += 1;
  try {
    return await read();
  } finally {
    ingestActive -= 1;
  }
}
