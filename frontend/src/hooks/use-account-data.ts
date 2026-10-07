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
  const [attempt, setAttempt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [settled, setSettled] = useState<{ key: string; error: string | null }>({ key: "", error: null });

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

  const requestKey = registrar ? `${registrar.toLowerCase()}:${attempt}` : "";

  useEffect(() => {
    if (!hydrated || !registrar) return;
    let cancelled = false;
    let treasuryShown = false;
    const key = `${registrar.toLowerCase()}:${attempt}`;
    const stillHere = () => usePqtabsData.getState().registrar.toLowerCase() === registrar.toLowerCase();
    const gate = { cancelled: false, onIndex: (note: string) => usePqtabsData.getState().setIndexNote(note) };
    setPortfolioReady(false);
    setPortfolioError(null);
    loadAccount(registrar, (treasury) => {
      if (cancelled || !stillHere()) return;
      treasuryShown = true;
      replaceSnapshot(treasury);
      setSnapshot(treasury);
      setSettled({ key, error: null });
    }, gate)
      .then((data) => {
        if (cancelled || !stillHere()) return;
        if (data.indexFreshness === "indexing" && data.tabs.length === 0) return;
        usePqtabsData.getState().acceptPortfolio(data);
        if (data.indexFreshness && data.indexFreshness !== "live" && data.indexedThrough) {
          usePqtabsData.getState().setIndexNote(`Updated through Arc block ${data.indexedThrough}`);
        }
        setSnapshot(data);
        setPortfolioReady(true);
        setPortfolioError(null);
        setSettled({ key, error: null });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Couldn't load your treasury.";
        if (treasuryShown) setPortfolioError(message);
        if (!treasuryShown) setSnapshot(null);
        setSettled({ key, error: message });
      });
    return () => {
      cancelled = true;
      gate.cancelled = true;
    };
  }, [attempt, hydrated, registrar, replaceSnapshot, setPortfolioError, setPortfolioReady]);

  const retry = () => setAttempt((value) => value + 1);
  const settledHere = settled.key === requestKey;
  const loading = !hydrated || (requestKey !== "" && !settledHere);
  const error = settledHere ? settled.error : null;

  return { snapshot: requestKey === "" ? null : settledHere ? snapshot : null, loading, error, retry };
}

export function switchRegistrar(address: string): void {
  rememberRegistrar(address);
  usePqtabsData.getState().setRegistrar(address);
}
