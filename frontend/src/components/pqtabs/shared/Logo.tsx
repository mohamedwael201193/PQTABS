import { cn } from "@/lib/utils";

/**
 * PQTABS mark — the root chamber with a bounded tab extending through it.
 * Original glyph: the rounded chamber is the protected treasury; the gold
 * slot is a spending capability reaching past the boundary, but only as far
 * as its cap allows.
 */
export function PQMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("h-6 w-6", className)}
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7.5"
        stroke="currentColor"
        strokeWidth="2"
        className="text-foreground/85"
      />
      <rect x="8" y="9" width="11" height="3.4" rx="1.7" fill="currentColor" opacity="0.32" />
      <rect x="8" y="14.3" width="21.5" height="3.4" rx="1.7" className="fill-gold" />
      <rect x="8" y="19.6" width="11" height="3.4" rx="1.7" fill="currentColor" opacity="0.32" />
    </svg>
  );
}

export function Logo({
  withWordmark = true,
  className,
}: {
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PQMark className="h-6 w-6 shrink-0" />
      {withWordmark && (
        <span className="font-display text-[17px] font-semibold tracking-[0.08em] text-foreground">
          PQTABS
        </span>
      )}
    </span>
  );
}
