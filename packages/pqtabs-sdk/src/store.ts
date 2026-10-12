import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * One paid research attempt, keyed by quote id. It holds the signed authorization so a retry or a
 * resume reuses the same authorization and never signs a second one for the same quote.
 * It holds no private key. The signature only authorizes this one payment to this one payee.
 */
export type SpendAttempt = {
  quoteId: string;
  tab: string;
  payee: string;
  /** Raw USDC units as a decimal string. */
  value: string;
  validBefore: string;
  nonce: string;
  /** The 213-byte authorization blob the backend relays. */
  authorization: string;
  signerAddress: string;
  /** The Barkeep payment requirement the relay needs. It is the quote the backend stored. */
  paymentRequired: unknown;
  txHash?: string;
  createdAt: string;
};

export interface AttemptStore {
  get(quoteId: string): Promise<SpendAttempt | undefined>;
  put(attempt: SpendAttempt): Promise<void>;
}

/** Default store for one process. It is lost on restart. Use fileAttemptStore for resume after a restart. */
export class MemoryAttemptStore implements AttemptStore {
  private readonly attempts = new Map<string, SpendAttempt>();

  async get(quoteId: string): Promise<SpendAttempt | undefined> {
    return this.attempts.get(quoteId);
  }

  async put(attempt: SpendAttempt): Promise<void> {
    this.attempts.set(attempt.quoteId, { ...attempt });
  }
}

/**
 * A JSON file store. Writes are atomic (temp file, then rename) and the file is created with mode 0600.
 * Keep it on a private path. It contains signed authorizations, not keys.
 */
export function fileAttemptStore(path: string): AttemptStore {
  async function load(): Promise<Record<string, SpendAttempt>> {
    try {
      const text = await readFile(path, "utf8");
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, SpendAttempt>) : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }
  return {
    async get(quoteId) {
      return (await load())[quoteId];
    },
    async put(attempt) {
      const all = await load();
      all[attempt.quoteId] = attempt;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(all, null, 2), { mode: 0o600 });
      await rename(temp, path);
    },
  };
}
