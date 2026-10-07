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
  className,
}: {
  totals: TreasuryTotals;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const total = totals.treasuryTotalUsd;
  const base = total > 0 ? total : 0;

  const allocated = Math.max(0, totals.allocatedUsd);
  const reclaimable = Math.max(0, totals.reclaimableUsd);
  const available = Math.max(0, total - allocated - reclaimable);

  const share = (n: number) => (base > 0 ? (n / base) * 100 : 0);
  const allocatedPct = share(allocated);

  const segments = [
    {
      key: "available",
      value: available,
      share: share(available),
      bar: "bg-white/[.06]",
      text: "text-muted-foreground",
    },
    {
      key: "allocated",
      value: allocated,
      share: allocatedPct,
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
            {usd(totals.treasuryTotalUsd)}
          </p>
        </div>
        <p className="font-mono text-[11px] tabular text-muted-foreground">
          {pct(allocatedPct)} allocated
        </p>
      </div>

      {/* Segmented bar */}
      <div
        className="relative mt-3 flex h-14 overflow-hidden rounded-xl border border-white/[.08] bg-[#0e1013] md:h-16"
        role="img"
        aria-label={`Treasury of ${usd(total)}: ${usd(available)} still in the root, ${usd(allocated)} allocated to capabilities, ${usd(reclaimable)} awaiting reclaim`}
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
        <LegendRow dot="bg-white/25" label="Still in the root" value={usd(available)} />
        <LegendRow
          dot="bg-gold"
          label="Allocated to capabilities"
          value={usd(allocated)}
        />
        {reclaimable > 0 && (
          <LegendRow dot="bg-warning" label="Awaiting reclaim" value={usd(reclaimable)} />
        )}
      </div>
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
