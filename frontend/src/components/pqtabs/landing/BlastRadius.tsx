"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Users } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Reveal, SpotlightCard } from "@/components/pqtabs/shared";

/**
 * BlastRadius — the interactive model of the core promise.
 *
 * The visitor sets a share of a treasury. No account balance is shown.
 * The reachable sliver animates against the protected remainder.
 */

const MIN_SHARE = 1;
const MAX_SHARE = 20;
const SHARE_STEP = 1;

const pct = (n: number) => `${n}%`;

export default function BlastRadius() {
  const [share, setShare] = useState(5);
  const reduced = useReducedMotion();

  const perCall = Math.max(1, Math.round(share / 10));
  const protectedShare = 100 - share;
  const reachPct = share;

  return (
    <Reveal>
      <SpotlightCard className="rounded-2xl border border-white/[.07] bg-[#0e1013] p-6 transition-colors duration-300 hover:border-gold/25 md:p-10">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-gold">
            Interactive
          </span>
          <span className="h-px w-8 bg-gold/40" aria-hidden="true" />
        </div>
        <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          How far can a compromised agent reach?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Adjust the capability you grant — the boundary recomputes.
        </p>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* Controls */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Example model, not an account
            </p>
            <p className="mt-2 font-display text-4xl font-semibold tabular text-foreground md:text-5xl">
              {pct(protectedShare)} protected
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <Users className="size-3.5 text-gold/70" strokeWidth={1.5} aria-hidden="true" />
                3 approved recipients
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <Clock className="size-3.5 text-gold/70" strokeWidth={1.5} aria-hidden="true" />
                Expires in 24h
              </span>
            </div>

            <div className="my-8 h-px w-full bg-white/[.06]" aria-hidden="true" />

            <div className="flex items-end justify-between gap-4">
              <span className="pb-1 text-sm text-muted-foreground">
                Size of the capability you grant
              </span>
              <span className="font-display text-3xl font-semibold tabular text-gold">
                {pct(share)}
              </span>
            </div>
            <Slider
              className="mt-5"
              value={[share]}
              min={MIN_SHARE}
              max={MAX_SHARE}
              step={SHARE_STEP}
              onValueChange={(v) => setShare(v[0])}
              aria-label="Share of a treasury this capability can reach"
            />
            <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="tabular">{pct(MIN_SHARE)}</span>
              <span className="text-center">
                Per payment stays inside{" "}
                <span className="tabular text-foreground">{pct(perCall)}</span>
              </span>
              <span className="tabular">{pct(MAX_SHARE)}</span>
            </div>
          </div>

          {/* Result */}
          <div>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
              <span className="text-gold">Reachable</span>
              <span className="text-muted-foreground">
                Remainder · <span className="tabular">{pct(protectedShare)}</span>
              </span>
            </div>

            <div className="relative mt-3 h-16 overflow-hidden rounded-lg border border-white/[.07] bg-white/[.05]">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(135deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 9px)",
                }}
                aria-hidden="true"
              />
              <motion.div
                className="absolute inset-y-0 left-0 min-w-[4px] rounded-l-lg bg-gradient-to-r from-gold/60 to-gold"
                initial={false}
                animate={{ width: `${reachPct}%` }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "tween", duration: 0.3, ease: "easeOut" }
                }
              >
                <span
                  className="absolute inset-y-0 right-0 w-[2px] bg-gold-soft"
                  aria-hidden="true"
                />
              </motion.div>
              <span className="absolute bottom-2 right-3 font-mono text-[10px] uppercase tracking-[0.16em] text-success/85">
                Protected · <span className="tabular">{pct(protectedShare)}</span>
              </span>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold/80">
                  Maximum reachable
                </p>
                <p className="mt-1.5 font-display text-4xl font-semibold tabular text-gold">
                  {pct(share)}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-success/80">
                  Protected
                </p>
                <p className="mt-1.5 font-display text-4xl font-semibold tabular text-success">
                  {pct(protectedShare)}
                </p>
              </div>
            </div>

            <p className="mt-8 border-t border-white/[.06] pt-5 font-mono text-[11px] leading-relaxed text-muted-foreground">
              The agent can never reach the rest — not with the key, not with
              the cap, not with time.
            </p>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          Capability share {pct(share)}. Maximum reachable {pct(share)}, protected{" "}
          {pct(protectedShare)}, per payment inside {pct(perCall)}.
        </p>
      </SpotlightCard>
    </Reveal>
  );
}
