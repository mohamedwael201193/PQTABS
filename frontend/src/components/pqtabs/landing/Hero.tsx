"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroVisual from "./HeroVisual";
import HeroParticles from "./HeroParticles";

/**
 * Hero: the statement on the left, the architecture on the right at a
 * compact size. Gutters are narrow and the container is wide so the
 * composition uses the screen. On phones the statement comes first and
 * the diagram follows.
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
    <section
      id="top"
      className="relative flex min-h-[100dvh] items-center pb-12 pt-24 md:pt-28 lg:pb-16"
    >
      {/* Atmosphere: a gold horizon at the top, a fine grid, a slow glow
          behind the diagram, and a bottom vignette into the page. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 42% at 50% 0%, rgba(226,181,62,0.08), transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute right-[-8%] top-[18%] h-[460px] w-[460px] animate-pulse-soft rounded-full bg-gold/[.07] blur-3xl [--pulse-duration:12s]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background/70 md:h-40"
        aria-hidden="true"
      />

      {/* Narrow gutters, wide container: the composition fills the screen. */}
      <div className="relative mx-auto grid w-full max-w-[1640px] items-center gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-10">
        {/* Architecture: left and compact on large screens. */}
        <motion.div
          {...rise(0.6)}
          className="relative order-2 lg:order-2 lg:col-span-5"
        >
          <HeroParticles className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(520px,100%)] -z-10 -translate-x-1/2 -translate-y-1/2" />
          <HeroVisual />
        </motion.div>

        {/* Statement: left on large screens. */}
        <div className="order-1 lg:order-1 lg:col-span-7 lg:pr-4">
          <motion.div {...rise(0.05)} className="flex items-center gap-3">
            <span className="h-px w-8 bg-gold/40" aria-hidden="true" />
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-gold">
              Agent spending, bounded
            </p>
          </motion.div>

          <h1 className="mt-6 font-display text-[2.1rem] font-semibold leading-[1.05] tracking-tight text-foreground sm:text-[2.6rem] lg:text-[clamp(2.6rem,3.7vw,3.6rem)]">
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

          <motion.p
            {...rise(0.52)}
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground md:text-base"
          >
            Agents get bounded USDC capabilities on Arc: a cap, an expiry, and approved
            payees. A post-quantum security key keeps the treasury. The connected wallet
            does not sign an open or a close.
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
          <motion.p {...rise(0.74)} className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <a href="/developers" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
              Developer setup
            </a>
            <a href="#proof" className="underline decoration-white/20 underline-offset-2 hover:text-foreground">
              Mainnet proofs
            </a>
            <a
              href="https://github.com/mohamedwael201193/PQTABS"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-2 hover:text-foreground"
            >
              GitHub
            </a>
          </motion.p>
        </div>
      </div>
    </section>
  );
}
