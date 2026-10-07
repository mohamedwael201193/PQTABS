"use client";

import type { CSSProperties } from "react";
import { Icon3D, Reveal, SectionHeading, SectionShell } from "@/components/pqtabs/shared";
import AttackBlocked from "@/components/pqtabs/visuals/AttackBlocked";
import BlastRadius from "./BlastRadius";

/**
 * SecuritySection — "Assume the agent is compromised."
 * Part A: the AttackBlocked composition (every escalation path is rejected),
 * staged on a soft danger atmosphere. Part B: the BlastRadius interactive
 * model (the boundary, computed live).
 */
export default function SecuritySection() {
  return (
    <SectionShell id="security" index="05" label="Security Model">
      <div className="flex items-start justify-between gap-8 md:gap-12">
        <SectionHeading
          className="flex-1"
          title="Assume the agent is compromised."
          lead="Design for the day it happens. With PQTABS, a compromised agent reaches exactly as far as its capability — and not one dollar further."
        />
        {/* Fixed-recipient policy lock — staged in the heading's negative space */}
        <div className="hidden shrink-0 pt-6 md:block" aria-hidden="true">
          <Icon3D name="lock" size={72} float decorative />
        </div>
      </div>

      <Reveal delay={0.05} className="relative mt-12 md:mt-16">
        {/* Danger atmosphere — a slow-breathing red haze behind the war-game */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[calc(50%-170px)] top-[calc(50%-170px)] h-[340px] w-[340px] animate-pulse-soft rounded-full bg-[#e5484d]/[.05] blur-3xl"
          style={{ ["--pulse-duration" as string]: "8s" } as CSSProperties}
        />
        <AttackBlocked />
      </Reveal>

      <div className="mt-16 md:mt-24">
        <BlastRadius />
      </div>
    </SectionShell>
  );
}
