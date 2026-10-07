"use client";

import { Icon3D, Reveal, SectionHeading, SectionShell, SpotlightCard } from "@/components/pqtabs/shared";
import ArcVerification from "@/components/pqtabs/visuals/ArcVerification";

/**
 * WhyArc — post-quantum verification belongs at the root.
 * The ArcVerification chain above, three fact tiles below. Explain, don't
 * decorate: only the mechanisms in the brief, no invented claims.
 */

const FACTS = [
  {
    kicker: "Signature scheme",
    title: "SLH-DSA (SPHINCS+)",
    body: "A stateless, hash-based post-quantum signature standard. No structural assumptions that quantum computers break.",
  },
  {
    kicker: "Verification",
    title: "Arc precompile",
    body: "Arc’s precompile checks PQ signatures natively onchain. The protocol’s root authority is enforced by the chain, not by an offchain service.",
  },
  {
    kicker: "What it protects",
    title: "Only capability creation",
    body: "Opening tabs, rotating keys, recovery. Day-to-day payments never touch the root.",
  },
];

export default function WhyArc() {
  return (
    <SectionShell id="technology" index="06" label="Why Arc">
      <div className="flex items-start justify-between gap-8 md:gap-12">
        <SectionHeading
          className="flex-1"
          title="Post-quantum verification belongs at the root."
          lead="PQTABS runs on Arc because Arc verifies SLH-DSA signatures onchain through its post-quantum verification precompile. The authority above your agents’ spending is checked by the network itself — not by a dashboard, not by a promise."
        />
        {/* The Arc chain — staged in the heading's negative space */}
        <div className="hidden shrink-0 pt-6 md:block" aria-hidden="true">
          <Icon3D name="hex" size={72} float decorative />
        </div>
      </div>

      <Reveal delay={0.05} className="mt-12 md:mt-16">
        <ArcVerification />
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3 md:gap-6">
        {FACTS.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.08} className="h-full">
            <SpotlightCard className="flex h-full flex-col rounded-xl border border-white/[.07] bg-[#0e1013] p-6 transition-colors duration-300 hover:border-gold/25">
              <span className="h-px w-8 bg-gold/60" aria-hidden="true" />
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
                {f.kicker}
              </p>
              <h3 className="mt-3 font-display text-lg font-semibold tracking-tight text-foreground">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </SectionShell>
  );
}
