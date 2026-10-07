/** True while the backfill is inside an Arc read. Portfolio reads skip the chain then. */
let ingestActive = 0;
let livePausedUntil = 0;
let indexedBlock: bigint | null = null;
let chainHead: bigint | null = null;
let chainTime = "";
let lastSuccessAt: string | null = null;
let lastError: string | null = null;

export function noteIndexHead(head: bigint, timestamp: string): void {
  chainHead = head;
  chainTime = timestamp;
}

export function noteIndexCursor(block: bigint): void {
  indexedBlock = block;
  lastSuccessAt = new Date().toISOString();
  lastError = null;
}

export function noteIndexError(message: string): void {
  lastError = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted").slice(0, 180);
}

export function indexHealth(): {
  indexedBlock: bigint | null;
  chainHead: bigint | null;
  chainTime: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  busy: boolean;
} {
  return { indexedBlock, chainHead, chainTime, lastSuccessAt, lastError, busy: ingestActive > 0 };
}

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

/** True when stored logs already include recent heads. Absence of a row is then meaningful. */
export function indexCoversHead(maxLag = 30n): boolean {
  if (indexedBlock == null || chainHead == null) return false;
  const lag = chainHead > indexedBlock ? chainHead - indexedBlock : 0n;
  return lag <= maxLag;
}

export async function ingestRead<T>(read: () => Promise<T>): Promise<T> {
  ingestActive += 1;
  try {
    return await read();
  } finally {
    ingestActive -= 1;
  }
}
