import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

/**
 * SectionShell — landing page section wrapper. Renders the mono section
 * marker (e.g. "02 — THE PROBLEM") and a hairline, establishing the strong
 * editorial rhythm of the page.
 */
export function SectionShell({
  id,
  index,
  label,
  children,
  className,
}: {
  id?: string;
  index: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative", className)}>
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        <Reveal>
          <div className="flex items-center gap-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-gold">
              {index}
            </span>
            <span className="h-px w-10 bg-gold/40" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {label}
            </span>
          </div>
          <div className="mt-2 h-px w-full bg-white/[.06]" aria-hidden="true" />
        </Reveal>
        <div className="py-16 md:py-24">{children}</div>
      </div>
    </section>
  );
}

export function SectionHeading({
  overline,
  title,
  lead,
  align = "left",
  className,
}: {
  overline?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {overline && (
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {overline}
          </p>
        </Reveal>
      )}
      <Reveal delay={0.08}>
        <h2 className="font-display text-3xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-4xl md:text-5xl">
          {title}
        </h2>
      </Reveal>
      {lead && (
        <Reveal delay={0.16}>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            {lead}
          </p>
        </Reveal>
      )}
    </div>
  );
}
