"use client";

import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Icon3D, Reveal, SectionHeading, SectionShell } from "@/components/pqtabs/shared";

/**
 * ProblemSection — the traditional model, drawn honestly.
 *
 * A long-lived key with broad access sits between the treasury and the
 * agent. The red deepens to the right as the blast radius grows: by the
 * time the flow reaches spending, nothing constrains it. The three
 * annotations below name exactly what is wrong with this picture.
 */

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const ANNOTATIONS = [
  "A compromised key reaches the entire treasury.",
  "No per-call limits. No expiry. No recipient control.",
  "Authority and spending live in the same credential.",
] as const;

function TraditionalModel() {
  const reduced = useReducedMotion();

  const fade = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, y: 10 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.6, delay, ease: EASE },
        } as const);

  const draw = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.45, delay, ease: "easeInOut" },
        } as const);

  return (
    <div className="relative w-full select-none">
      {/* Atmosphere — the red side of the room */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 42% 55% at 82% 48%, rgba(229,72,77,0.06), transparent 72%), radial-gradient(ellipse 30% 40% at 8% 48%, rgba(226,181,62,0.03), transparent 70%)",
        }}
        aria-hidden="true"
      />

      <svg
        viewBox="0 0 720 300"
        className="relative mx-auto block h-auto w-full max-w-[720px]"
        fill="none"
        role="img"
      >
        <title>
          The traditional model: a long-lived agent key with broad access
          connects the treasury directly to unrestricted spending.
        </title>

        <defs>
          <radialGradient id="ps-danger-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(229,72,77,0.20)" />
            <stop offset="60%" stopColor="rgba(229,72,77,0.07)" />
            <stop offset="100%" stopColor="rgba(229,72,77,0)" />
          </radialGradient>
        </defs>

        {/* ── Pulsing danger glow behind the spending box ─────────── */}
        <motion.g {...fade(0.5)}>
          <ellipse cx="638" cy="182" rx="118" ry="86" fill="url(#ps-danger-glow)" opacity="0.85">
            {!reduced && (
              <animate attributeName="opacity" values="0.6;1;0.6" dur="3.8s" repeatCount="indefinite" />
            )}
          </ellipse>
        </motion.g>

        {/* ── Treasury ───────────────────────────────────────────── */}
        <motion.g {...fade(0.05)}>
          <rect
            x="16"
            y="150"
            width="130"
            height="64"
            rx="10"
            fill="#0e1013"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1.2"
          />
          <text
            x="81"
            y="174"
            textAnchor="middle"
            fontSize="9"
            letterSpacing="1.8"
            className="fill-muted-foreground font-mono"
          >
            USER TREASURY
          </text>
          <text
            x="81"
            y="197"
            textAnchor="middle"
            fontSize="13"
            letterSpacing="0.5"
            className="fill-gold font-mono tabular"
          >
            HELD
          </text>
        </motion.g>

        {/* Connector: treasury → key */}
        <motion.path
          d="M 146 182 L 236 182"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.4"
          {...draw(0.3)}
        />
        <motion.g {...fade(0.72)}>
          <path d="M 228 177 L 236 182 L 228 187" stroke="rgba(255,255,255,0.28)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>

        {/* ── The long-lived key ─────────────────────────────────── */}
        <motion.g {...fade(0.15)}>
          <rect
            x="236"
            y="152"
            width="160"
            height="60"
            rx="10"
            fill="#0e1013"
            stroke="rgba(229,72,77,0.5)"
            strokeWidth="1.2"
          />
          {/* key glyph */}
          <circle cx="262" cy="182" r="6.5" stroke="rgba(229,72,77,0.75)" strokeWidth="1.5" />
          <line x1="268" y1="182" x2="288" y2="182" stroke="rgba(229,72,77,0.75)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="279" y1="182" x2="279" y2="189" stroke="rgba(229,72,77,0.75)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="284" y1="182" x2="284" y2="187" stroke="rgba(229,72,77,0.75)" strokeWidth="1.5" strokeLinecap="round" />
          <text x="298" y="177" fontSize="8" letterSpacing="1.4" className="fill-foreground/70 font-mono">
            LONG-LIVED
          </text>
          <text x="298" y="193" fontSize="8" letterSpacing="1.4" className="fill-danger/90 font-mono">
            AGENT KEY
          </text>
        </motion.g>

        {/* Connector: key → agent — the red begins */}
        <motion.path
          d="M 396 182 L 466 182"
          stroke="rgba(229,72,77,0.42)"
          strokeWidth="1.4"
          {...draw(0.45)}
        />
        <motion.g {...fade(0.87)}>
          <path d="M 458 177 L 466 182 L 458 187" stroke="rgba(229,72,77,0.6)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>

        {/* ── Agent ──────────────────────────────────────────────── */}
        <motion.g {...fade(0.25)}>
          <circle cx="496" cy="182" r="26" fill="#0e1013" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
          <circle cx="496" cy="182" r="9" stroke="rgba(94,234,212,0.7)" strokeWidth="1.4" />
          <circle cx="496" cy="182" r="3.4" fill="#5eead4" />
          <text x="496" y="232" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" className="fill-muted-foreground font-mono">
            AGENT
          </text>
        </motion.g>

        {/* Connector: agent → spending — fully exposed */}
        <motion.path
          d="M 522 182 L 572 182"
          stroke="rgba(229,72,77,0.68)"
          strokeWidth="1.4"
          {...draw(0.6)}
        />
        <motion.g {...fade(1.02)}>
          <path d="M 564 177 L 572 182 L 564 187" stroke="rgba(229,72,77,0.85)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>

        {/* ── Unrestricted spending — the blast radius ───────────── */}
        <motion.g {...fade(0.35)}>
          <rect
            x="572"
            y="142"
            width="132"
            height="80"
            rx="10"
            fill="#140d0e"
            stroke="rgba(229,72,77,0.65)"
            strokeWidth="1.3"
          />
          <text x="638" y="172" textAnchor="middle" fontSize="9.5" letterSpacing="2" className="fill-danger/90 font-mono">
            UNRESTRICTED
          </text>
          <text x="638" y="188" textAnchor="middle" fontSize="9.5" letterSpacing="2" className="fill-danger/90 font-mono">
            SPENDING
          </text>
          <text x="638" y="209" textAnchor="middle" fontSize="7.5" letterSpacing="1.6" className="fill-white/30 font-mono">
            NO POLICY
          </text>
        </motion.g>

        {/* At-risk marker */}
        <motion.g {...fade(0.95)}>
          <text x="638" y="252" textAnchor="middle" fontSize="9" letterSpacing="1.8" className="fill-danger/85 font-mono tabular">
            TREASURY AT RISK
          </text>
        </motion.g>
      </svg>
    </div>
  );
}

