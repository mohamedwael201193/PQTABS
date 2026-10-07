"use client";

import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Icon3D,
  PQSigil,
  Reveal,
  SectionShell,
} from "@/components/pqtabs/shared";

/**
 * FinalCta — the cinematic close.
 * The treasury vault levitates inside a slow gold orbit ring with twinkling
 * sentinel dots; the root sigil breathes on the vault's lower edge. Radial
 * gold atmosphere and a fading grid, no rectangle edges. The second headline
 * line carries a slow gold shimmer sweep.
 */

/**
 * Sentinel dots on the orbit ring — fixed angles (22.5° + k·45°, measured
 * from the top, going clockwise), expressed as percent of the ring box.
 * Deterministic: no randomness at render.
 */
const RING_DOTS = [
  { left: "96.2%", top: "69.2%" },
  { left: "69.2%", top: "96.2%" },
  { left: "30.8%", top: "96.2%" },
  { left: "3.8%", top: "69.2%" },
  { left: "3.8%", top: "30.8%" },
  { left: "30.8%", top: "3.8%" },
  { left: "69.2%", top: "3.8%" },
  { left: "96.2%", top: "30.8%" },
] as const;

export default function FinalCta({ onLaunchApp }: { onLaunchApp: () => void }) {
  const reduced = useReducedMotion();

  return (
    <SectionShell index="10" label="Launch">
      <div className="relative overflow-hidden py-14 text-center md:py-24">
        {/* Atmosphere — radial glow + grid fade, no hard edges */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 52% 46% at 50% 40%, rgba(226,181,62,0.10), transparent 70%)",
          }}
          aria-hidden="true"
        />
        <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />

        {/* Centerpiece — the treasury vault in a slow gold orbit */}
        <Reveal>
          <div className="relative mx-auto w-fit">
            {/* Soft gold glow underneath the vault */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-[calc(50%-190px)] top-[calc(50%-190px)] h-[380px] w-[380px] animate-pulse-soft rounded-full bg-gold/[.10] blur-3xl"
              style={{ ["--pulse-duration" as string]: "7s" } as CSSProperties}
            />

            {/* Orbit — dotted ring with one traveling arc, sentinels twinkle in place */}
            <div
              aria-hidden="true"
              className="relative aspect-square w-[264px] md:w-[400px]"
            >
              <svg
                viewBox="0 0 400 400"
                className="absolute inset-0 h-full w-full animate-spin-slow"
                style={{ ["--spin-duration" as string]: "60s" } as CSSProperties}
              >
                <circle
                  cx="200"
                  cy="200"
                  r="199"
                  fill="none"
                  stroke="rgba(226,181,62,0.16)"
                  strokeWidth="1"
                  strokeDasharray="1.5 9.5"
                />
                <path
                  d="M 200 1 A 199 199 0 0 1 299.5 27.7"
                  fill="none"
                  stroke="rgba(226,181,62,0.5)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {RING_DOTS.map((d, i) => (
                <span
                  key={`${d.left}-${d.top}`}
                  className="animate-twinkle absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold"
                  style={
                    {
                      left: d.left,
                      top: d.top,
                      ["--twinkle-delay" as string]: `${(i * 1.15).toFixed(2)}s`,
                      ["--twinkle-duration" as string]: `${(3.4 + (i % 3) * 0.8).toFixed(1)}s`,
                      ["--twinkle-min" as string]: "0.15",
                      ["--twinkle-max" as string]: "0.9",
                    } as CSSProperties
                  }
                />
              ))}
            </div>

            {/* The vault — centered inside the orbit (200px on mobile, 300px up) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <Icon3D
                  name="vault"
                  size={200}
                  float
                  decorative
                  className="md:hidden"
                />
                <Icon3D
                  name="vault"
                  size={300}
                  float
                  decorative
                  className="hidden md:inline-block"
                />
                {/* Root sigil — breathing on the vault's lower edge, in front */}
                <div className="absolute -bottom-4 left-1/2 z-10 -translate-x-1/2">
                  <motion.div
                    animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <PQSigil size={56} className="text-gold/55" />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h2 className="relative mt-14 font-display text-4xl font-semibold leading-[1.07] tracking-tight text-foreground md:mt-16 md:text-6xl">
            Give agents room to act.
            <br />
            <span className="text-shimmer">Keep the treasury under control.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="relative mt-6 text-base text-muted-foreground md:text-lg">
            Open your first bounded capability in under a minute.
          </p>
        </Reveal>

        <Reveal delay={0.26}>
          <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              onClick={onLaunchApp}
              className="group relative h-12 overflow-hidden rounded-md bg-gold px-8 text-base font-semibold text-[#171204] hover:bg-[#eec95e] hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]"
            >
              {/* Light sweep across the button on hover */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -translate-x-[120%] -skew-x-[18deg] bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[340%]"
              />
              <span className="relative">Connect wallet</span>
              <ArrowRight className="relative size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-md border-white/10 bg-white/[.03] px-8 text-base font-medium text-foreground hover:bg-white/[.06] hover:text-foreground"
            >
              <a href="#technology">Read the architecture</a>
            </Button>
          </div>
        </Reveal>
      </div>
    </SectionShell>
  );
}
