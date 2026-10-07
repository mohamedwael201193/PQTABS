"use client";

import { useState } from "react";
import {
  Icon3D,
  Reveal,
  SectionHeading,
  SectionShell,
  type Icon3DName,
} from "@/components/pqtabs/shared";
import CapabilityFlow from "@/components/pqtabs/visuals/CapabilityFlow";
import BentoFeatures from "./BentoFeatures";
import { cn } from "@/lib/utils";

/**
 * HowItWorks — one root, many tabs, zero treasury exposure.
 *
 * The CapabilityFlow composition above is live: hovering (or focusing) a
 * numbered step below highlights its stage in the diagram. Left alone,
 * the highlight cycles gently on its own. The second act — the guarantee
 * bento — closes the section with the policy mechanics as objects.
 */

const STEPS: { num: string; title: string; body: string; icon: Icon3DName }[] = [
  {
    num: "01",
    title: "Authorize the root",
    body: "Your treasury is controlled by a post-quantum root key. It signs opening a capability, closing one, and rotating that key. It does not sign each payment.",
    icon: "key",
  },
  {
    num: "02",
    title: "Open a capability",
    body: "Fund a capability with a cap, a per-call limit, approved recipients and an expiry. Policy is set by you.",
    icon: "card",
  },
  {
    num: "03",
    title: "Agents spend within bounds",
    body: "The agent pays allowed recipients within limits. Every attempt is checked against policy — onchain.",
    icon: "robot",
  },
  {
    num: "04",
    title: "Expire and reclaim",
    body: "After expiry the agent can no longer spend. The remaining USDC stays until someone reclaims it. That call does not need the root key.",
    icon: "shield",
  },
];

export default function HowItWorks() {
  const [activeStage, setActiveStage] = useState<number | null>(null);

  return (
    <SectionShell id="how" index="04" label="How PQTABS Works">
      <SectionHeading
        title="One root. Many capabilities. Zero treasury exposure."
        lead="The post-quantum root never authorizes individual payments. It issues bounded spending capabilities — Barkeep tabs — that carry their own policy."
      />

      <Reveal delay={0.05} className="mt-12 md:mt-16">
        <CapabilityFlow activeStage={activeStage} onStageSelect={setActiveStage} />
      </Reveal>

      {/* Numbered steps — hover to light the matching stage above; the
          icon lifts with its stage */}
      <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal key={s.num} delay={i * 0.07} className="h-full">
            <div
              className="h-full"
              onMouseEnter={() => setActiveStage(i)}
              onMouseLeave={() => setActiveStage(null)}
            >
              <div
                className={cn(
                  "h-px w-full transition-colors duration-300",
                  activeStage === i ? "bg-gold/60" : "bg-white/[.07]"
                )}
                aria-hidden="true"
              />
              <div className="mt-4 flex items-end justify-between">
                <span
                  className={cn(
                    "block origin-bottom-left transition-all duration-300",
                    activeStage === i
                      ? "scale-105 brightness-110"
                      : "scale-100 brightness-100"
                  )}
                >
                  <Icon3D name={s.icon} size={56} float decorative />
                </span>
                <span className="font-mono text-xs tracking-[0.14em] text-gold tabular">
                  {s.num}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Second act — the guarantees, as objects */}
      <div className="mt-20 md:mt-28">
        <BentoFeatures />
      </div>
    </SectionShell>
  );
}
