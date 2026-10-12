"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroVisual from "./HeroVisual";
import HeroParticles from "./HeroParticles";

/**
 * Hero: one headline, one sentence, one primary action, and the
 * architecture drawn beside them. The headline stays on two lines from
 * tablet width up, and the diagram carries the explanation so the copy
 * can stay short. The copy column and the diagram share one grid row
 * on large screens and stack on phones.
 */

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export default function Hero({ onLaunchApp }: { onLaunchApp: () => void }) {
  const reduced = useReducedMotion();

  // Masked line reveal. The wrapper padding keeps ascenders and
  // descenders inside the clip box; the negative margins restore the
  // tight headline leading.
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
    <section id="top" className="relative min-h-[100dvh] pb-14 pt-28 md:pt-32 lg:pb-20">
      {/* Atmosphere: a faint gold horizon, a fine grid, a slow orb, and a
          bottom vignette that sinks the hero into the page. */}
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

      <div className="relative mx-auto w-full max-w-7xl px-5 md:px-8">
        {/* Eyebrow: the only small label in the hero. */}
        <motion.div {...rise(0.05)} className="flex items-center gap-3">
          <span className="h-px w-8 bg-gold/40" aria-hidden="true" />
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold">
            Agent spending, bounded
          </p>
        </motion.div>

        {/* Headline: two lines, sized for reading rather than display. */}
        <h1 className="mt-6 max-w-5xl font-display text-[2rem] font-semibold leading-[1.06] tracking-tight text-foreground sm:text-[2.75rem] lg:text-[3.5rem]">
          <span className="-mb-[0.16em] block overflow-hidden pb-[0.16em] pt-[0.14em]">
            <motion.span className="block will-change-transform" {...lineReveal(0.18)}>
              Give agents spending power.
            </motion.span>
          </span>
          <span className="-mt-[0.14em] -mb-[0.16em] block overflow-hidden pb-[0.16em] pt-[0.14em]">
            <motion.span className="block will-change-transform" {...lineReveal(0.3)}>
              <span className="text-shimmer">Never give them</span> your treasury.
            </motion.span>
          </span>
        </h1>

        {/* Copy and diagram share a row on large screens. */}
        <div className="mt-10 grid items-center gap-10 lg:mt-12 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-4">
            <motion.p
              {...rise(0.52)}
              className="max-w-sm text-base leading-relaxed text-muted-foreground md:text-lg"
            >
              Agents get bounded USDC capabilities on Arc: a cap, an expiry, one payee. A
              post-quantum root keeps the treasury.
            </motion.p>

            <motion.div {...rise(0.64)} className="mt-8 flex flex-wrap gap-3">
              <Button
                size="lg"
                onClick={onLaunchApp}
                className="group relative h-11 overflow-hidden rounded-lg bg-gold px-6 text-sm font-medium text-[#171204] hover:bg-[#eec95e] hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]"
              >
                Connect wallet
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
                {/* Shimmer sweep: a skewed light slash crosses the button. */}
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
          </div>

          {/* The architecture: a gold constellation drifts behind the drawing. */}
          <motion.div {...rise(0.85)} className="relative lg:col-span-8">
            <HeroParticles className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(600px,92vw)] -z-10 -translate-x-1/2 -translate-y-1/2" />
            <HeroVisual />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
