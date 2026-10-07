"use client";

import { Icon3D, PQSigil, Reveal, SectionShell } from "@/components/pqtabs/shared";

/**
 * InsightSection — the pivotal editorial moment.
 *
 * One oversized statement, then the split: rare gold authority on one
 * side, frequent bounded spending on the other, divided by a hairline
 * with a gold diamond at its center — the policy gate, standing between
 * the two. The 3D key and card read as the physical twins of the glyphs
 * they accompany: the root credential and the spending tab.
 */

export default function InsightSection() {
  return (
    <SectionShell id="insight" index="03" label="The Core Insight">
      {/* The statement */}
      <Reveal>
        <h2 className="mx-auto max-w-4xl text-center font-display text-4xl font-semibold leading-[1.06] tracking-tight text-foreground md:text-6xl">
          Separate <span className="text-gradient-gold">authority</span> from{" "}
          <span className="text-teal">spending</span>.
        </h2>
      </Reveal>

      {/* The split */}
      <div className="relative mt-16 md:mt-24">
        {/* Desktop divider — hairline with the gold gate at its center */}
        <div
          className="pointer-events-none absolute inset-y-2 left-1/2 hidden w-px -translate-x-1/2 bg-white/[.07] md:block"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 hidden h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold bg-[#08090b] md:block"
          aria-hidden="true"
        />

        {/* Mobile divider */}
        <div className="relative mx-auto my-2 flex w-full max-w-sm items-center md:hidden" aria-hidden="true">
          <span className="h-px flex-1 bg-white/[.07]" />
          <span className="mx-3 h-2.5 w-2.5 rotate-45 border border-gold bg-[#08090b]" />
          <span className="h-px flex-1 bg-white/[.07]" />
        </div>

        <div className="grid md:grid-cols-2">
          {/* Left — root authority */}
          <Reveal delay={0.05} className="h-full">
            <div className="flex h-full flex-col items-center px-6 py-10 text-center md:py-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Root authority
              </p>
              {/* The sigil and its physical twin — the 3D key tucks in
                  behind, tilted, slightly overlapping */}
              <div className="mt-7 flex items-center">
                <span className="-mr-10 inline-block -rotate-12 opacity-95">
                  <Icon3D name="key" size={88} float decorative />
                </span>
                <PQSigil size={56} className="relative z-10 text-gold" />
              </div>
              <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                Rare and deliberate. Signs capability creation, rotation and
                recovery. Protected by SLH-DSA — a post-quantum signature
                scheme.
              </p>
              <p className="mt-6 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
                <span className="h-1 w-1 rounded-full bg-gold" aria-hidden="true" />
                Used a few times a year
              </p>
            </div>
          </Reveal>

          {/* Right — day-to-day spending */}
          <Reveal delay={0.16} className="h-full">
            <div className="flex h-full flex-col items-center px-6 py-10 text-center md:py-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Day-to-day spending
              </p>
              {/* The golden card IS the tab metaphor */}
              <div className="mt-7">
                <Icon3D name="card" size={88} float decorative />
              </div>
              <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                Frequent and automated. Agents pay vendors inside policy
                limits they can never change.
              </p>
              <p className="mt-6 flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/75">
                <span className="h-1 w-1 rounded-full bg-teal" aria-hidden="true" />
                Used every day · bounded
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </SectionShell>
  );
}
