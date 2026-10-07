import { type Address, getAddress, type PublicClient } from "viem";
import { assertOurRoot, factoryAbi, rootAbi, usdcAbi, withRpcRetry } from "../chain.js";
import { USDC } from "../constants.js";
import { RequestError } from "../validate.js";
import { liveReadsPaused, noteRateLimit } from "./lane.js";
import type { Sql } from "./sql.js";

export type RootView = {
  root: Address;
  pqVk: string;
  registrar: string;
  nextNonce: string;
  maxOpenExposure: string;
  openExposure: string;
  usdc: string;
  /** False when nonce, exposure, or balance were not read from Arc for this response. */
  balancesConfirmed: boolean;
};

type RootRow = {
  registrar: string;
  verifying_key: string;
  max_exposure: string;
  usdc_balance: string | null;
  open_exposure: string | null;
  next_nonce: string | null;
};

type CachedRoot = Omit<RootView, "root" | "balancesConfirmed">;

type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: Error };

const rootCache = new Map<string, CachedRoot>();

function unavailable(): RequestError {
  return new RequestError(503, "unavailable", "Arc is temporarily unavailable. Your funds are safe. Try again.");
}

function isRateLimit(error: unknown): boolean {
  if (error instanceof RequestError && error.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.toLowerCase().includes("rate limit") || message.includes("-32005");
}

export async function readRegistrarRoots(sql: Sql, client: PublicClient, factory: Address, registrar: Address): Promise<Address[]> {
  const rows = await sql.query<{ address: string }>(
    "SELECT address FROM roots WHERE lower(registrar) = lower($1) ORDER BY created_block, created_log_index",
    [registrar],
  );
  if (rows.length > 0) return rows.map((row) => getAddress(row.address));
  if (liveReadsPaused()) throw unavailable();
  try {
    const count = await withRpcRetry(
      () => client.readContract({ address: factory, abi: factoryAbi, functionName: "rootCount", args: [registrar] }),
      1,
    );
    const roots: Address[] = [];
    for (let index = 0n; index < count; index++) {
      roots.push(
        await withRpcRetry(
          () => client.readContract({ address: factory, abi: factoryAbi, functionName: "rootAt", args: [registrar, index] }),
          1,
        ),
      );
    }
    return roots;
  } catch (error) {
    if (isRateLimit(error)) {
      noteRateLimit();
      throw unavailable();
    }
    throw error;
  }
}

export async function readRootState(sql: Sql, client: PublicClient, factory: Address, root: Address): Promise<RootView> {
  const key = root.toLowerCase();
  const [rows, rotated] = await Promise.all([
    sql.query<RootRow>(
      "SELECT registrar, verifying_key, max_exposure, usdc_balance, open_exposure, next_nonce FROM roots WHERE lower(address) = lower($1)",
      [root],
    ),
    sql.query<{ kind: string }>("SELECT kind FROM activity WHERE lower(root) = lower($1) AND kind = 'rotated' LIMIT 1", [root]),
  ]);
  const row = rows[0];
  if (row) return viewFrom(root, row, rotated.length > 0);
  try {
    const live = await liveRoot(client, factory, root, false);
    rootCache.set(key, live);
    return { root, ...live, balancesConfirmed: true };
  } catch (error) {
    if (error instanceof RequestError && error.code === "unknown_root") throw error;
    if (!isRateLimit(error)) throw error;
    noteRateLimit();
    const cached = rootCache.get(key);
    if (cached) return { root, ...cached, balancesConfirmed: false };
    throw unavailable();
  }
}

function viewFrom(root: Address, row: RootRow, rotated: boolean): RootView {
  const confirmed = row.usdc_balance != null && row.usdc_balance !== "";
  return {
    root,
    pqVk: rotated ? "" : row.verifying_key,
    registrar: row.registrar,
    nextNonce: row.next_nonce ?? "",
    maxOpenExposure: row.max_exposure,
    openExposure: row.open_exposure ?? "",
    usdc: row.usdc_balance ?? "",
    balancesConfirmed: confirmed,
  };
}

async function liveRoot(client: PublicClient, factory: Address, root: Address, known: boolean): Promise<CachedRoot> {
  if (!known) await assertOurRoot({ public: client, relayer: null, relayerAddress: null, factory }, root, 1);
  const details = (await withRpcRetry(
    () =>
      client.multicall({
        contracts: [
          { address: root, abi: rootAbi, functionName: "pqVk" },
          { address: root, abi: rootAbi, functionName: "registrar" },
          { address: root, abi: rootAbi, functionName: "nextNonce" },
          { address: root, abi: rootAbi, functionName: "maxOpenExposure" },
          { address: root, abi: rootAbi, functionName: "openExposure" },
          { address: USDC as Address, abi: usdcAbi, functionName: "balanceOf", args: [root] },
        ],
        allowFailure: true,
      }),
    1,
  )) as readonly CallResult[];
  return {
    pqVk: value(details, 0) as string,
    registrar: value(details, 1) as string,
    nextNonce: (value(details, 2) as bigint).toString(),
    maxOpenExposure: (value(details, 3) as bigint).toString(),
    openExposure: (value(details, 4) as bigint).toString(),
    usdc: (value(details, 5) as bigint).toString(),
  };
}

function value(results: readonly CallResult[], index: number): unknown {
  const row = results[index];
  if (!row || row.status === "failure") throw row && row.status === "failure" ? row.error : new Error("Arc read failed");
  return row.result;
}
