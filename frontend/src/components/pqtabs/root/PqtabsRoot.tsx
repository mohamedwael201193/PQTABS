"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import LandingPage from "@/components/pqtabs/landing/LandingPage";

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
            <LandingPage onLaunchApp={() => setMode("app")} />
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            <DashboardApp onExit={() => setMode("landing")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PqtabsRoot;
