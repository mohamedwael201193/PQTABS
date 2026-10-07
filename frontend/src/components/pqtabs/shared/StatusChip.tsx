import type { ActivityStatus, AgentStatus, TabStatus } from "@/data/types";
import { cn } from "@/lib/utils";

type ChipStatus = ActivityStatus | TabStatus | AgentStatus;

const STATUS_STYLES: Record<ChipStatus, { dot: string; label: string }> = {
  // Activity
  authorized: { dot: "bg-teal", label: "Authorized" },
  settling: { dot: "bg-warning", label: "Settling" },
  completed: { dot: "bg-success", label: "Completed" },
  reverted: { dot: "bg-danger", label: "Reverted" },
  expired: { dot: "bg-muted-foreground", label: "Expired" },
  reclaimed: { dot: "bg-gold", label: "Reclaimed" },
  // Tabs
  active: { dot: "bg-success", label: "Active" },
  closed: { dot: "bg-muted-foreground", label: "Closed" },
  // Agents
  paused: { dot: "bg-warning", label: "Paused" },
  revoked: { dot: "bg-muted-foreground", label: "Revoked" },
};

export function StatusChip({
  status,
  className,
  pulse,
}: {
  status: ChipStatus;
  className?: string;
  pulse?: boolean;
}) {
  const s = STATUS_STYLES[status] ?? { dot: "bg-muted-foreground", label: status };
  const live = pulse && (status === "active" || status === "settling" || status === "authorized");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground",
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && (
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", s.dot)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
    </span>
  );
}
