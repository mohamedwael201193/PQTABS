"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * TabLifecycle — the life of a capability, as a loop.
 *
 * Treasury → open capability → agent spends → policy check → expiry →
 * reclaim, and the return path brings unspent funds back. One gold particle
 * travels the whole cycle, started when the artwork enters the viewport.
 */

const GOLD = "#e2b53e";
const TEAL = "#5eead4";

const CY = 160;
const STAGE_X = [250, 410, 570, 730, 890];

interface Stage {
  name: string;
  note: string;
  ring: string;
}

const STAGES: Stage[] = [
  { name: "Open capability", note: "ROOT SIGNS", ring: "rgba(226,181,62,0.55)" },
  { name: "Agent spends", note: "USDC · WITHIN CAP", ring: "rgba(94,234,212,0.5)" },
  { name: "Policy check", note: "EVERY PAYMENT", ring: "rgba(226,181,62,0.55)" },
  { name: "Expiry", note: "TIME-BOXED", ring: "rgba(255,255,255,0.25)" },
  { name: "Reclaim", note: "UNSPENT RETURNS", ring: "rgba(226,181,62,0.55)" },
];

// Forward flow connectors (treasury → … → reclaim).
const CONNECTORS = [
  { d: "M 154 160 L 209 160", arrow: "M 204 155.5 L 210 160 L 204 164.5" },
  { d: "M 284 160 L 371 160", arrow: "M 366 155.5 L 372 160 L 366 164.5" },
  { d: "M 444 160 L 531 160", arrow: "M 526 155.5 L 532 160 L 526 164.5" },
  { d: "M 604 160 L 691 160", arrow: "M 686 155.5 L 692 160 L 686 164.5" },
  { d: "M 764 160 L 851 160", arrow: "M 846 155.5 L 852 160 L 846 164.5" },
];

// The return path: reclaim → treasury.
const RETURN_PATH = "M 890 192 C 890 236, 844 258, 764 262 L 258 262 C 176 262, 95 238, 95 194";

// Full cycle for the traveling particle.
const LOOP_PATH =
  "M 154 160 L 890 160 C 890 232, 844 258, 764 262 L 258 262 C 176 262, 95 236, 95 194 L 95 178";
const LOOP_DUR = 9;
const LOOP_DELAY_MS = 2400;

