"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * HeroVisual — the PQTABS architecture rendered as one original composition.
 *
 * Left to right: user treasury → post-quantum root (concentric authority
 * rings inside a rotating verification boundary) → policy gates → bounded
 * tab capabilities → autonomous agents. Gold particles are authorized USDC
 * flows; the dashed red path is a direct-to-root attempt that is blocked at
 * the boundary.
 *
 * The artwork is transparent — it melts into the page background with a
 * radial atmosphere and fine grid (no rectangle edges).
 */

const GOLD = "#e2b53e";
const DANGER = "#e5484d";

/** Deterministic coordinate rounding — keeps SSR and client SVG identical. */
const r2 = (n: number) => Math.round(n * 100) / 100;

// Channel paths: root → tab (through policy gates)
const CHANNELS = [
  { d: "M 316 312 C 396 272, 448 176, 530 140", gate: [414, 234] },
  { d: "M 336 360 C 420 346, 505 346, 590 360", gate: [458, 352] },
  { d: "M 316 408 C 396 448, 448 544, 530 580", gate: [414, 486] },
];

// Connectors: tab → agent
const CONNECTORS = [
  "M 712 130 L 900 130",
  "M 772 360 L 930 360",
  "M 712 590 L 900 590",
];

// Blocked direct-to-root attempt (from the lower agent)
const BLOCKED_PATH =
  "M 918 610 C 780 505, 630 440, 352 399";

const TABS = [
  {
    cx: 620,
    cy: 130,
    name: "RESEARCH",
    balance: 312.4,
    cap: 500,
    ratio: 312.4 / 500,
  },
  {
    cx: 680,
    cy: 360,
    name: "SETTLEMENT",
    balance: 1180,
    cap: 2000,
    ratio: 1180 / 2000,
  },
  {
    cx: 620,
    cy: 590,
    name: "INFRASTRUCTURE",
    balance: 509.5,
    cap: 750,
    ratio: 509.5 / 750,
  },
];

const AGENTS = [
  { cx: 928, cy: 130, label: "RESEARCH AGENT" },
  { cx: 958, cy: 360, label: "SETTLEMENT AGENT" },
  { cx: 928, cy: 590, label: "INFRA AGENT" },
];

