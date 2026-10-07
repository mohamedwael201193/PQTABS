"use client";

import { cn } from "@/lib/utils";
import {
  Icon3D,
  Reveal,
  SectionHeading,
  SectionShell,
} from "@/components/pqtabs/shared";

/**
 * TechnicalSection — the spec sheet.
 * Six mechanisms as a definition list, then the three-layer truth as three
 * full-width statements. Typeset for credibility; nothing decorative.
 */

const SPEC = [
  {
    key: "ROOT SCHEME",
    title: "SLH-DSA (SPHINCS+)",
    body: "Stateless hash-based signatures. Security rests only on hash functions — the family quantum computers don’t structurally break.",
  },
  {
    key: "VERIFICATION",
    title: "Arc precompile",
    body: "Post-quantum signature checks execute natively on Arc, so the root’s authority is enforced by the network.",
  },
  {
    key: "CAPABILITIES",
    title: "Barkeep tabs",
    body: "Bounded spending objects: funded cap, per-call limit, recipient allowlist, expiry.",
  },
  {
    key: "SETTLEMENT",
    title: "USDC",
    body: "Agents spend a stable, auditable unit. Every payment is a record you can reconcile.",
  },
  {
    key: "POLICY",
    title: "Onchain enforcement",
    body: "Policy lives in the capability itself. The interface displays it; the chain enforces it.",
  },
  {
    key: "CUSTODY",
    title: "No operator recovery",
    body: "The backup file is the only copy of the root key. If that file and the device are both lost, the USDC stays in the root. Agents cannot rotate the key.",
  },
];

const TRUTH = [
  { statement: "UI displays policy", note: "WHAT YOU SEE", gold: false },
  { statement: "Backend relays activity", note: "WHAT YOU WATCH", gold: false },
  { statement: "Blockchain enforces policy", note: "WHAT GUARANTEES IT", gold: true },
];

export default function TechnicalSection() {
  return (
    <SectionShell index="09" label="Under the Hood">
      <div className="flex items-start justify-between gap-8 md:gap-12">
        <SectionHeading
          className="flex-1"
          title="Real protocol concepts. Real constraints."
          lead="No hand-waving. Every layer of PQTABS maps to a concrete mechanism."
        />
        {/* Hard limits — staged in the heading's negative space */}
        <div className="hidden shrink-0 pt-6 md:block" aria-hidden="true">
          <Icon3D name="gauge" size={64} float decorative />
        </div>
      </div>

      {/* Spec — definition list */}
      <dl className="mt-12 divide-y divide-white/[.06] border-y border-white/[.06] md:mt-16">
        {SPEC.map((row, i) => (
          <Reveal key={row.key} delay={i * 0.04}>
            <div className="grid gap-2 py-5 transition-colors duration-300 hover:bg-white/[.02] md:grid-cols-6 md:gap-8 md:py-6">
              <dt className="font-mono text-[11px] uppercase tracking-[0.2em] text-gold md:col-span-2 md:pt-1.5">
                {row.key}
              </dt>
              <dd className="md:col-span-4">
                <p className="font-display text-base font-medium text-foreground md:text-lg">
                  {row.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {row.body}
                </p>
              </dd>
            </div>
          </Reveal>
        ))}
      </dl>

      {/* The three-layer truth */}
      <div className="mt-16 md:mt-24">
        <Reveal>
          <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            <span className="h-px w-6 bg-gold/40" aria-hidden="true" />
            The three-layer truth
          </p>
        </Reveal>

        <div className="mt-6 divide-y divide-white/[.06] border-y border-white/[.06]">
          {TRUTH.map((row, i) => (
            <Reveal key={row.statement} delay={i * 0.07}>
              <div className="grid items-baseline gap-2 py-6 md:grid-cols-12 md:gap-6 md:py-8">
                <span className="tabular font-mono text-[11px] text-gold/60 md:col-span-1">
                  {`0${i + 1}`}
                </span>
                <p className="font-display text-xl font-semibold tracking-tight text-foreground md:col-span-7 md:text-3xl">
                  {row.statement}
                </p>
                <p
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.22em] md:col-span-4 md:text-right",
                    row.gold ? "text-gold" : "text-muted-foreground"
                  )}
                >
                  {row.note}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
