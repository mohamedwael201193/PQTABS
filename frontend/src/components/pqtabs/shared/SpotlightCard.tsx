"use client";

/**
 * SpotlightCard — pointer-tracked gold spotlight on a hairline card.
 * Two layers follow the cursor: an inner wash and a 1px border highlight
 * (mask ring). Pure CSS variables; transform/opacity free, so it never
 * fights the compositor. Static (no spotlight) on touch devices.
 */
import { useRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Radius of the spotlight in px. */
  radius?: number;
  as?: "div" | "article" | "li";
}

export function SpotlightCard({
  children,
  className,
  radius = 280,
  as = "div",
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement | null>(null);

  const onMove = (e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  };

  const Tag = as;

  return (
    <Tag
      ref={ref as never}
      onMouseMove={onMove}
      className={cn("group/spot relative overflow-hidden", className)}
    >
      {/* Inner wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          background: `radial-gradient(${radius}px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(226,181,62,0.08), transparent 65%)`,
        }}
      />
      {/* Border highlight ring */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/spot:opacity-100"
        style={{
          padding: 1,
          background: `radial-gradient(${Math.round(radius * 0.85)}px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(226,181,62,0.55), transparent 60%)`,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
        }}
      />
      <span className="relative z-10 block h-full">{children}</span>
    </Tag>
  );
}
