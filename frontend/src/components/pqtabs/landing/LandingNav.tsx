"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/pqtabs/shared";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * LandingNav — fixed overhead. Transparent over the hero; once the page
 * scrolls, it settles into a blurred bar with a hairline. On mobile the
 * link set collapses into a right-side sheet.
 */

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Security", href: "#security" },
  { label: "How it Works", href: "#how" },
  { label: "Technology", href: "#technology" },
] as const;

export default function LandingNav({ onLaunchApp }: { onLaunchApp: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background,border-color] duration-300",
        scrolled
          ? "border-b border-white/[.06] bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
        {/* Wordmark */}
        <a href="#top" className="focus-ring rounded-lg" aria-label="PQTABS — back to top">
          <Logo />
        </a>

        {/* Anchor set — each link carries a gold hairline that draws in
            from the left on hover */}
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="focus-ring group relative rounded-sm font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
              <span
                className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-gold transition-transform duration-200 group-hover:scale-x-100"
                aria-hidden="true"
              />
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onLaunchApp}
            className="h-9 rounded-lg bg-gold px-4 text-sm font-medium text-[#171204] hover:bg-[#eec95e] hover:shadow-[0_8px_30px_rgba(226,181,62,0.25)]"
          >
            Connect wallet
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[.08] bg-white/[.03] text-foreground md:hidden"
              >
                <Menu className="size-4" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px] border-l border-white/[.08] bg-background p-0"
            >
              <SheetHeader className="border-b border-white/[.06] p-5">
                <SheetTitle className="font-display text-base font-semibold tracking-[0.08em] text-foreground">
                  PQTABS
                </SheetTitle>
                <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Post-quantum spending boundaries
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col px-5 py-2">
                {LINKS.map((l, i) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="focus-ring flex items-baseline gap-4 border-b border-white/[.05] py-4 last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-gold tabular">
                      {`0${i + 1}`}
                    </span>
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </span>
                  </a>
                ))}
              </nav>
              <div className="mt-auto p-5">
                <Button
                  onClick={() => {
                    setOpen(false);
                    onLaunchApp();
                  }}
                  className="h-11 w-full rounded-lg bg-gold text-sm font-medium text-[#171204] hover:bg-[#eec95e]"
                >
                  Connect wallet
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