export default function ProblemSection() {
  return (
    <SectionShell id="problem" index="02" label="The Problem">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
        {/* Heading + thesis */}
        <div className="lg:col-span-5">
          <SectionHeading
            title="Agents need money to act."
            lead="And they increasingly do pay — for compute, data, APIs, infrastructure. The traditional answer is dangerous: hand the agent a long-lived key with broad access to your funds."
          />
          <Reveal delay={0.2}>
            <div className="mt-10 flex max-w-md items-start gap-5">
              <div className="min-w-0 flex-1">
                <span className="block h-px w-8 bg-gold/60" aria-hidden="true" />
                <p className="mt-5 font-display text-xl font-medium leading-snug tracking-tight md:text-2xl">
                  <span className="text-muted-foreground">Agents need money.</span>{" "}
                  <span className="text-foreground">
                    They should not own the treasury.
                  </span>
                </p>
              </div>
              <span className="mt-7 shrink-0 opacity-90">
                <Icon3D name="lock" size={44} float decorative />
              </span>
            </div>
          </Reveal>
        </div>

        {/* Diagram + annotations — a breathing danger glow sits behind the
            whole column, under the drawing */}
        <div className="relative lg:col-span-7">
          <div
            className="pointer-events-none absolute -right-16 -top-8 -z-10 h-[340px] w-[340px] animate-pulse-soft rounded-full bg-danger/[.06] blur-3xl [--pulse-duration:11s]"
            aria-hidden="true"
          />
          <Reveal delay={0.05}>
            <p className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span className="h-px w-6 bg-danger/50" aria-hidden="true" />
              The traditional model
            </p>
          </Reveal>
          <Reveal delay={0.12} className="mt-5">
            <TraditionalModel />
          </Reveal>

          <div className="mt-9 space-y-4">
            {ANNOTATIONS.map((a, i) => (
              <Reveal key={a} delay={0.18 + i * 0.08}>
                <div className="flex items-start gap-3.5 rounded-lg border border-danger/25 px-4 py-3.5 transition-colors duration-300 hover:border-danger/40 hover:bg-danger/[.04]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger/[.05]">
                    <X className="size-3 text-danger" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {a}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
