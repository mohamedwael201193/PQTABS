"use client";

/**
 * ScrollProgress — 2px gold gradient bar pinned to the very top,
 * tracking reading progress. rAF-throttled passive scroll listener;
 * transform-only updates. Hidden entirely under reduced motion is not
 * needed (it is scroll-driven, not time-driven) but it stays subtle.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function ScrollProgress({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      el.style.transform = `scaleX(${p})`;
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[80] h-[2px]",
        "origin-left bg-gradient-to-r from-[#8a6a1a] via-gold to-[#f8ecc7]",
        className,
      )}
      ref={ref}
      style={{ transform: "scaleX(0)" }}
    />
  );
}
