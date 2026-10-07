"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Icon3D, Reveal, SectionHeading, SectionShell } from "@/components/pqtabs/shared";

/**
 * WhyBarkeep — the composition story, told as a stack.
 *
 * PQTABS does not reinvent constrained spending: Barkeep established the
 * bounded-tab pattern and USDC settles it. PQTABS adds the post-quantum
 * authority above. Three layers, one agent that plugs into the middle only,
 * two statements, one closer.
 */

const GOLD = "#e2b53e";
const TEAL = "#5eead4";
const DANGER = "#e5484d";

interface Layer {
  name: string;
  role: string;
  note: string;
  front: string;
  stroke: string;
  topFill: string;
  topStroke: string;
  roleFill: string;
}

const LAYERS: Layer[] = [
  {
    name: "PQTABS",
    role: "POST-QUANTUM ROOT AUTHORITY",
    note: "signs capability creation",
    front: "#131009",
    stroke: "rgba(226,181,62,0.55)",
    topFill: "rgba(226,181,62,0.07)",
    topStroke: "rgba(226,181,62,0.3)",
    roleFill: "rgba(226,181,62,0.8)",
  },
  {
    name: "BARKEEP",
    role: "CONSTRAINED SPENDING TABS",
    note: "bounded USDC capabilities",
    front: "#0e1013",
    stroke: "rgba(255,255,255,0.14)",
    topFill: "rgba(255,255,255,0.04)",
    topStroke: "rgba(255,255,255,0.09)",
    roleFill: "rgba(255,255,255,0.5)",
  },
  {
    name: "USDC",
    role: "SETTLEMENT LAYER",
    note: "payments land as USDC",
    front: "#0b0c0e",
    stroke: "rgba(255,255,255,0.08)",
    topFill: "rgba(255,255,255,0.025)",
    topStroke: "rgba(255,255,255,0.06)",
    roleFill: "rgba(255,255,255,0.4)",
  },
];

const LAYER_Y = [60, 176, 292];

