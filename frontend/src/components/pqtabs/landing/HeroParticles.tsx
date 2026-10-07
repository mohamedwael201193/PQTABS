"use client";

import type { CSSProperties } from "react";

/**
 * HeroParticles — a gold dot-matrix constellation behind the architecture.
 *
 * Three concentric rings of gold dots (62 total) drift in opposing very-slow
 * rotations while each dot twinkles on its own deterministic clock. Every
 * position is generated from a fixed-seed PRNG at module scope, so the
 * server and the client render a byte-identical SVG. A radial mask dims the
 * core (where the architecture drawing lives) and dissolves the outer edge,
 * so the field reads as atmosphere, not decoration.
 */

/** mulberry32 — tiny deterministic PRNG. Fixed seed ⇒ SSR/client parity. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic rounding — keeps SSR and client SVG identical. */
const r2 = (n: number) => Math.round(n * 100) / 100;

const VIEW = 640;
const CENTER = VIEW / 2;

interface ParticleDot {
  cx: number;
  cy: number;
  /** Dot radius in px (1.5–3px diameter). */
  r: number;
  /** Resting opacity (also the reduced-motion state). */
  dim: number;
  /** Twinkle peak opacity. */
  bright: number;
  twinkleDuration: number;
  twinkleDelay: number;
}

interface ParticleRing {
  dots: ParticleDot[];
  /** Rotation period in seconds (60–90s). */
  spinDuration: number;
  reverse: boolean;
}

const RING_SPECS = [
  { radius: 118, count: 15, spin: 74, reverse: false },
  { radius: 186, count: 21, spin: 88, reverse: true },
  { radius: 262, count: 26, spin: 66, reverse: false },
] as const;

function buildRings(): ParticleRing[] {
  const rand = mulberry32(0x50512b); // fixed seed — do not change casually
  return RING_SPECS.map((spec) => {
    const dots: ParticleDot[] = [];
    const offset = rand() * Math.PI * 2;
    for (let i = 0; i < spec.count; i++) {
      const angle =
        offset + (i / spec.count) * Math.PI * 2 + (rand() - 0.5) * 0.16;
      const radius = spec.radius + (rand() - 0.5) * 26;
      const base = 0.24 + rand() * 0.5;
      dots.push({
        cx: r2(CENTER + Math.cos(angle) * radius),
        cy: r2(CENTER + Math.sin(angle) * radius),
        r: r2(0.75 + rand() * 0.75),
        dim: r2(base * 0.35),
        bright: r2(base),
        twinkleDuration: r2(3 + rand() * 4),
        twinkleDelay: r2(rand() * 4),
      });
    }
    return { dots, spinDuration: spec.spin, reverse: spec.reverse };
  });
}

const RINGS = buildRings();

export default function HeroParticles({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        maskImage:
          "radial-gradient(circle, rgba(0,0,0,0.4) 0%, black 30%, black 72%, transparent 100%)",
        WebkitMaskImage:
          "radial-gradient(circle, rgba(0,0,0,0.4) 0%, black 30%, black 72%, transparent 100%)",
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-full w-full"
        fill="none"
      >
        {RINGS.map((ring, ri) => (
          <g
            key={ri}
            className={
              ring.reverse ? "animate-spin-slow-reverse" : "animate-spin-slow"
            }
            style={
              {
                ["--spin-duration" as string]: `${ring.spinDuration}s`,
                transformBox: "view-box",
                transformOrigin: "center",
              } as CSSProperties
            }
          >
            {ring.dots.map((d, di) => (
              <circle
                key={di}
                cx={d.cx}
                cy={d.cy}
                r={d.r}
                fill="#e2b53e"
                opacity={d.dim}
                className="animate-twinkle"
                style={
                  {
                    ["--twinkle-duration" as string]: `${d.twinkleDuration}s`,
                    ["--twinkle-delay" as string]: `${d.twinkleDelay}s`,
                    ["--twinkle-min" as string]: `${d.dim}`,
                    ["--twinkle-max" as string]: `${d.bright}`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
