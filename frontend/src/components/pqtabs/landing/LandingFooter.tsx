"use client";

import type { CSSProperties } from "react";
import { Logo } from "@/components/pqtabs/shared";

/**
 * LandingFooter — the editorial end of the page.
 * Product anchors on the left, the composed stack (named, not linked), and
 * protocol notes as mono lines. Tight on mobile, composed on desktop.
 */

const PRODUCT_LINKS = [
  { label: "Overview", href: "#top" },
  { label: "How it works", href: "#how" },
  { label: "Security model", href: "#security" },
  { label: "Technology", href: "#technology" },
];

const STACK = ["Arc", "Barkeep", "USDC", "SLH-DSA"];

const PROTOCOL_NOTES = [
  "Policy enforced onchain",
  "Root never signs payments",
  "Tabs expire by default",
];

export default function LandingFooter() {
  return (
    <footer className="mt-8">
      {/* Top edge — hairline with a traveling gold pulse (~7s) */}
      <div
        aria-hidden="true"
        className="line-shimmer h-px w-full bg-white/[.06]"
        style={{ ["--sweep-duration" as string]: "7s" } as CSSProperties}
      />
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        {/* Brand row */}
        <div className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
          <Logo />
          <p className="text-sm text-muted-foreground">
            Post-quantum spending boundaries for autonomous agents.
          </p>
        </div>

        {/* Columns */}
        <div className="grid grid-cols-1 gap-10 border-t border-white/[.06] py-10 sm:grid-cols-3">
          <nav aria-label="Product">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Product
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Stack
            </h3>
            <ul className="mt-4 space-y-2.5">
              {STACK.map((item) => (
                <li key={item} className="font-mono text-[13px] text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-[10px] text-muted-foreground/60">
              the stack PQTABS composes
            </p>
          </div>

          <div>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Protocol notes
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PROTOCOL_NOTES.map((note) => (
                <li key={note} className="font-mono text-[12px] text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div className="flex flex-col gap-3 border-t border-white/[.06] py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            © 2026 PQTABS
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Post-quantum authorization · Arc · USDC
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Receipts come from Arc
          </p>
        </div>
      </div>
    </footer>
  );
}
