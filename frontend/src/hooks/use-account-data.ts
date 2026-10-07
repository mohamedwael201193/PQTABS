"use client";

import { useEffect, useState } from "react";
import type { AccountSnapshot } from "@/data/types";
import { loadAccount, rememberRegistrar } from "@/data/production";
import { existingAccount, watchChain, watchWallet, walletClient } from "@/data/wallet";
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
  const setChainId = usePqtabsData((state) => state.setChainId);
  const setPortfolioReady = usePqtabsData((state) => state.setPortfolioReady);
  const setPortfolioError = usePqtabsData((state) => state.setPortfolioError);
  const replaceSnapshot = usePqtabsData((state) => state.replaceSnapshot);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    existingAccount()
      .then((address) => {
        if (cancelled) return;
        if (address && address.toLowerCase() !== registrar.toLowerCase()) {
          window.localStorage.removeItem("pqtabs.root");
          rememberRegistrar(address);
          setRegistrar(address);
        }
        if (!address && registrar) setRegistrar("");
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [registrar, setRegistrar]);

  useEffect(() => {
    let stop = () => {};
    try {
      stop = watchWallet((address) => {
        window.localStorage.removeItem("pqtabs.root");
        if (address) {
          rememberRegistrar(address);
          setRegistrar(address);
        } else {
          window.localStorage.removeItem("pqtabs.registrar");
          setRegistrar("");
        }
      });
    } catch {
      stop = () => {};
    }
    return stop;
  }, [setRegistrar]);

  useEffect(() => {
    if (!registrar) return;
    let stop = () => {};
    walletClient()
      .getChainId()
      .then(setChainId)
      .catch(() => setChainId(null));
    try {
      stop = watchChain(setChainId);
    } catch {
      stop = () => {};
    }
    return stop;
  }, [registrar, setChainId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!registrar) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    let treasuryShown = false;
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setPortfolioReady(false);
    setPortfolioError(null);
    loadAccount(registrar, (treasury) => {
      if (cancelled) return;
      treasuryShown = true;
      replaceSnapshot(treasury);
      setSnapshot(treasury);
      setLoading(false);
    })
      .then((data) => {
        if (cancelled) return;
        replaceSnapshot(data);
        setSnapshot(data);
        setPortfolioReady(true);
        setPortfolioError(null);
        setLoading(false);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Couldn't load your treasury.";
        setError(message);
        setLoading(false);
        if (treasuryShown) setPortfolioError(message);
        if (!treasuryShown) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, hydrated, registrar, replaceSnapshot, setPortfolioError, setPortfolioReady]);

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
