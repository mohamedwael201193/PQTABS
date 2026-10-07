"use client";

import {
  Icon3D,
  Reveal,
  SectionHeading,
  SpotlightCard,
  type Icon3DName,
} from "@/components/pqtabs/shared";

/**
 * BentoFeatures — the guarantees, as objects.
 *
 * The second act of the #how section: one featured card (the vault and the
 * $0 blast-radius stat, ringed by a slow conic gold beam) plus five guarantee
 * cards rendered as a tight bento. Every card is a SpotlightCard, so the
 * pointer carries a soft gold wash across its surface. Grid balance on lg:
 * the featured card spans 2×2, four singles fill the columns beside it and
 * the ledger card closes the grid full-width — no orphan cells.
 */

const CHIPS = ["FIPS 204", "SLH-DSA", "ARC"] as const;

const CARDS: { icon: Icon3DName; kicker: string; title: string; body: string }[] =
  [
    {
      icon: "lock",
      kicker: "ALLOW-LIST",
      title: "Fixed recipients",
      body: "Payments outside the approved list are rejected automatically.",
    },
    {
      icon: "hourglass",
      kicker: "TTL",
      title: "Time-boxed access",
      body: "Every capability expires on schedule, and the funds return with it.",
    },
    {
      icon: "robot",
      kicker: "SEPARATION",
      title: "Isolated agent keys",
      body: "Agent credentials can never touch — or become — the root.",
    },
    {
      icon: "gauge",
      kicker: "RATE BOUND",
      title: "Per-payment limits",
      body: "A hard ceiling on every single call, not just a monthly total.",
    },
  ];

function Kicker({ children }: { children: string }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground/70">
      {children}
    </p>
  );
}

export default function BentoFeatures() {
  return (
    <div>
      <SectionHeading
        overline="THE GUARANTEES"
        title={
          <>
            Every tab is a{" "}
            <span className="text-gradient-gold">vault</span> with an allowance.
          </>
        }
        lead="Every capability carries its own policy — recipients, per-call limits and expiry travel with the money."
      />

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-14 lg:grid-cols-4">
        {/* Featured — assume breach */}
        <Reveal className="h-full sm:col-span-2 lg:col-span-2 lg:row-span-2">
          <SpotlightCard className="card-beam h-full rounded-xl border border-white/[.08] bg-[#0e1013] p-6 md:p-8">
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-gold">
                    Assume breach
                  </p>
                  <h3 className="mt-4 font-display text-2xl font-semibold leading-[1.12] tracking-tight text-foreground md:text-3xl">
                    Nothing leaves without a signature.
                  </h3>
                </div>
                <span className="mt-1 block shrink-0 origin-top-right scale-[.6] sm:scale-90 lg:scale-100">
                  <Icon3D name="vault" size={140} float decorative />
                </span>
              </div>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                The post-quantum root signs every capability into existence.
                Recipients, limits and expiry are bound into the tab itself —
                before an agent can spend.
              </p>
              <div className="mt-auto pt-8 md:pt-10">
                <p className="font-display text-6xl font-semibold leading-none tabular text-gradient-gold md:text-7xl">
                  $0
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                  Reachable beyond the cap
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {CHIPS.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md border border-white/[.08] bg-white/[.02] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* Guarantee singles */}
        {CARDS.map((c, i) => (
          <Reveal key={c.title} delay={0.06 * (i + 1)} className="h-full">
            <SpotlightCard className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5 md:p-6">
              <div className="flex h-full flex-col">
                <Kicker>{c.kicker}</Kicker>
                <span className="mt-4 block">
                  <Icon3D name={c.icon} size={52} float decorative />
                </span>
                <h3 className="mt-4 font-display text-base font-medium tracking-tight text-foreground">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </div>
            </SpotlightCard>
          </Reveal>
        ))}

        {/* Closing strip — the ledger, full-width */}
        <Reveal delay={0.3} className="h-full sm:col-span-2 lg:col-span-4">
          <SpotlightCard className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5 md:p-6">
            <div className="flex h-full flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <span className="shrink-0">
                <Icon3D name="check" size={52} float decorative />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-medium tracking-tight text-foreground">
                  Every attempt recorded
                </h3>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Approved and blocked, side by side in one ledger.
                </p>
              </div>
              <p className="shrink-0 font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground/70">
                FULL LEDGER
              </p>
            </div>
          </SpotlightCard>
        </Reveal>
      </div>
    </div>
  );
}
