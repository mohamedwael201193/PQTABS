"use client";

import { useEffect, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AttackBlocked — the security model as one staged composition.
 *
 * A compromised agent fires five attack vectors at the onchain policy wall.
 * Every vector is rejected at a policy gate with a red ×. One payment inside
 * the bounds flows through to an approved recipient. The sequence plays once
 * when the artwork enters the viewport; with reduced motion the final state
 * renders statically.
 */

const GOLD = "#e2b53e";
const DANGER = "#e5484d";
const SUCCESS = "#3dd68c";

interface Attack {
  y: number;
  intent: string;
  blocked: string;
}

const ATTACKS: Attack[] = [
  { y: 66, intent: "Access root treasury", blocked: "ROOT ISOLATED" },
  { y: 138, intent: "Increase its own cap", blocked: "CAP LOCKED" },
  { y: 210, intent: "Add a recipient", blocked: "RECIPIENTS FIXED" },
  { y: 282, intent: "Create new authority", blocked: "NO ROOT KEY" },
  { y: 354, intent: "Spend after expiry", blocked: "EXPIRED" },
];

const WALL_X = 560;
const AGENT = { x: 92, y: 210 };

const ATTACK_START = 0.85;
const STAGGER = 0.32;
const DRAW_DUR = 0.42;

// The one authorized payment: agent → policy gate → approved recipient.
const ALLOWED_PATH = "M 112 228 C 230 320, 400 414, 552 415 L 726 415";
const ALLOWED_DELAY = ATTACK_START + ATTACKS.length * STAGGER + 0.18;
const GATE_Y = 415;

// Particle rhythm: travel, deliver, fade, repeat.
const PARTICLE_DUR = 4.4;
const PARTICLE_TRAVEL = 0.55;
const PARTICLE_DELAY_MS = 3400;
const CHECK_DELAY =
  PARTICLE_DELAY_MS / 1000 + PARTICLE_DUR * PARTICLE_TRAVEL + 0.05;

function attackPath(y: number): string {
  const c1 = 210 + (y - 210) * 0.18;
  const c2 = y - (y - 210) * 0.04;
  return `M 120 210 C 240 ${c1}, 400 ${c2}, 552 ${y}`;
}

export default function AttackBlocked({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-100px" });
  const reduced = useReducedMotion();
  const payRef = useRef<SVGAnimateElement | null>(null);

  useEffect(() => {
    if (!inView || reduced) return;
    const t = window.setTimeout(
      () => payRef.current?.beginElement(),
      PARTICLE_DELAY_MS
    );
    return () => window.clearTimeout(t);
  }, [inView, reduced]);

  const draw = (delay: number, dur = DRAW_DUR) =>
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
          initial: { opacity: 0, scale: 0.55 },
          whileInView: { opacity: 1, scale: 1 },
          viewport: { once: true, margin: "-100px" },
          transition: { duration: 0.34, delay, ease: [0.16, 1, 0.3, 1] },
          style: { transformOrigin: `${x}px ${y}px` },
        } as const);

  // CSS-driven fade keyed to the component's inView state. Deterministic
  // on SVG elements (no motion keyframe origin resolution involved) and
  // identical in timing to the original choreography.
  const fade = (delay: number) =>
    ({
      style: {
        opacity: inView ? 1 : 0,
        transition: `opacity 0.4s cubic-bezier(0.21, 0.47, 0.32, 0.98) ${delay}s`,
      },
    } as const);

  return (
    <div ref={containerRef} className={cn("relative w-full select-none", className)}>
      {/* Atmosphere — danger at the agent, gold at the wall, success at the recipient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 28% 40% at 10% 46%, rgba(229,72,77,0.05), transparent 70%), radial-gradient(ellipse 38% 52% at 58% 50%, rgba(226,181,62,0.06), transparent 72%), radial-gradient(ellipse 22% 26% at 88% 90%, rgba(61,214,140,0.04), transparent 70%)",
        }}
      />

      <svg
        viewBox="0 0 960 460"
        className="relative mx-auto block h-auto w-full max-w-[920px]"
        fill="none"
        role="img"
      >
        <title>
          Five attack vectors from a compromised agent are blocked at the
          onchain policy wall; one authorized payment passes through.
        </title>

        {/* ── Policy wall ─────────────────────────────────────────── */}
        <motion.path
          d="M 560 36 L 560 432"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.5"
          {...draw(0.05, 0.6)}
        />
        <motion.path
          d="M 568 40 L 568 428"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
          {...draw(0.12, 0.55)}
        />
        <rect
          x="548"
          y="36"
          width="24"
          height="396"
          fill="rgba(226,181,62,0.04)"
          {...fade(0.15)}
        />
        <g {...fade(0.3)}>
          <text
            x={WALL_X}
            y="24"
            textAnchor="middle"
            fontSize="10"
            letterSpacing="2.4"
            fill="rgba(226,181,62,0.9)"
            className="font-mono"
          >
            POLICY · ENFORCED ONCHAIN
          </text>
        </g>

        {/* ── Compromised agent ───────────────────────────────────── */}
        <motion.g {...pop(0.1, AGENT.x, AGENT.y)}>
          <motion.circle
            cx={AGENT.x}
            cy={AGENT.y}
            r="34"
            stroke={DANGER}
            strokeOpacity="0.35"
            strokeWidth="1.2"
            initial={false}
            animate={reduced ? undefined : { opacity: [0.5, 0.12, 0.5] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle cx={AGENT.x} cy={AGENT.y} r="25" fill="#150e0f" stroke="rgba(229,72,77,0.6)" strokeWidth="1.4" />
          <circle cx={AGENT.x} cy={AGENT.y} r="16" stroke="rgba(229,72,77,0.35)" strokeWidth="1.2" strokeDasharray="2 4" />
          <circle cx={AGENT.x} cy={AGENT.y} r="5.5" fill={DANGER} />
        </motion.g>
        <g {...fade(0.32)}>
          <text
            x={AGENT.x}
            y="262"
            textAnchor="middle"
            fontSize="9"
            letterSpacing="1.6"
            fill="rgba(229,72,77,0.85)"
            className="font-mono"
          >
            COMPROMISED AGENT
          </text>
        </g>

        {/* ── Attack vectors ──────────────────────────────────────── */}
        {ATTACKS.map((a, i) => {
          const delay = ATTACK_START + i * STAGGER;
          return (
            <g key={a.blocked}>
              <motion.path
                d={attackPath(a.y)}
                stroke="rgba(229,72,77,0.45)"
                strokeWidth="1.2"
                {...draw(delay)}
              />
              <g {...fade(delay + 0.12)}>
                <text
                  x="536"
                  y={a.y - 10}
                  textAnchor="end"
                  fontSize="10"
                  letterSpacing="1"
                  fill="rgba(255,255,255,0.55)"
                  className="font-mono"
                >
                  {a.intent}
                </text>
              </g>
              {/* policy gate where the vector lands */}
              <motion.g {...pop(0.35 + i * 0.05, WALL_X, a.y)}>
                <rect
                  x={WALL_X - 5.5}
                  y={a.y - 5.5}
                  width="11"
                  height="11"
                  transform={`rotate(45 ${WALL_X} ${a.y})`}
                  fill="#0e1013"
                  stroke={GOLD}
                  strokeWidth="1.3"
                />
                <circle cx={WALL_X} cy={a.y} r="1.6" fill={GOLD} />
              </motion.g>
              {/* rejection × */}
              <motion.g {...pop(delay + 0.45, 586, a.y)}>
                <circle cx="586" cy={a.y} r="8" fill="#140d0e" stroke="rgba(229,72,77,0.35)" strokeWidth="1" />
                <line x1="582" y1={a.y - 4} x2="590" y2={a.y + 4} stroke={DANGER} strokeWidth="1.7" strokeLinecap="round" />
                <line x1="590" y1={a.y - 4} x2="582" y2={a.y + 4} stroke={DANGER} strokeWidth="1.7" strokeLinecap="round" />
              </motion.g>
              <g {...fade(delay + 0.55)}>
                <text
                  x="602"
                  y={a.y + 3.5}
                  fontSize="10"
                  letterSpacing="1.5"
                  fill="rgba(229,72,77,0.9)"
                  className="font-mono"
                >
                  {a.blocked}
                </text>
              </g>
            </g>
          );
        })}

        {/* ── The one allowed payment ─────────────────────────────── */}
        <motion.path
          d={ALLOWED_PATH}
          stroke="rgba(226,181,62,0.55)"
          strokeWidth="1.4"
          {...draw(ALLOWED_DELAY, 0.6)}
        />
        <g {...fade(ALLOWED_DELAY + 0.15)}>
          <text
            x={WALL_X}
            y={GATE_Y - 19}
            textAnchor="middle"
            fontSize="8.5"
            letterSpacing="1.8"
            fill="rgba(226,181,62,0.65)"
            className="font-mono"
          >
            WITHIN POLICY
          </text>
        </g>
        <motion.g {...pop(0.35 + ATTACKS.length * 0.05, WALL_X, GATE_Y)}>
          <rect
            x={WALL_X - 6.5}
            y={GATE_Y - 6.5}
            width="13"
            height="13"
            transform={`rotate(45 ${WALL_X} ${GATE_Y})`}
            fill="#0e1013"
            stroke={GOLD}
            strokeWidth="1.5"
          />
          <circle cx={WALL_X} cy={GATE_Y} r="2" fill={GOLD} />
        </motion.g>

        {/* Gold payment particle — SMIL, started when the path is drawn */}
        {!reduced && (
          <>
            <circle r="6" fill={GOLD} opacity="0">
              <animateMotion
                id="ab-pay"
                begin="indefinite"
                dur={`${PARTICLE_DUR}s`}
                repeatCount="indefinite"
                path={ALLOWED_PATH}
                keyPoints="0;1;1"
                keyTimes={`0;${PARTICLE_TRAVEL};1`}
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0;0.22;0.22;0;0"
                keyTimes="0;0.04;0.5;0.56;1"
                dur={`${PARTICLE_DUR}s`}
                repeatCount="indefinite"
                begin="ab-pay.begin"
              />
            </circle>
            <circle r="2.8" fill={GOLD} opacity="0">
              <animateMotion
                begin="ab-pay.begin"
                dur={`${PARTICLE_DUR}s`}
                repeatCount="indefinite"
                path={ALLOWED_PATH}
                keyPoints="0;1;1"
                keyTimes={`0;${PARTICLE_TRAVEL};1`}
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0;0"
                keyTimes="0;0.04;0.5;0.56;1"
                dur={`${PARTICLE_DUR}s`}
                repeatCount="indefinite"
                begin="ab-pay.begin"
              />
            </circle>
          </>
        )}
        {reduced && <circle cx={WALL_X} cy={GATE_Y} r="2.8" fill={GOLD} />}

        {/* Recipient + success check */}
        <motion.g {...pop(CHECK_DELAY, 738, GATE_Y)}>
          <circle cx="738" cy={GATE_Y} r="10" fill="#0d1512" stroke={SUCCESS} strokeWidth="1.4" />
          <path
            d="M 733.5 415.2 L 736.5 418.4 L 742.5 411.8"
            stroke={SUCCESS}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
        <g {...fade(CHECK_DELAY + 0.08)}>
          <text
            x="760"
            y={GATE_Y - 17}
            fontSize="8"
            letterSpacing="1.8"
            fill="rgba(255,255,255,0.4)"
            className="font-mono"
          >
            APPROVED RECIPIENT
          </text>
          <text x="760" y={GATE_Y + 4}>
            <tspan fontSize="13" fontWeight="600" fill={GOLD} className="font-display tabular">
              $47.00
            </tspan>
            <tspan fontSize="9.5" letterSpacing="1.2" fill="rgba(255,255,255,0.35)" className="font-mono">
              {" → "}
            </tspan>
            <tspan fontSize="9.5" letterSpacing="1.2" fill="rgba(255,255,255,0.85)" className="font-mono">
              VERCEL EDGE
            </tspan>
          </text>
        </g>
      </svg>

      {/* Legend */}
      <div className="relative mt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pb-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <X className="size-3 text-danger" strokeWidth={2} aria-hidden="true" />
          Blocked attack vector
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="inline-block h-2 w-2 rotate-45 border border-gold bg-[#0e1013]" aria-hidden="true" />
          Policy gate
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
          Authorized payment
        </span>
      </div>
    </div>
  );
}