function LayerStack({ reduced }: { reduced: boolean | null }) {
  return (
    <svg
      viewBox="0 0 880 400"
      className="mx-auto block h-auto w-full max-w-[820px]"
      fill="none"
      aria-hidden="true"
    >
      {/* Layers — stacked front-view planes with a skewed top face */}
      {LAYERS.map((l, i) => {
        const y = LAYER_Y[i] ?? 60;
        return (
          <motion.g
            key={l.name}
            initial={reduced ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.14, ease: [0.21, 0.47, 0.32, 0.98] }}
            whileHover={reduced ? undefined : { y: -3 }}
          >
            {/* top face */}
            <polygon
              points={`92,${y} 112,${y - 12} 636,${y - 12} 616,${y}`}
              fill={l.topFill}
              stroke={l.topStroke}
              strokeWidth="1"
            />
            {/* front face */}
            <rect x="80" y={y} width="548" height="84" rx="12" fill={l.front} stroke={l.stroke} strokeWidth="1.5" />

            {/* layer glyph */}
            {i === 0 && (
              <g>
                <circle cx="128" cy={y + 42} r="15" stroke="rgba(226,181,62,0.3)" strokeWidth="1.2" />
                <circle cx="128" cy={y + 42} r="9.5" stroke="rgba(226,181,62,0.55)" strokeWidth="1.2" />
                <circle cx="128" cy={y + 42} r="4.5" fill={GOLD} />
              </g>
            )}
            {i === 1 && (
              <g>
                <rect x="111" y={y + 31} width="34" height="22" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.1" />
                <rect x="116" y={y + 31} width="9" height="2" fill={GOLD} />
                <line x1="116" y1={y + 40} x2="140" y2={y + 40} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="116" y1={y + 46} x2="132" y2={y + 46} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" strokeLinecap="round" />
              </g>
            )}
            {i === 2 && (
              <g>
                <circle cx="128" cy={y + 42} r="13" stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
                <text x="128" y={y + 46.5} textAnchor="middle" fontSize="13" fill="rgba(255,255,255,0.5)" className="font-mono">
                  $
                </text>
              </g>
            )}

            {/* layer identity */}
            <text x="168" y={y + 38} fontSize="17" fontWeight="600" letterSpacing="1" fill="#f2f3f5" className="font-display">
              {l.name}
            </text>
            <text x="168" y={y + 59} fontSize="9.5" letterSpacing="1.8" fill={l.roleFill} className="font-mono">
              {l.role}
            </text>
            <text x="612" y={y + 46} textAnchor="end" fontSize="9" letterSpacing="0.8" fill="rgba(255,255,255,0.35)" className="font-mono">
              {l.note}
            </text>
          </motion.g>
        );
      })}

      {/* Agent node — connects into the Barkeep layer only */}
      <motion.g
        initial={reduced ? false : { opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "776px 218px" }}
      >
        <motion.path
          d="M 748 218 L 640 218"
          stroke="rgba(94,234,212,0.4)"
          strokeWidth="1.3"
          strokeDasharray="2 4"
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.7 }}
        />
        <path d="M 646 213.5 L 638 218 L 646 222.5" stroke="rgba(94,234,212,0.55)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <text x="694" y="208" textAnchor="middle" fontSize="7.5" letterSpacing="1.6" fill="rgba(94,234,212,0.6)" className="font-mono">
          BOUNDED SPENDING
        </text>

        <circle cx="776" cy="218" r="22" fill="#0e1013" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
        <circle cx="776" cy="218" r="9" stroke="rgba(94,234,212,0.7)" strokeWidth="1.4" />
        <circle cx="776" cy="218" r="3.2" fill={TEAL} />
        <text x="776" y="256" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" fill="rgba(255,255,255,0.6)" className="font-mono">
          AGENT
        </text>
      </motion.g>

      {/* Rejected climb toward the root layer */}
      <motion.g
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, delay: 0.95 }}
      >
        <path d="M 766 192 C 742 158, 706 136, 668 122" stroke="rgba(229,72,77,0.5)" strokeWidth="1.2" strokeDasharray="3 5" />
        <motion.g
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.3, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: "660px 118px" }}
        >
          <circle cx="660" cy="118" r="8" fill="#140d0e" stroke="rgba(229,72,77,0.35)" strokeWidth="1" />
          <line x1="656" y1="114" x2="664" y2="122" stroke={DANGER} strokeWidth="1.7" strokeLinecap="round" />
          <line x1="664" y1="114" x2="656" y2="122" stroke={DANGER} strokeWidth="1.7" strokeLinecap="round" />
        </motion.g>
        <text x="686" y="114" fontSize="8" letterSpacing="1.4" fill="rgba(229,72,77,0.8)" className="font-mono">
          AGENTS NEVER TOUCH THE ROOT
        </text>
      </motion.g>
    </svg>
  );
}

export default function WhyBarkeep() {
  const reduced = useReducedMotion();

  return (
    <SectionShell index="07" label="Why Barkeep">
      <SectionHeading
        title="Bounded tabs, hardened above."
        lead="Barkeep established the constrained spending pattern: the agent gets a bounded tab, not the treasury. PQTABS composes with that pattern — and adds a post-quantum authority above it."
      />

      <Reveal delay={0.05} className="mt-12 md:mt-16">
        <LayerStack reduced={reduced} />
      </Reveal>

      {/* Two statements — the pattern, and the layer above it */}
      <div className="mt-16 grid gap-10 md:grid-cols-2 md:gap-0">
        <Reveal className="md:pr-10">
          <p className="font-display text-xl leading-snug text-foreground md:text-2xl">
            “The agent gets a bounded spending tab.”
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-gold">—</span> The Barkeep pattern
          </p>
        </Reveal>
        <Reveal delay={0.1} className="md:border-l md:border-white/[.06] md:pl-10">
          <p className="font-display text-xl leading-snug text-foreground md:text-2xl">
            “The authority that creates those tabs is protected by a
            post-quantum root.”
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="text-gold">—</span> The PQTABS layer
          </p>
        </Reveal>
      </div>

      <Reveal delay={0.1} className="mt-16 md:mt-20">
        <div className="border-t border-white/[.06] pt-8 text-center md:pt-10">
          {/* Post-quantum emblem above the closer */}
          <span className="mx-auto flex w-fit" aria-hidden="true">
            <Icon3D name="quantum" size={56} float decorative />
          </span>
          <p className="mt-5 font-display text-base text-muted-foreground md:text-lg">
            PQTABS doesn’t reinvent constrained spending.{" "}
            <span className="text-foreground">
              It hardens the authority above it.
            </span>
          </p>
        </div>
      </Reveal>
    </SectionShell>
  );
}
