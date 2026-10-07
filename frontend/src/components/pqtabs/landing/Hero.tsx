"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon3D } from "@/components/pqtabs/shared";
import HeroVisual from "./HeroVisual";
import HeroParticles from "./HeroParticles";

/**
 * Hero — the opening statement.
 *
 * A masked clip reveal lifts each headline line out of its own overflow
 * mask; the rest of the column follows in a staggered choreography that
 * hands off to the HeroVisual composition below, now sitting inside a
 * slowly rotating gold particle constellation. The atmosphere stack —
 * horizon, grid, a breathing gold orb, and a bottom vignette — keeps the
 * canvas deep without ever competing with the type.
 */

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export default function Hero({ onLaunchApp }: { onLaunchApp: () => void }) {
  const reduced = useReducedMotion();

  // Masked line reveal — the wrapper's padding keeps descenders and
  // ascenders inside the clip box; the negative margins restore the
  // tight 1.02 leading of the headline.
  const lineReveal = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { y: "130%" },
          animate: { y: "0%" },
          transition: { duration: 0.9, delay, ease: EASE },
        } as const);

  const rise = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: EASE },
        } as const);

  return (
    <section id="top" className="relative pb-10 pt-36 md:pb-16 md:pt-44">
      {/* Atmosphere stack — gold horizon, fine grid, a breathing orb in the
          upper right, and a vignette that sinks the composition into the
          page at the bottom edge. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 44% at 50% 0%, rgba(226,181,62,0.08), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-32 -top-24 h-[380px] w-[380px] animate-pulse-soft rounded-full bg-gold/[.06] blur-3xl [--pulse-duration:12s]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent to-background/70 md:h-48"
        aria-hidden="true"
      />

      {/* 3D accent — the boundary itself, floating far from the copy */}
      <span
        className="pointer-events-none absolute right-[6%] top-[220px] hidden opacity-90 xl:block"
        aria-hidden="true"
      >
        <Icon3D name="shield" size={44} float decorative />
      </span>

      <div className="relative mx-auto w-full max-w-6xl px-5 md:px-8">
        {/* Eyebrow */}
        <motion.div {...rise(0.05)} className="flex items-center gap-3">
          <span className="h-px w-8 bg-gold/40" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold">
            Post-Quantum Spending Boundaries
          </p>
          <span className="hidden h-px w-8 bg-gold/40 sm:block" aria-hidden="true" />
        </motion.div>

        {/* Headline — masked line reveal. Each mask carries symmetric
            padding so ascender/descender ink stays inside the clip box;
            the negative margins restore the tight 1.02 leading. */}
        <h1 className="mt-7 max-w-4xl font-display text-[2.75rem] font-semibold leading-[1.02] tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-[5.5rem]">
          <span className="-mb-[0.16em] block overflow-hidden pb-[0.16em] pt-[0.14em]">
            <motion.span className="block will-change-transform" {...lineReveal(0.18)}>
              Give agents spending power.
            </motion.span>
          </span>
          <span className="-mt-[0.14em] -mb-[0.16em] block overflow-hidden pb-[0.16em] pt-[0.14em]">
            <motion.span className="block will-change-transform" {...lineReveal(0.3)}>
              <span className="text-shimmer">Never give them</span> your
              treasury.
            </motion.span>
          </span>
        </h1>

        {/* Sub copy */}
        <motion.p
          {...rise(0.52)}
          className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg"
        >
          PQTABS creates post-quantum secured spending boundaries for
          autonomous agents. Every capability your agents hold is constrained
          by programmable policy — enforced onchain, not by a dashboard.
        </motion.p>

        {/* CTAs */}
        <motion.div {...rise(0.64)} className="mt-8 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={onLaunchApp}
            className="group relative h-11 overflow-hidden rounded-lg bg-gold px-6 text-sm font-medium text-[#171204] hover:bg-[#eec95e] hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]"
          >
            Launch App
            <ArrowRight
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            {/* Shimmer sweep — a skewed light slash crosses the button */}
            <span
              className="pointer-events-none absolute inset-0 -translate-x-[120%] skew-x-[-12deg] bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[120%]"
              aria-hidden="true"
            />
          </Button>
          <a
            href="#how"
            className="focus-ring inline-flex h-11 items-center rounded-lg border border-white/10 bg-white/[.03] px-6 text-sm font-medium text-foreground transition-colors hover:bg-white/[.06]"
          >
            See How It Works
          </a>
        </motion.div>

        {/* Status line */}
        <motion.p
          {...rise(0.74)}
          className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          <span>Post-quantum authorization</span>
          <span className="h-1 w-1 rounded-full bg-gold/70" aria-hidden="true" />
          <span>Arc</span>
          <span className="h-1 w-1 rounded-full bg-gold/70" aria-hidden="true" />
          <span>USDC</span>
          <span className="opacity-90">
            <Icon3D name="coin" size={40} float decorative />
          </span>
        </motion.p>

        {/* The architecture composition — a gold dot-matrix constellation
            drifts behind the drawing (negative z, above the canvas). */}
        <motion.div {...rise(0.85)} className="relative mt-10 md:mt-16">
          <HeroParticles className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(600px,92vw)] -z-10 -translate-x-1/2 -translate-y-1/2" />
          <HeroVisual />
        </motion.div>
      </div>
    </section>
  );
}
