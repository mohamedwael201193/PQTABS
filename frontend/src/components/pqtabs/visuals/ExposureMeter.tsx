"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { TreasuryTotals } from "@/data/types";
import { pct, usd } from "@/data/formatters";
import { cn } from "@/lib/utils";

/**
 * ExposureMeter — how the treasury is partitioned, as one horizontal
 * composition: unallocated funds, caps committed to active capabilities,
 * and expired balances waiting to be reclaimed. Widths ease in on first
 * view; quarter tick marks keep the proportions readable.
 */
export function ExposureMeter({
  totals,
  capabilitiesKnown = true,
  treasuryKnown = true,
  className,
}: {
  totals: TreasuryTotals;
  capabilitiesKnown?: boolean;
  treasuryKnown?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const inRoot = Math.max(0, totals.treasuryTotalUsd);
  const reach = Math.max(0, totals.exposureUsd);
  const reclaimable = Math.max(0, totals.reclaimableUsd);
  const held = inRoot + reach + reclaimable;

  const share = (n: number) => (held > 0 ? (n / held) * 100 : 0);
  const reachPct = share(reach);

  const segments = [
    {
      key: "available",
      value: inRoot,
      share: share(inRoot),
      bar: "bg-white/[.06]",
      text: "text-muted-foreground",
    },
    {
      key: "allocated",
      value: reach,
      share: reachPct,
      bar: "bg-gold/85",
      text: "text-[#171204]",
    },
    {
      key: "reclaimable",
      value: reclaimable,
      share: share(reclaimable),
      bar: "bg-warning/80",
      text: "text-[#171204]",
    },
  ];

  return (
    <div className={cn("w-full", className)}>
      {/* Headline figures */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Treasury
          </p>
          <p className="mt-1 font-display text-xl font-semibold leading-none tabular text-foreground">
            {treasuryKnown ? usd(held) : "—"}
          </p>
        </div>
        <p className="font-mono text-[11px] tabular text-muted-foreground">
          {pct(reachPct)} an agent can reach
        </p>
      </div>

      {/* Segmented bar */}
      <div
        className="relative mt-3 flex h-14 overflow-hidden rounded-xl border border-white/[.08] bg-[#0e1013] md:h-16"
        role="img"
        aria-label={
          capabilitiesKnown
            ? `Funds held ${usd(held)}: ${usd(inRoot)} still in the root, ${usd(reach)} an agent can reach, ${usd(reclaimable)} awaiting reclaim`
            : `Root balance ${usd(inRoot)}. What an agent can reach is not loaded yet.`
        }
      >
        {segments.map((s, i) => (
          <motion.div
            key={s.key}
            initial={reduced ? false : { width: "0%" }}
            whileInView={{ width: `${s.share}%` }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.7,
              delay: i * 0.06,
              ease: [0.21, 0.47, 0.32, 0.98],
            }}
            className={cn("relative h-full min-w-0 overflow-hidden", s.bar)}
          >
            {s.share >= 12 && (
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center font-mono text-[10px] tabular",
                  s.text
                )}
              >
                {pct(s.share)}
              </span>
            )}
          </motion.div>
        ))}
        {/* Quarter tick marks */}
        {[25, 50, 75].map((t) => (
          <span
            key={t}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/10"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendRow dot="bg-white/25" label="Still in the root" value={usd(inRoot)} />
        <LegendRow dot="bg-gold" label="An agent can reach" value={capabilitiesKnown ? usd(reach) : "not loaded"} />
        {reclaimable > 0 && (
          <LegendRow dot="bg-warning" label="Awaiting reclaim" value={usd(reclaimable)} />
        )}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {!capabilitiesKnown
          ? "The capability list has not finished, so what an agent can reach is not shown yet."
          : reach > 0
            ? `An agent can reach ${usd(reach)}. The ${usd(inRoot)} still in the root is outside that capability.`
            : "No capability is open, so an agent cannot spend this treasury."}
      </p>
    </div>
  );
}

function LegendRow({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] tabular text-muted-foreground">
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      {label}
      <span className="text-foreground">{value}</span>
    </span>
  );
}

export default ExposureMeter;
