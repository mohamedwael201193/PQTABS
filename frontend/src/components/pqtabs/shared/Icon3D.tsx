"use client";

/**
 * Icon3D — premium gold 3D render (no background) from /icons3d.
 * Renders through next/image so assets stay optimized; optional slow
 * levitation for a weightless, expensive feel.
 */
import Image from "next/image";
import { cn } from "@/lib/utils";

export type Icon3DName =
  | "key"
  | "card"
  | "robot"
  | "coin"
  | "lock"
  | "vault"
  | "hourglass"
  | "hex"
  | "shield"
  | "check"
  | "gauge"
  | "quantum";

export const ICON3D_NAMES: Icon3DName[] = [
  "key",
  "card",
  "robot",
  "coin",
  "lock",
  "vault",
  "hourglass",
  "hex",
  "shield",
  "check",
  "gauge",
  "quantum",
];

/** Deterministic pseudo-random 0..1 from the icon name (hydration-safe). */
function seed01(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const ALT_TEXT: Record<Icon3DName, string> = {
  key: "Golden 3D key — the post-quantum root credential",
  card: "Golden 3D card — a bounded spending capability",
  robot: "Golden 3D robot head — an autonomous agent",
  coin: "Golden 3D coin stack — USDC spending",
  lock: "Golden 3D padlock — fixed recipient policy",
  vault: "Golden 3D vault door — the treasury",
  hourglass: "Golden 3D hourglass — capability expiry",
  hex: "Golden 3D hexagonal prism — the Arc chain",
  shield: "Golden 3D shield — the security boundary",
  check: "Golden 3D checkmark seal — policy verification",
  gauge: "Golden 3D gauge — spending limits",
  quantum: "Golden 3D atom — post-quantum cryptography",
};

export interface Icon3DProps {
  name: Icon3DName;
  /** Rendered square size in px. */
  size?: number;
  className?: string;
  /** Soft gold drop shadow. */
  glow?: boolean;
  /** Slow levitation animation (deterministic delay per name). */
  float?: boolean;
  /** Treat as decorative for screen readers. */
  decorative?: boolean;
  /** Load with priority (above-the-fold hero usage only). */
  priority?: boolean;
}

export function Icon3D({
  name,
  size = 64,
  className,
  glow = true,
  float = false,
  decorative = false,
  priority = false,
}: Icon3DProps) {
  const s = seed01(name);
  return (
    <span
      className={cn(
        "relative inline-block select-none align-middle",
        float && "animate-float",
        className,
      )}
      style={
        float
          ? ({
              ["--float-delay" as string]: `-${(s * 4).toFixed(2)}s`,
              ["--float-duration" as string]: `${(5.5 + s * 2.5).toFixed(2)}s`,
              ["--float-amt" as string]: `-${(7 + s * 5).toFixed(0)}px`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <Image
        src={`/icons3d/${name}.webp`}
        alt={decorative ? "" : ALT_TEXT[name]}
        aria-hidden={decorative || undefined}
        width={size}
        height={size}
        priority={priority}
        draggable={false}
        className={cn("h-auto w-auto", glow && "glow-gold")}
      />
    </span>
  );
}
