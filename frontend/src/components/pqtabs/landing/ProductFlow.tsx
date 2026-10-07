"use client";

import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Icon3D,
  Reveal,
  SectionHeading,
  SectionShell,
  SpotlightCard,
} from "@/components/pqtabs/shared";
import TabLifecycle from "@/components/pqtabs/visuals/TabLifecycle";

/**
 * ProductFlow — "I understand how I would use it."
 * The lifecycle loop above, then three dashboard fragments that prime the
 * product: choose the agent, set the bounds, review in plain language.
 */

const PREVIEW_CARDS = [
  { label: "Choose the agent", index: "01" },
  { label: "Set the bounds", index: "02" },
  { label: "Review in plain language", index: "03" },
] as const;

export default function ProductFlow({ onLaunchApp }: { onLaunchApp: () => void }) {
  return (
    <SectionShell id="product" index="08" label="The Product Flow">
      <SectionHeading
        title="Create a bounded capability in seconds."
        lead="Five decisions, plain language, one confirmation. The interface states policy in human terms — the contracts enforce it."
      />

      <Reveal delay={0.05} className="mt-12 md:mt-16">
        <TabLifecycle />
      </Reveal>

      {/* Mini product preview */}
      <Reveal className="mt-16 md:mt-20">
        <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <span className="h-px w-6 bg-gold/40" aria-hidden="true" />
          The interface
        </p>
      </Reveal>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {/* Card 1 — Choose the agent */}
        <Reveal className="h-full">
          <SpotlightCard className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/20">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon3D name="robot" size={40} decorative className="shrink-0" />
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-gold/85">
                    {PREVIEW_CARDS[0].label}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {PREVIEW_CARDS[0].index}
                </span>
              </div>

              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-3 rounded-lg border border-gold/25 bg-gold/[.05] px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal/40 bg-teal/[.06]">
                    <span className="h-2 w-2 rounded-full bg-teal" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      Agent you choose
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      created on this device
                    </span>
                  </span>
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gold bg-gold/10"
                    aria-hidden="true"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-white/[.06] bg-white/[.02] px-3.5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[.1] bg-white/[.02]">
                    <span className="h-2 w-2 rounded-full bg-white/30" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground/80">
                      A separate agent
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      its own key
                    </span>
                  </span>
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* Card 2 — Set the bounds */}
        <Reveal delay={0.08} className="h-full">
          <SpotlightCard className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/20">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon3D name="card" size={40} decorative className="shrink-0" />
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-gold/85">
                    {PREVIEW_CARDS[1].label}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {PREVIEW_CARDS[1].index}
                </span>
              </div>

              <div className="mt-5 flex items-baseline gap-2.5">
                <p className="font-display text-4xl font-semibold tabular text-foreground">
                  Cap
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Capability
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>Max per payment</span>
                    <span className="tabular text-foreground">inside the cap</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-white/[.07]">
                    <div className="h-1 w-[10%] rounded-full bg-gold" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span>Expires in 24h</span>
                    <span className="tabular text-foreground">24:00</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-white/[.07]">
                    <div className="h-1 w-[30%] rounded-full bg-white/30" />
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>

        {/* Card 3 — Review in plain language */}
        <Reveal delay={0.16} className="h-full">
          <SpotlightCard className="h-full rounded-xl border border-white/[.07] bg-[#0e1013] p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/20">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Icon3D name="check" size={40} decorative className="shrink-0" />
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-gold/85">
                    {PREVIEW_CARDS[2].label}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                  {PREVIEW_CARDS[2].index}
                </span>
              </div>

              <blockquote className="mt-5 flex-1 border-l-2 border-gold/60 pl-4">
                <p className="text-sm leading-relaxed text-foreground/90">
                  This gives the agent you choose a cap, a per-payment limit,
                  approved recipients, and an expiry. You set every number.
                </p>
              </blockquote>

              <Button
                onClick={onLaunchApp}
                className="mt-5 h-9 w-full rounded-md bg-gold text-[13px] font-semibold text-[#171204] hover:bg-[#eec95e]"
              >
                <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Create capability
              </Button>
            </div>
          </SpotlightCard>
        </Reveal>
      </div>

      {/* Final row */}
      <Reveal className="mt-12 md:mt-16">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            onClick={onLaunchApp}
            className="h-11 rounded-md bg-gold px-6 text-sm font-semibold text-[#171204] hover:bg-[#eec95e] hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]"
          >
            Connect wallet
            <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-md border-white/10 bg-white/[.03] px-6 text-sm text-foreground hover:bg-white/[.06] hover:text-foreground"
          >
            <a href="#security">See the security model</a>
          </Button>
        </div>
      </Reveal>
    </SectionShell>
  );
}
