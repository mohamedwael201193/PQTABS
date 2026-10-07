"use client";

import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  Clock,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldX,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKind, ActivityRecord } from "@/data/types";
import { relTime, usd } from "@/data/formatters";
import { EXPLORER_URL } from "@/data/production";
import { StatusChip } from "@/components/pqtabs/shared";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  payment: ArrowUpRight,
  capability_opened: Plus,
  capability_closed: X,
  capability_expired: Clock,
  reclaim: RotateCcw,
  policy_blocked: ShieldX,
  agent_added: Bot,
  key_rotated: KeyRound,
};

const ROW_CLASS =
  "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[.03] sm:grid-cols-[92px_minmax(0,1fr)_auto_auto] sm:gap-3";

/**
 * ActivityRow — one ledger line. Time, kind icon, the human summary,
 * the amount and the outcome chip. When `onOpen` is provided the whole
 * row is a button (keyboard reachable).
 */
export function ActivityRow({
  record,
  onOpen,
}: {
  record: ActivityRecord;
  onOpen?: (id: string) => void;
}) {
  const Icon = KIND_ICON[record.kind];
  const blocked = record.kind === "policy_blocked";
  const negative = blocked || record.status === "reverted";
  const hasAmount = record.amountUsd != null;

  const content = (
    <>
      {/* Time — its own column from sm up */}
      <span className="hidden shrink-0 font-mono text-[11px] tabular text-muted-foreground sm:block">
        {relTime(record.hoursAgo)}
      </span>

      {/* Kind icon + summary sentence */}
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", blocked ? "text-danger" : "text-muted-foreground")}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span
          title={record.summary}
          className={cn(
            "truncate text-sm",
            blocked ? "text-danger/90" : "text-foreground/90"
          )}
        >
          {record.txHash ? (
            <a
              href={`${EXPLORER_URL}/tx/${record.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              {record.summary}
            </a>
          ) : (
            record.summary
          )}
        </span>
      </span>

      {/* Amount */}
      <span
        className={cn(
          "shrink-0 text-right font-mono text-sm tabular",
          !hasAmount
            ? "text-muted-foreground/60"
            : negative
              ? "text-danger"
              : "text-foreground"
        )}
      >
        {hasAmount ? usd(record.amountUsd as number) : "—"}
      </span>

      {/* Outcome chip — its own column from sm up */}
      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <StatusChip status={record.status} />
        {onOpen && (
          <ChevronRight
            className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={2}
            aria-hidden="true"
          />
        )}
      </span>

      {/* Mobile meta line: time + chip under the summary */}
      <span className="col-span-2 flex items-center justify-between gap-2 sm:hidden">
        <span className="font-mono text-[11px] tabular text-muted-foreground">
          {relTime(record.hoursAgo)}
        </span>
        <StatusChip status={record.status} />
      </span>
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(record.id)}
        className={cn(ROW_CLASS, "focus-ring")}
      >
        {content}
      </button>
    );
  }

  return <div className={ROW_CLASS}>{content}</div>;
}