export default function TabLifecycle({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-100px" });
  const reduced = useReducedMotion();
  const loopRef = useRef<SVGAnimateElement | null>(null);

  useEffect(() => {
    if (!inView || reduced) return;
    const t = window.setTimeout(
      () => loopRef.current?.beginElement(),
      LOOP_DELAY_MS
    );
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  const draw = (delay: number, dur = 0.32) =>
    reduced
      ? {}
      : ({
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: dur, delay, ease: "easeInOut" },
        } as const);

  const pop = (delay: number, x: number, y: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, scale: 0.6 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: 0.42, delay, ease: [0.16, 1, 0.3, 1] },
          style: { transformOrigin: `${x}px ${y}px` },
        } as const);

  const fade = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, y: 5 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: 0.4, delay },
        } as const);

  const nodeDelay = [0.3, 0.65, 1, 1.35, 1.7];
  const connDelay = [0.15, 0.5, 0.85, 1.2, 1.55];

  return (
    <div ref={containerRef} className={cn("relative w-full select-none", className)}>
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 52% 44% at 48% 44%, rgba(226,181,62,0.05), transparent 72%)",
        }}
      />
      <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden="true" />

      <svg
        viewBox="0 0 1040 312"
        className="relative mx-auto block h-auto w-full max-w-[1000px]"
        fill="none"
        role="img"
      >
        <title>
          The capability lifecycle: open, spend, check, expire, reclaim —
          unspent funds return to the treasury.
        </title>

        {/* ── Treasury ────────────────────────────────────────────── */}
        <motion.g {...pop(0, 95, 160)}>
          <rect x="36" y="132" width="118" height="56" rx="9" fill="#0e1013" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
          <rect x="48" y="132" width="24" height="2.5" fill={GOLD} opacity="0.9" />
          <text x="95" y="157" textAnchor="middle" fontSize="9" letterSpacing="2" fill="rgba(255,255,255,0.7)" className="font-mono">
            TREASURY
          </text>
          <text x="95" y="172" textAnchor="middle" fontSize="7.5" letterSpacing="1.6" fill="rgba(255,255,255,0.4)" className="font-mono">
            ROOT-HELD
          </text>
        </motion.g>

        {/* ── Connectors ──────────────────────────────────────────── */}
        {CONNECTORS.map((c, i) => (
          <g key={`conn-${i}`}>
            <motion.path
              d={c.d}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1.3"
              {...draw(connDelay[i] ?? 0)}
            />
            <motion.path
              d={c.arrow}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              {...fade((connDelay[i] ?? 0) + 0.28)}
            />
          </g>
        ))}

        {/* ── Stage nodes ─────────────────────────────────────────── */}
        {STAGES.map((s, i) => {
          const x = STAGE_X[i] ?? 250;
          const delay = nodeDelay[i] ?? 0.3;
          return (
            <g key={s.name}>
              <motion.g {...pop(delay, x, CY)}>
                <circle cx={x} cy={CY} r="30" fill="#0e1013" stroke={s.ring} strokeWidth="1.4" />
                {i === 0 && (
                  <path
                    d="M 242 160 L 258 160 M 250 152 L 250 168"
                    stroke={GOLD}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
                {i === 1 && (
                  <text x={x} y={CY + 6} textAnchor="middle" fontSize="17" fontWeight="600" fill={TEAL} className="font-mono">
                    $
                  </text>
                )}
                {i === 2 && (
                  <g>
                    <rect
                      x={x - 7.5}
                      y={CY - 7.5}
                      width="15"
                      height="15"
                      transform={`rotate(45 ${x} ${CY})`}
                      fill="#0e1013"
                      stroke={GOLD}
                      strokeWidth="1.4"
                    />
                    <circle cx={x} cy={CY} r="2" fill={GOLD} />
                  </g>
                )}
                {i === 3 && (
                  <g>
                    <circle cx={x} cy={CY} r="11" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" />
                    <path
                      d={`M ${x} ${CY} L ${x} ${CY - 7} M ${x} ${CY} L ${x + 5.5} ${CY}`}
                      stroke="rgba(255,255,255,0.65)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <circle cx={x} cy={CY} r="1.2" fill="rgba(255,255,255,0.65)" />
                  </g>
                )}
                {i === 4 && (
                  <g>
                    <path
                      d="M 898 151 C 894 142, 880 142, 876 152"
                      stroke={GOLD}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 882 146 L 875.5 152.5 L 883 155.5"
                      stroke={GOLD}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
              </motion.g>
              {/* index + labels */}
              <motion.g {...fade(delay + 0.15)}>
                <text x={x} y="112" textAnchor="middle" fontSize="8" letterSpacing="2" fill="rgba(226,181,62,0.5)" className="font-mono">
                  {`0${i + 1}`}
                </text>
                <text x={x} y="213" textAnchor="middle" fontSize="13" fontWeight="600" fill="rgba(255,255,255,0.9)" className="font-display">
                  {s.name}
                </text>
                <text x={x} y="231" textAnchor="middle" fontSize="8.5" letterSpacing="1.4" fill="rgba(255,255,255,0.4)" className="font-mono">
                  {s.note}
                </text>
              </motion.g>
            </g>
          );
        })}

        {/* ── Return path ─────────────────────────────────────────── */}
        <motion.path
          d={RETURN_PATH}
          stroke="rgba(226,181,62,0.4)"
          strokeWidth="1.3"
          strokeDasharray="5 6"
          initial={reduced ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, delay: 1.95 }}
        />
        <motion.path
          d="M 90.5 200 L 95 193.5 L 99.5 200"
          stroke="rgba(226,181,62,0.55)"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          {...fade(2.35)}
        />
        <motion.g {...fade(2.2)}>
          <text x="495" y="287" textAnchor="middle" fontSize="9" letterSpacing="2.2" fill="rgba(226,181,62,0.6)" className="font-mono">
            FUNDS RETURN · NOTHING LINGERS
          </text>
        </motion.g>

        {/* ── Cycle particle — SMIL, started once the loop is drawn ── */}
        {!reduced && (
          <>
            <circle r="2.6" fill={GOLD} opacity="0">
              <animateMotion
                id="lc-loop"
                begin="indefinite"
                dur={`${LOOP_DUR}s`}
                repeatCount="indefinite"
                path={LOOP_PATH}
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.03;0.94;1"
                dur={`${LOOP_DUR}s`}
                repeatCount="indefinite"
                begin="lc-loop.begin"
              />
            </circle>
            <circle r="5.5" fill={GOLD} opacity="0">
              <animateMotion
                begin="lc-loop.begin"
                dur={`${LOOP_DUR}s`}
                repeatCount="indefinite"
                path={LOOP_PATH}
              />
              <animate
                attributeName="opacity"
                values="0;0.2;0.2;0"
                keyTimes="0;0.03;0.94;1"
                dur={`${LOOP_DUR}s`}
                repeatCount="indefinite"
                begin="lc-loop.begin"
              />
            </circle>
          </>
        )}
        {reduced && <circle cx="500" cy="262" r="2.6" fill={GOLD} />}
      </svg>
    </div>
  );
}