export function HeroVisual({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  // Pointer parallax — layered depth (rings move least, agents most).
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 50, damping: 20 });
  const sy = useSpring(py, { stiffness: 50, damping: 20 });
  const rootX = useTransform(sx, (v) => v * 8);
  const rootY = useTransform(sy, (v) => v * 6);
  const tabX = useTransform(sx, (v) => v * 14);
  const tabY = useTransform(sy, (v) => v * 10);
  const agentX = useTransform(sx, (v) => v * 20);
  const agentY = useTransform(sy, (v) => v * 14);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    px.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
    py.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
  }

  const enter = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: [0.21, 0.47, 0.32, 0.98] as const },
        };

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      className={cn("relative w-full select-none", className)}
      aria-hidden="true"
    >
      {/* Atmosphere — melts into the page background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 46% 42% at 30% 46%, rgba(226,181,62,0.09), transparent 70%), radial-gradient(ellipse 60% 70% at 62% 50%, rgba(94,234,212,0.035), transparent 72%)",
        }}
      />
      <div className="grid-fade pointer-events-none absolute inset-0" />

      <svg
        viewBox="0 0 1040 720"
        className="relative mx-auto block h-auto w-full max-w-[1040px]"
        fill="none"
        role="img"
      >
        <title>
          PQTABS architecture: a post-quantum root issues bounded spending capabilities
          to autonomous agents
        </title>

        {/* ── Treasury marker ─────────────────────────────────────── */}
        <motion.g {...enter(0.1)}>
          <rect
            x="16"
            y="338"
            width="104"
            height="44"
            rx="8"
            className="fill-[#0e1013]"
            stroke="rgba(255,255,255,0.1)"
          />
          <text
            x="68"
            y="356"
            textAnchor="middle"
            className="fill-muted-foreground font-mono"
            fontSize="9"
            letterSpacing="1.5"
          >
            USER TREASURY
          </text>
          <text
            x="68"
            y="372"
            textAnchor="middle"
            className="fill-gold font-mono tabular"
            fontSize="12"
          >
            HELD
          </text>
          <line x1="122" y1="360" x2="146" y2="360" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" />
          <circle cx="146" cy="360" r="2" className="fill-foreground/40" />
        </motion.g>

        {/* ── Post-quantum root ───────────────────────────────────── */}
        <motion.g style={{ x: rootX, y: rootY }}>
          <motion.g
            style={{ transformOrigin: "250px 360px" }}
            animate={reduced ? undefined : { scale: [1, 1.02, 1] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <circle cx="250" cy="360" r="100" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <circle cx="250" cy="360" r="62" stroke="rgba(226,181,62,0.28)" strokeWidth="1.4" />
            <circle cx="250" cy="360" r="46" stroke="rgba(226,181,62,0.5)" strokeWidth="1.6" strokeDasharray="2 5" />
            <circle cx="250" cy="360" r="30" stroke={GOLD} strokeWidth="2" />
            <circle cx="250" cy="360" r="10" fill={GOLD} />
            <circle cx="250" cy="360" r="17" stroke={GOLD} strokeOpacity="0.4" strokeWidth="1.4" />
            {/* verification ticks on the outer ring */}
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i * Math.PI) / 8;
              return (
                <line
                  key={i}
                  x1={r2(250 + Math.cos(a) * 95)}
                  y1={r2(360 + Math.sin(a) * 95)}
                  x2={r2(250 + Math.cos(a) * 100)}
                  y2={r2(360 + Math.sin(a) * 100)}
                  stroke="rgba(226,181,62,0.35)"
                  strokeWidth="1.2"
                />
              );
            })}
          </motion.g>

          {/* Rotating dashed boundary */}
          <motion.g
            style={{ transformOrigin: "250px 360px" }}
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 110, repeat: Infinity, ease: "linear" }}
          >
            <circle
              cx="250"
              cy="360"
              r="84"
              stroke="rgba(226,181,62,0.45)"
              strokeWidth="1.2"
              strokeDasharray="4 9"
            />
          </motion.g>

          {/* Boundary label on an arc */}
          <path id="pq-boundary-arc" d="M 172 322 A 84 84 0 0 1 328 322" fill="none" />
          <text fontSize="9" letterSpacing="3.2" className="fill-gold/70 font-mono">
            <textPath href="#pq-boundary-arc" startOffset="50%" textAnchor="middle">
              POST-QUANTUM BOUNDARY
            </textPath>
          </text>

          <motion.g {...enter(0.35)}>
            <text
              x="250"
              y="486"
              textAnchor="middle"
              className="fill-foreground font-display"
              fontSize="16"
              fontWeight="600"
              letterSpacing="2"
            >
              PQ ROOT
            </text>
            <text
              x="250"
              y="505"
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize="9.5"
              letterSpacing="1.8"
            >
              SLH-DSA · VERIFIED ON ARC
            </text>
          </motion.g>
        </motion.g>

        {/* ── Channels: root → tab (draw-in + traveling particles) ── */}
        {CHANNELS.map((c, i) => (
          <g key={`ch-${i}`}>
            <motion.path
              d={c.d}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="1.4"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.3, delay: 0.5 + i * 0.18, ease: "easeInOut" }}
            />
            {/* Policy gate */}
            <motion.g
              initial={reduced ? false : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 1.15 + i * 0.18 }}
              style={{ transformOrigin: `${c.gate[0]}px ${c.gate[1]}px` }}
            >
              <rect
                x={c.gate[0] - 5.5}
                y={c.gate[1] - 5.5}
                width="11"
                height="11"
                transform={`rotate(45 ${c.gate[0]} ${c.gate[1]})`}
                className="fill-[#0e1013]"
                stroke={GOLD}
                strokeWidth="1.3"
              />
              <circle cx={c.gate[0]} cy={c.gate[1]} r="1.8" fill={GOLD}>
                {!reduced && (
                  <animate attributeName="opacity" values="1;0.25;1" dur={`${3 + i}s`} repeatCount="indefinite" />
                )}
              </circle>
            </motion.g>
            {/* Authorized USDC particles */}
            {!reduced && (
              <>
                <circle r="2.6" fill={GOLD}>
                  <animateMotion dur={`${5 + i * 0.7}s`} repeatCount="indefinite" begin={`${i * 1.4}s`} path={c.d} />
                </circle>
                <circle r="1.6" fill={GOLD} opacity="0.55">
                  <animateMotion dur={`${5 + i * 0.7}s`} repeatCount="indefinite" begin={`${i * 1.4 + 2.4}s`} path={c.d} />
                </circle>
              </>
            )}
            <text
              x={(c.gate[0] as number) + 0}
              y={(c.gate[1] as number) - 14}
              textAnchor="middle"
              className="fill-muted-foreground/70 font-mono"
              fontSize="8"
              letterSpacing="1.6"
            >
              POLICY
            </text>
          </g>
        ))}

        {/* ── Tab capability cards ────────────────────────────────── */}
        <motion.g style={{ x: tabX, y: tabY }} {...enter(0.55)}>
          {TABS.map((t) => {
            const x = t.cx - 90;
            const y = t.cy - 37;
            return (
              <g key={t.name}>
                <rect
                  x={x}
                  y={y}
                  width="180"
                  height="74"
                  rx="10"
                  className="fill-[#0e1013]"
                  stroke="rgba(255,255,255,0.1)"
                />
                {/* cap notch */}
                <rect x={x + 14} y={y} width="26" height="2.5" fill={GOLD} opacity="0.9" />
                <text
                  x={x + 14}
                  y={y + 24}
                  className="fill-muted-foreground font-mono"
                  fontSize="9"
                  letterSpacing="1.6"
                >
                  {t.name} · CAPABILITY
                </text>
                <text
                  x={x + 14}
                  y={y + 44}
                  className="fill-foreground font-display tabular"
                  fontSize="16"
                  fontWeight="600"
                >
                  WITHIN CAP
                </text>
                {/* balance progress */}
                <rect x={x + 14} y={y + 56} width="152" height="3" rx="1.5" fill="rgba(255,255,255,0.08)" />
                <rect
                  x={x + 14}
                  y={y + 56}
                  width={152 * t.ratio}
                  height="3"
                  rx="1.5"
                  fill={GOLD}
                  opacity="0.85"
                />
              </g>
            );
          })}
        </motion.g>

        {/* ── Connectors: tab → agent + particles ─────────────────── */}
        {CONNECTORS.map((d, i) => (
          <g key={`cn-${i}`}>
            <motion.path
              d={d}
              stroke="rgba(94,234,212,0.28)"
              strokeWidth="1.2"
              strokeDasharray="1 4"
              strokeLinecap="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: 1.25 + i * 0.15 }}
            />
            {!reduced && (
              <circle r="1.8" fill="#5eead4" opacity="0.8">
                <animateMotion dur={`${3.4 + i * 0.5}s`} repeatCount="indefinite" begin={`${i * 0.9}s`} path={d} />
              </circle>
            )}
          </g>
        ))}

        {/* ── Agent nodes ─────────────────────────────────────────── */}
        <motion.g style={{ x: agentX, y: agentY }} {...enter(0.75)}>
          {AGENTS.map((a) => (
            <g key={a.label}>
              <circle cx={a.cx} cy={a.cy} r="24" className="fill-[#0e1013]" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
              <circle cx={a.cx} cy={a.cy} r="9" stroke="rgba(94,234,212,0.7)" strokeWidth="1.4" />
              <circle cx={a.cx} cy={a.cy} r="3.4" fill="#5eead4" />
              <text
                x={a.cx}
                y={a.cy + 42}
                textAnchor="middle"
                className="fill-muted-foreground font-mono"
                fontSize="8.5"
                letterSpacing="1.4"
              >
                {a.label}
              </text>
            </g>
          ))}
        </motion.g>

        {/* ── Blocked direct-to-root attempt ──────────────────────── */}
        <motion.g
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.7 }}
        >
          <path d={BLOCKED_PATH} stroke="rgba(229,72,77,0.4)" strokeWidth="1.2" strokeDasharray="3 6" />
          {/* block marker at the boundary */}
          <g>
            <circle cx="346" cy="400" r="9" className="fill-[#0e1013]" stroke={DANGER} strokeWidth="1.3" />
            <line x1="342" y1="396" x2="350" y2="404" stroke={DANGER} strokeWidth="1.6" strokeLinecap="round" />
            <line x1="350" y1="396" x2="342" y2="404" stroke={DANGER} strokeWidth="1.6" strokeLinecap="round" />
            {!reduced && (
              <animate attributeName="opacity" values="1;0.45;1" dur="2.6s" repeatCount="indefinite" />
            )}
          </g>
          {/* attack particle — travels, then is stopped at the boundary */}
          {!reduced && (
            <circle r="2.2" fill={DANGER}>
              <animateMotion
                dur="3.6s"
                repeatCount="indefinite"
                begin="2.2s"
                path={BLOCKED_PATH}
                keyPoints="0;0.94;0.94"
                keyTimes="0;0.62;1"
                calcMode="linear"
              />
            </circle>
          )}
          <text
            x="640"
            y="497"
            textAnchor="middle"
            className="fill-danger/80 font-mono"
            fontSize="8.5"
            letterSpacing="1.6"
          >
            DIRECT ROOT ACCESS — BLOCKED
          </text>
        </motion.g>
      </svg>

      {/* Legend */}
      <div className="relative mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pb-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Authorized USDC flow
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="inline-block h-2 w-2 rotate-45 border border-gold bg-[#0e1013]" /> Policy gate
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full border border-danger" /> Blocked attempt
        </span>
      </div>
    </div>
  );
}

export default HeroVisual;
