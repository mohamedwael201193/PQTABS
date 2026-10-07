"use client";

import { useEffect, useState } from "react";
import type { AccountSnapshot } from "@/data/types";
import { currentRegistrar, loadSnapshot, rememberRegistrar } from "@/data/production";
import { usePqtabsData } from "@/lib/store";

/**
 * Loads one registrar's root from the production backend. The backend reads
 * Arc. This hook does not invent balances.
 */
export function useAccountData(): {
  snapshot: AccountSnapshot | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const registrar = usePqtabsData((state) => state.registrar);
  const setRegistrar = usePqtabsData((state) => state.setRegistrar);
  const replaceSnapshot = usePqtabsData((state) => state.replaceSnapshot);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = currentRegistrar();
    if (stored !== registrar) setRegistrar(stored);
    setHydrated(true);
  }, [registrar, setRegistrar]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSnapshot(null);
    loadSnapshot(registrar)
      .then((data) => {
        if (cancelled) return;
        replaceSnapshot(data);
        setSnapshot(data);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Couldn't load your treasury.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, hydrated, registrar, replaceSnapshot]);

  const retry = () => {
    setError(null);
    setAttempt((value) => value + 1);
  };

  return { snapshot, loading, error, retry };
}

export function switchRegistrar(address: string): void {
  rememberRegistrar(address);
  usePqtabsData.getState().setRegistrar(address);
}
