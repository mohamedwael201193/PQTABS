"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * CopyBlock: a code block with a copy button. The text is always visible, so the page still works
 * without clipboard access. Copy only works in a secure context, and the button says so when it fails.
 */
export function CopyBlock({
  code,
  label,
  className,
  wrap = false,
}: {
  code: string;
  label: string;
  className?: string;
  /** Wrap long single-line commands instead of scrolling horizontally. */
  wrap?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1800);
  }

  return (
    <div className={cn("group relative overflow-hidden rounded-xl border border-white/[.08] bg-[#0b0c0f]", className)}>
      <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {state === "copied" ? <Check className="size-3.5 text-gold" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
        </button>
      </div>
      <pre className={cn("p-4 font-mono text-[12.5px] leading-relaxed text-foreground/90", wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto [scrollbar-color:rgba(255,255,255,0.18)_transparent]")}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
