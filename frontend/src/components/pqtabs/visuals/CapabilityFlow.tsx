"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * CapabilityFlow — the PQTABS mechanism as one horizontal composition.
 *
 * Four stages: the post-quantum root issues a bounded tab, the tab
 * constrains an agent, and the agent pays within policy through the gate.
 * A single gold particle rides the whole root→payment channel, passing
 * beneath each stage card and through the policy gate. The highlighted
 * stage is externally controllable (the numbered steps below the visual
 * drive it); left alone, it cycles gently.
 */

const GOLD = "#e2b53e";

/** Deterministic coordinate rounding — keeps SSR and client SVG identical. */
const r2 = (n: number) => Math.round(n * 100) / 100;
const TEAL = "#5eead4";

const CARD_W = 180;
const CARD_H = 120;
const CARD_Y = 66;
const CARD_X = [24, 260, 496, 732];
const CARD_CY = CARD_Y + CARD_H / 2; // 126 — the channel line

const STAGES = [
  { name: "PQ Root", title: "PQ ROOT", sub: "SLH-DSA" },
  { name: "Tab", title: "TAB", sub: "BOUNDED CAPABILITY" },
  { name: "Agent", title: "AGENT", sub: "AUTONOMOUS" },
  { name: "Payment", title: "PAYMENT", sub: "USDC" },
] as const;

// Connector segments between the stage cards (left → right).
const CONNECTORS = [
  { d: "M 204 126 L 260 126", label: "creates", labelX: 232 },
  { d: "M 440 126 L 496 126", label: "constrains", labelX: 468 },
  { d: "M 676 126 L 732 126", label: "within policy", labelX: 704 },
] as const;

// The full channel the particle travels — beneath the cards, through the gate.
const CHANNEL_PATH = "M 114 126 L 822 126";

// Policy gate on the agent → payment segment.
const GATE = { x: 704, y: 126 };

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

