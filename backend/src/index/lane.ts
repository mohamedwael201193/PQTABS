/** True while the backfill is inside an Arc read. Portfolio reads skip the chain then. */
let ingestActive = 0;

export function ingestRpcInFlight(): boolean {
  return ingestActive > 0;
}

export async function ingestRead<T>(read: () => Promise<T>): Promise<T> {
  ingestActive += 1;
  try {
    return await read();
  } finally {
    ingestActive -= 1;
  }
}
