import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/[.12] bg-white/[.05] px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Hairline({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      className={cn(vertical ? "w-px self-stretch" : "h-px w-full", "bg-white/[.06]", className)}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[.09] bg-white/[.015] px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/[.08] bg-white/[.03] text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="font-display text-base font-medium text-foreground">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
