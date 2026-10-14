"use client";

import type { Address } from "viem";
import type { AccountSnapshot } from "@/data/types";
import { readRootUsdc } from "@/data/wallet";
import { usePqtabsData } from "@/lib/store";

/** Read the root's USDC and show it. An older in-flight read cannot overwrite a newer one. */
export async function syncRootCash(root: string, attempts = 3): Promise<bigint | null> {
  if (!root) return null;
  const readId = usePqtabsData.getState().beginBalanceRead();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const raw = await readRootUsdc(root as Address);
      const live = usePqtabsData.getState();
      if (live.snapshot.account.rootAddress?.toLowerCase() !== root.toLowerCase()) return null;
      live.setRootCash(root, raw, readId);
      return raw;
    } catch {
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
      }
    }
  }
  return null;
}

/** Keep the latest chain balance when a portfolio response is still behind the receipt. */
export async function publishSnapshot(registrar: string, snapshot: AccountSnapshot): Promise<void> {
  if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) return;
  if (snapshot.account.rootAddress) await syncRootCash(snapshot.account.rootAddress);
  if (usePqtabsData.getState().registrar.toLowerCase() !== registrar.toLowerCase()) return;
  usePqtabsData.getState().acceptPortfolio(snapshot);
}