export default function CapabilityFlow({
  className,
  activeStage,
  onStageSelect,
}: {
  className?: string;
  activeStage?: number | null;
  onStageSelect?: (i: number) => void;
}) {
  const reduced = useReducedMotion();
  const [autoStage, setAutoStage] = useState<number | null>(0);

  // Gentle auto-cycle of the highlighted stage when nothing is selected.
  useEffect(() => {
    if (reduced || activeStage != null) return;
    const id = window.setInterval(() => {
      setAutoStage((s) => ((s ?? 0) + 1) % STAGES.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, [activeStage, reduced]);

  const highlighted = activeStage ?? autoStage;

  const enter = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0, y: 12 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.7, delay, ease: EASE },
        } as const);

  const draw = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.55, delay, ease: "easeInOut" },
        } as const);

  const fade = (delay: number) =>
    reduced
      ? {}
      : ({
          initial: { opacity: 0 },
          whileInView: { opacity: 1 },
          viewport: { once: true, margin: "-80px" },
          transition: { duration: 0.45, delay },
        } as const);

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Atmosphere — gold at the root, teal at the agent */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 26% 42% at 12% 40%, rgba(226,181,62,0.05), transparent 70%), radial-gradient(ellipse 22% 38% at 78% 40%, rgba(94,234,212,0.04), transparent 72%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[920px]">
        <svg
          viewBox="0 0 960 320"
          className="relative block h-auto w-full"
          fill="none"
          role="img"
        >
          <title>
            Capability flow: the post-quantum root issues a bounded tab, the
            tab constrains an agent, and the agent pays within policy.
          </title>

          {/* ── Connector segments + annotations ───────────────────── */}
          {CONNECTORS.map((c, i) => (
            <g key={c.label}>
              <motion.path
                d={c.d}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.4"
                {...draw(0.25 + i * 0.2)}
              />
              <motion.g {...fade(0.6 + i * 0.2)}>
                <text
                  x={c.labelX}
                  y="112"
                  textAnchor="middle"
                  fontSize="9"
                  letterSpacing="1.8"
                  className="font-mono"
                  fill={i === 2 ? "rgba(226,181,62,0.8)" : "rgba(154,160,168,0.8)"}
                >
                  {c.label.toUpperCase()}
                </text>
              </motion.g>
            </g>
          ))}

          {/* ── The traveling gold particle (beneath the cards) ────── */}
          {!reduced && (
            <>
              <circle r="6" fill={GOLD} opacity="0.14">
                <animateMotion dur="7s" repeatCount="indefinite" path={CHANNEL_PATH} />
              </circle>
              <circle r="2.4" fill={GOLD}>
                <animateMotion dur="7s" repeatCount="indefinite" path={CHANNEL_PATH} />
              </circle>
            </>
          )}
          {reduced && <circle cx={GATE.x} cy={GATE.y} r="2.4" fill={GOLD} />}

          {/* ── Stage cards ────────────────────────────────────────── */}
          {STAGES.map((s, i) => {
            const x = CARD_X[i];
            const cx = x + CARD_W / 2;
            const isActive = highlighted === i;
            return (
              <motion.g key={s.title} {...enter(0.1 + i * 0.14)}>
                <motion.g
                  style={{ transformOrigin: `${cx}px ${CARD_CY}px` }}
                  animate={{ scale: isActive ? 1.02 : 1 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {/* active halo ring */}
                  <motion.rect
                    x={x - 3.5}
                    y={CARD_Y - 3.5}
                    width={CARD_W + 7}
                    height={CARD_H + 7}
                    rx="15"
                    stroke={GOLD}
                    strokeOpacity="0.32"
                    strokeWidth="1"
                    initial={false}
                    animate={{ opacity: isActive ? 1 : 0 }}
                    transition={{ duration: 0.3 }}
                  />
                  <rect
                    x={x}
                    y={CARD_Y}
                    width={CARD_W}
                    height={CARD_H}
                    rx="12"
                    className={cn(
                      "fill-[#0e1013] transition-colors duration-300",
                      isActive ? "stroke-gold" : "stroke-white/10"
                    )}
                    strokeWidth="1.2"
                  />
                  {/* stage index */}
                  <text
                    x={x + 16}
                    y={CARD_Y + 27}
                    fontSize="8"
                    letterSpacing="1.4"
                    className={cn(
                      "font-mono tabular transition-colors duration-300",
                      isActive ? "fill-gold" : "fill-white/25"
                    )}
                  >
                    {`0${i + 1}`}
                  </text>
                  {/* title */}
                  <text
                    x={cx}
                    y={CARD_Y + 28}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    letterSpacing="2.4"
                    className="fill-foreground/90 font-display"
                  >
                    {s.title}
                  </text>
                  {/* sub-label */}
                  <text
                    x={cx}
                    y={CARD_Y + 106}
                    textAnchor="middle"
                    fontSize="7.5"
                    letterSpacing="1.6"
                    className="fill-muted-foreground/80 font-mono"
                  >
                    {s.sub}
                  </text>

                  {/* — Glyphs — */}
                  {i === 0 && (
                    <g>
                      <circle cx={cx} cy={CARD_CY + 4} r="30" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <circle cx={cx} cy={CARD_CY + 4} r="21" stroke="rgba(226,181,62,0.28)" strokeWidth="1.2" />
                      <circle cx={cx} cy={CARD_CY + 4} r="14" stroke="rgba(226,181,62,0.45)" strokeWidth="1.2" strokeDasharray="2 4" />
                      <circle cx={cx} cy={CARD_CY + 4} r="8.5" stroke={GOLD} strokeWidth="1.6" />
                      <circle cx={cx} cy={CARD_CY + 4} r="4" fill={GOLD} />
                      {Array.from({ length: 8 }).map((_, t) => {
                        const a = (t * Math.PI) / 4;
                        return (
                          <line
                            key={t}
                            x1={r2(cx + Math.cos(a) * 25)}
                            y1={r2(CARD_CY + 4 + Math.sin(a) * 25)}
                            x2={r2(cx + Math.cos(a) * 30)}
                            y2={r2(CARD_CY + 4 + Math.sin(a) * 30)}
                            stroke="rgba(226,181,62,0.35)"
                            strokeWidth="1"
                          />
                        );
                      })}
                    </g>
                  )}

                  {i === 1 && (
                    <g>
                      <rect
                        x={cx - 52}
                        y={CARD_CY - 27}
                        width="104"
                        height="54"
                        rx="8"
                        fill="#14171a"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="1.1"
                      />
                      {/* cap notch */}
                      <rect x={cx - 38} y={CARD_CY - 27} width="12" height="2.5" fill={GOLD} opacity="0.9" />
                      {/* title bar */}
                      <rect x={cx - 38} y={CARD_CY - 15} width="26" height="3" rx="1.5" fill="rgba(255,255,255,0.22)" />
                      {/* balance bar */}
                      <rect x={cx - 38} y={CARD_CY - 5} width="56" height="6" rx="3" fill={GOLD} />
                      {/* progress sliver */}
                      <rect x={cx - 38} y={CARD_CY + 8} width="76" height="3" rx="1.5" fill="rgba(255,255,255,0.08)" />
                      <rect x={cx - 38} y={CARD_CY + 8} width="44" height="3" rx="1.5" fill={GOLD} opacity="0.85" />
                    </g>
                  )}

                  {i === 2 && (
                    <g>
                      <circle cx={cx} cy={CARD_CY + 4} r="21" fill="#0e1013" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
                      <circle cx={cx} cy={CARD_CY + 4} r="15" stroke="rgba(94,234,212,0.3)" strokeWidth="1" strokeDasharray="2 4" />
                      <circle cx={cx} cy={CARD_CY + 4} r="8.5" stroke="rgba(94,234,212,0.7)" strokeWidth="1.4" />
                      <circle cx={cx} cy={CARD_CY + 4} r="3.2" fill={TEAL} />
                    </g>
                  )}

                  {i === 3 && (
                    <g>
                      <circle cx={cx} cy={CARD_CY + 4} r="21" stroke="rgba(226,181,62,0.45)" strokeWidth="1.3" />
                      <circle cx={cx} cy={CARD_CY + 4} r="17" stroke="rgba(94,234,212,0.35)" strokeWidth="1" />
                      <circle cx={cx} cy={CARD_CY + 4} r="12.5" fill="#0e1013" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <text
                        x={cx}
                        y={CARD_CY + 9.5}
                        textAnchor="middle"
                        fontSize="14"
                        fontWeight="600"
                        fill={TEAL}
                        className="font-mono"
                      >
                        $
                      </text>
                    </g>
                  )}
                </motion.g>
              </motion.g>
            );
          })}

          {/* ── Policy gate on the agent → payment path ────────────── */}
          <motion.g
            initial={reduced ? false : { opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: 1.0, ease: EASE }}
            style={{ transformOrigin: `${GATE.x}px ${GATE.y}px` }}
          >
            <rect
              x={GATE.x - 6}
              y={GATE.y - 6}
              width="12"
              height="12"
              transform={`rotate(45 ${GATE.x} ${GATE.y})`}
              fill="#0e1013"
              stroke={GOLD}
              strokeWidth="1.4"
            />
            <circle cx={GATE.x} cy={GATE.y} r="1.8" fill={GOLD} />
          </motion.g>

          {/* ── Bottom annotation row ──────────────────────────────── */}
          <motion.g {...fade(1.15)}>
            <line x1="150" y1="262" x2="810" y2="262" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text
              x="480"
              y="290"
              textAnchor="middle"
              fontSize="9"
              letterSpacing="1.8"
              className="font-mono"
            >
              <tspan fill="rgba(154,160,168,0.85)">UI DISPLAYS POLICY</tspan>
              <tspan fill={GOLD}>{"  ·  "}</tspan>
              <tspan fill="rgba(154,160,168,0.85)">BACKEND RELAYS ACTIVITY</tspan>
              <tspan fill={GOLD}>{"  ·  "}</tspan>
              <tspan fill="rgba(154,160,168,0.85)">BLOCKCHAIN ENFORCES POLICY</tspan>
            </text>
          </motion.g>
        </svg>

        {/* Stage hit targets — keyboard-accessible, aligned to the cards */}
        {onStageSelect && (
          <div className="absolute inset-0 grid grid-cols-4" role="group" aria-label="Capability flow stages">
            {STAGES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Stage ${i + 1}: ${s.name}`}
                onClick={() => onStageSelect(i)}
                className="focus-ring cursor-pointer appearance-none bg-transparent"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
