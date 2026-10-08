"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import LandingPage from "@/components/pqtabs/landing/LandingPage";

async function permittedAccount(): Promise<string | null> {
  const ethereum = (window as Window & {
    ethereum?: { request: (args: { method: string }) => Promise<unknown>; selectedAddress?: string };
  }).ethereum;
  if (!ethereum) return null;
  const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
  const selected = ethereum.selectedAddress;
  const match = selected ? accounts.find((item) => item.toLowerCase() === selected.toLowerCase()) : undefined;
  return match ?? accounts[0] ?? null;
}

/**
 * PqtabsRoot — the single-route application shell. The site and the product
 * live on `/` and switch in-place with a cinematic transition (no route
 * change; dashboard state is preserved while switching). The dashboard is
 * code-split so the landing experience loads as fast as possible.
 */

const DashboardApp = dynamic(
  () => import("@/components/pqtabs/dashboard/DashboardApp"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold"
          role="status"
          aria-label="Loading application"
        />
      </div>
    ),
  }
);

export function PqtabsRoot() {
  const [mode, setMode] = useState<"landing" | "app">("landing");
  const [pending, setPending] = useState(true);
  const stayOnLanding = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      for (let attempt = 0; attempt < 8; attempt++) {
        if (cancelled || stayOnLanding.current) return;
        const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
        if (window.sessionStorage.getItem("pqtabs.paused") === "1") {
          setPending(false);
          return;
        }
        if (ethereum) {
          const address = await permittedAccount().catch(() => null);
          if (cancelled || stayOnLanding.current) return;
          if (address) setMode("app");
          setPending(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!cancelled && !stayOnLanding.current) setPending(false);
    };
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold"
          role="status"
          aria-label="Loading application"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait" initial={false}>
        {mode === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            <LandingPage
              onLaunchApp={() => {
                stayOnLanding.current = false;
                setMode("app");
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            <DashboardApp
              onExit={() => {
                stayOnLanding.current = true;
                setMode("landing");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PqtabsRoot;
