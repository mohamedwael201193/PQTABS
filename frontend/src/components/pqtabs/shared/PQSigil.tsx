import { cn } from "@/lib/utils";

/**
 * The root sigil — concentric authority rings with a core. Used inside the
 * hero composition and wherever the post-quantum root appears as a glyph.
 */
export function PQSigil({
  size = 64,
  className,
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className={cn(className)}
    >
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
      <circle
        cx="50"
        cy="50"
        r="34"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeDasharray={animated ? "3 6" : undefined}
      />
      <circle cx="50" cy="50" r="21" stroke="currentColor" strokeWidth="2" />
      {/* verification ticks */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const r = (n: number) => Math.round(n * 100) / 100;
        const x1 = r(50 + Math.cos(a) * 41);
        const y1 = r(50 + Math.sin(a) * 41);
        const x2 = r(50 + Math.cos(a) * 46);
        const y2 = r(50 + Math.sin(a) * 46);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
        );
      })}
      {/* core */}
      <circle cx="50" cy="50" r="8" className="fill-gold" />
      <circle cx="50" cy="50" r="13" className="stroke-gold" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}
