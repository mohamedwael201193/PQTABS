"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/pqtabs/shared";

export type StatAccent = "gold" | "teal" | "success" | "none";

const ACCENT_TEXT: Record<StatAccent, string> = {
  gold: "text-gold",
  teal: "text-teal",
  success: "text-success",
  none: "text-foreground",
};

/**
 * StatCard — a single key figure on the dashboard.
 * Mono micro label, display-font value, optional muted sub line.
 * Entrance is a shared Reveal so grids can stagger via `delay`.
 */
export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "none",
  delay = 0,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: StatAccent;
  delay?: number;
  className?: string;
}) {
  return (
    <Reveal delay={delay} y={12} className={className}>
      <div className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          {icon && (
            <span
              className={cn(
                "shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5",
                accent === "none" ? "text-muted-foreground/70" : ACCENT_TEXT[accent]
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
        </div>
        <p
          className={cn(
            "mt-3 font-display text-2xl font-semibold leading-none tabular md:text-[1.75rem]",
            ACCENT_TEXT[accent]
          )}
        >
          {value}
        </p>
        {sub && <div className="mt-2.5 text-xs text-muted-foreground">{sub}</div>}
      </div>
    </Reveal>
  );
}
