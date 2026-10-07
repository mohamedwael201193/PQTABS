"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * ArcVerification — why the root lives on Arc, as one left-to-right story.
 *
 * PQ root (concentric authority rings) → SLH-DSA signature document →
 * Arc verification precompile (hexagon, gold check, ring of ticks) →
 * bounded capability → agent. Draw-in stages, one gold particle traveling
 * the whole chain, mono annotations under each stage.
 */

const GOLD = "#e2b53e";

/** Deterministic coordinate rounding — keeps SSR and client SVG identical. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const TEAL = "#5eead4";

const CY = 150;

const STAGES = [
  { x: 110, index: "01", name: "PQ ROOT", note: "SLH-DSA ROOT KEY" },
  { x: 300, index: "02", name: "SIGNATURE", note: "SLH-DSA SIGNATURE" },
  { x: 560, index: "03", name: "ARC PRECOMPILE", note: "VERIFIED ONCHAIN" },
  { x: 748, index: "04", name: "CAPABILITY", note: "BOUNDED BY POLICY" },
  { x: 928, index: "05", name: "AGENT", note: "SPENDS WITHIN CAP" },
];

const HEX_TICKS = Array.from({ length: 12 }, (_, i) => i);
const SIGIL_TICKS = Array.from({ length: 8 }, (_, i) => i);

// One continuous gold flow through all five stages.
const FLOW_PATH =
  "M 110 150 C 200 138, 240 162, 300 150 C 360 138, 430 162, 560 150 C 640 140, 660 160, 748 150 C 810 142, 860 158, 928 150";
const FLOW_DUR = 7.5;
const FLOW_DELAY_MS = 2500;

export default function ArcVerification({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-100px" });
  const reduced = useReducedMotion();
  const flowRef = useRef<SVGAnimateElement | null>(null);

  useEffect(() => {
    if (!inView || reduced) return;
    const t = window.setTimeout(
      () => flowRef.current?.beginElement(),
      FLOW_DELAY_MS
    );
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  const draw = (delay: number, dur = 0.45) =>
    reduced
      ? {}
      : ({
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: dur, delay, ease: "easeInOut" },
        } as const);

  // CSS-driven pop — keyed to the component's inView state. Deterministic
  // on SVG elements (no motion keyframe origin resolution involved).
  const pop = (delay: number, x: number, y: number) =>
    ({
      style: {
        opacity: inView ? 1 : 0,
        transform: inView ? "scale(1)" : "scale(0.85)",
        transformOrigin: `${x}px ${y}px`,
        transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      },
    } as const);

  const fade = (delay: number) =>
    ({
      style: {
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0px)" : "translateY(6px)",
        transition: `opacity 0.45s cubic-bezier(0.21, 0.47, 0.32, 0.98) ${delay}s, transform 0.45s cubic-bezier(0.21, 0.47, 0.32, 0.98) ${delay}s`,
      },
    } as const);

  return (
    <div ref={containerRef} className={cn("relative w-full select-none", className)}>
      {/* Atmosphere — gold at the verification moment, teal at the agent */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 32% 44% at 54% 50%, rgba(226,181,62,0.07), transparent 70%), radial-gradient(ellipse 18% 28% at 90% 50%, rgba(94,234,212,0.04), transparent 72%)",
        }}
      />

      <svg
        viewBox="0 0 1040 300"
        className="relative mx-auto block h-auto w-full max-w-[1000px]"
        fill="none"
        role="img"
      >
        <title>
          A post-quantum root signature is verified onchain by the Arc
          precompile, then issued as a bounded capability to the agent.
        </title>

        {/* ── 01 · PQ root sigil ──────────────────────────────────── */}
        <g {...pop(0, 110, CY)}>
          <circle cx="110" cy={CY} r="44" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
          <circle cx="110" cy={CY} r="32" stroke="rgba(226,181,62,0.3)" strokeWidth="1.4" strokeDasharray="2 5" />
          <circle cx="110" cy={CY} r="20" stroke={GOLD} strokeWidth="1.8" />
          <circle cx="110" cy={CY} r="12" stroke="rgba(226,181,62,0.35)" strokeWidth="1.3" />
          <circle cx="110" cy={CY} r="7" fill={GOLD} />
          {SIGIL_TICKS.map((i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={`st-${i}`}
                x1={r2(110 + Math.cos(a) * 48)}
                y1={r2(CY + Math.sin(a) * 48)}
                x2={r2(110 + Math.cos(a) * 53)}
                y2={r2(CY + Math.sin(a) * 53)}
                stroke="rgba(226,181,62,0.35)"
                strokeWidth="1.2"
              />
            );
          })}
        </g>
        {!reduced && (
          <g {...fade(0.15)}>
            <motion.g
              style={{ transformOrigin: "110px 150px" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
            >
              <circle cx="110" cy={CY} r="38" stroke="rgba(226,181,62,0.4)" strokeWidth="1.1" strokeDasharray="3 8" />
            </motion.g>
          </g>
        )}

        {/* connector: sigil → signature */}
        <motion.path d="M 158 150 C 190 142, 222 158, 250 150" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" {...draw(0.2)} />
        <path d="M 245 145.5 L 251 150 L 245 154.5" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...fade(0.5)} />

        {/* ── 02 · SLH-DSA signature document ─────────────────────── */}
        <g {...pop(0.3, 300, CY)}>
          <g transform="rotate(-4 300 150)">
            <rect x="272" y="113" width="56" height="74" rx="5" fill="#0e1013" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
            <path d="M 312 113 L 328 129 L 312 129 Z" fill="#14171a" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
            <line x1="282" y1="143" x2="318" y2="143" stroke="rgba(255,255,255,0.16)" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="151" x2="318" y2="151" stroke="rgba(255,255,255,0.16)" strokeWidth="2" strokeLinecap="round" />
            <line x1="282" y1="159" x2="306" y2="159" stroke="rgba(255,255,255,0.16)" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M 282 172 C 287 163, 292 179, 297 170 C 302 161, 307 179, 312 170 C 315 165, 318 169, 321 172"
              stroke={GOLD}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* connector: signature → Arc */}
        <motion.path d="M 342 150 C 390 142, 460 158, 506 150" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" {...draw(0.55)} />
        <path d="M 501 145.5 L 507 150 L 501 154.5" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...fade(0.85)} />

        {/* ── 03 · Arc verification precompile ────────────────────── */}
        <g {...pop(0.7, 560, CY)}>
          <polygon
            points="560,98 605,124 605,176 560,202 515,176 515,124"
            fill="#0e1013"
            stroke="rgba(226,181,62,0.7)"
            strokeWidth="1.6"
          />
          <circle cx="560" cy={CY} r="38" stroke="rgba(226,181,62,0.22)" strokeWidth="1.2" />
          {HEX_TICKS.map((i) => {
            const a = (i * Math.PI) / 6;
            return (
              <line
                key={`ht-${i}`}
                x1={r2(560 + Math.cos(a) * 48)}
                y1={r2(CY + Math.sin(a) * 48)}
                x2={r2(560 + Math.cos(a) * 53)}
                y2={r2(CY + Math.sin(a) * 53)}
                stroke="rgba(226,181,62,0.35)"
                strokeWidth="1.2"
              />
            );
          })}
        </g>
        {!reduced && (
          <g {...fade(0.85)}>
            <motion.g
              style={{ transformOrigin: "560px 150px" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 70, repeat: Infinity, ease: "linear" }}
            >
              <circle cx="560" cy={CY} r="44" stroke="rgba(226,181,62,0.4)" strokeWidth="1.1" strokeDasharray="3 8" />
            </motion.g>
          </g>
        )}
        {/* the gold check draws once the hexagon stands */}
        <motion.path
          d="M 547 151 L 555.5 160.5 L 574 138"
          stroke={GOLD}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...draw(1.05, 0.4)}
        />

        {/* connector: Arc → capability */}
        <motion.path d="M 608 150 C 634 144, 658 156, 678 150" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" {...draw(1.2)} />
        <path d="M 673 145.5 L 679 150 L 673 154.5" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...fade(1.5)} />

        {/* ── 04 · Bounded capability ─────────────────────────────── */}
        <g {...pop(1.4, 748, CY)}>
          <rect x="686" y="118" width="124" height="64" rx="9" fill="#0e1013" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
          <rect x="698" y="118" width="24" height="2.5" fill={GOLD} opacity="0.9" />
          <text x="698" y="139" fontSize="8" letterSpacing="1.5" fill="rgba(255,255,255,0.55)" className="font-mono">
            CAPABILITY
          </text>
          <text x="698" y="159" className="font-display tabular" fontSize="16" fontWeight="600" fill={GOLD}>
            BOUNDED
          </text>
          <text x="698" y="173" fontSize="7.5" letterSpacing="1.2" fill="rgba(255,255,255,0.4)" className="font-mono">
            EXPIRES IN 24H
          </text>
        </g>

        {/* connector: capability → agent */}
        <motion.path d="M 816 150 C 842 144, 866 156, 890 150" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" {...draw(1.65)} />
        <path d="M 885 145.5 L 891 150 L 885 154.5" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" {...fade(1.95)} />

        {/* ── 05 · Agent ──────────────────────────────────────────── */}
        <g {...pop(1.8, 928, CY)}>
          <circle cx="928" cy={CY} r="22" fill="#0e1013" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
          <circle cx="928" cy={CY} r="9" stroke="rgba(94,234,212,0.7)" strokeWidth="1.4" />
          <circle cx="928" cy={CY} r="3.2" fill={TEAL} />
        </g>

        {/* Stage labels — index, name, annotation */}
        {STAGES.map((s, i) => {
          const delays = [0.2, 0.5, 0.9, 1.6, 2];
          const gold = s.index === "03";
          return (
            <g key={s.name} {...fade(delays[i] ?? 0)}>
              <text x={s.x} y="84" textAnchor="middle" fontSize="8" letterSpacing="2" fill="rgba(226,181,62,0.5)" className="font-mono">
                {s.index}
              </text>
              <text x={s.x} y="232" textAnchor="middle" fontSize="10.5" letterSpacing="2" fill="rgba(255,255,255,0.82)" className="font-mono">
                {s.name}
              </text>
              <text
                x={s.x}
                y="250"
                textAnchor="middle"
                fontSize="8.5"
                letterSpacing="1.6"
                fill={gold ? "rgba(226,181,62,0.75)" : "rgba(255,255,255,0.42)"}
                className="font-mono"
              >
                {s.note}
              </text>
            </g>
          );
        })}

        {/* Gold flow particle — SMIL, started once the chain is drawn */}
        {!reduced && (
          <>
            <circle r="2.8" fill={GOLD} opacity="0">
              <animateMotion
                id="arc-flow"
                begin="indefinite"
                dur={`${FLOW_DUR}s`}
                repeatCount="indefinite"
                path={FLOW_PATH}
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.05;0.92;1"
                dur={`${FLOW_DUR}s`}
                repeatCount="indefinite"
                begin="arc-flow.begin"
              />
            </circle>
            <circle r="6" fill={GOLD} opacity="0">
              <animateMotion
                begin="arc-flow.begin"
                dur={`${FLOW_DUR}s`}
                repeatCount="indefinite"
                path={FLOW_PATH}
              />
              <animate
                attributeName="opacity"
                values="0;0.2;0.2;0"
                keyTimes="0;0.05;0.92;1"
                dur={`${FLOW_DUR}s`}
                repeatCount="indefinite"
                begin="arc-flow.begin"
              />
            </circle>
          </>
        )}
        {reduced && <circle cx="490" cy="153" r="2.8" fill={GOLD} />}
      </svg>
    </div>
  );
}
