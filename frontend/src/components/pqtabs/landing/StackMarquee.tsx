"use client";

import { Reveal } from "@/components/pqtabs/shared";

/**
 * StackMarquee — the protocol strip beneath the hero.
 *
 * The primitives PQTABS composes, drifting in one slow infinite loop. Both
 * halves of the track render the exact same content so the -50% translate
 * lands on a seamless seam; the strip pauses on hover and fades at both
 * edges. Reduced motion freezes it flat (global CSS).
 */

const ITEMS = [
  "SLH-DSA",
  "FIPS 204",
  "ARC",
  "BARKEEP",
  "USDC",
  "POST-QUANTUM ROOT",
  "BOUNDED CAPABILITIES",
] as const;

/** One pass of the strip. The trailing separator keeps the seam rhythm
 *  identical to the in-row rhythm. */
function MarqueeRow({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center"
      aria-hidden={hidden || undefined}
    >
      {ITEMS.map((item) => (
        <span key={item} className="flex items-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground transition-colors duration-200 hover:text-foreground">
            {item}
          </span>
          <span
            className="mx-6 block h-[3px] w-[3px] rotate-45 bg-gold/60 md:mx-8"
            aria-hidden="true"
          />
        </span>
      ))}
    </div>
  );
}

export default function StackMarquee() {
  return (
    <section
      aria-label="The stack PQTABS composes"
      className="relative border-y border-white/[.06] py-5 md:py-6"
    >
      <Reveal y={10}>
        <div className="marquee-hover-pause mask-fade-x overflow-hidden">
          <div className="animate-marquee flex w-max items-center [--marquee-duration:46s]">
            <MarqueeRow />
            <MarqueeRow hidden />
          </div>
        </div>
      </Reveal>
    </section>
  );
}
