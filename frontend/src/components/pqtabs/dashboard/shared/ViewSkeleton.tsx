"use client";

import { Skeleton } from "@/components/ui/skeleton";

export type SkeletonVariant =
  | "overview"
  | "tabs"
  | "agents"
  | "activity"
  | "security";

/**
 * ViewSkeleton — layout-stable loading placeholders. Each variant mirrors
 * the paddings and grids of the real view so the shell never shifts when
 * data arrives.
 */
export function ViewSkeleton({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    case "overview":
      return <OverviewSkeleton />;
    case "tabs":
      return <TabsSkeleton />;
    case "agents":
      return <AgentsSkeleton />;
    case "activity":
      return <ActivitySkeleton />;
    case "security":
      return <SecuritySkeleton />;
  }
}

function HeaderSkeleton() {
  return (
    <div className="space-y-2.5">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[.07] bg-[#0e1013] p-5">
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="mt-4 h-7 w-24" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

function TabCardSkeleton() {
  return (
    <div className="rounded-xl border border-white/[.07] bg-[#0e1013] p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-2.5 w-14" />
      <Skeleton className="mt-2 h-8 w-28" />
      <Skeleton className="mt-4 h-[5px] w-full rounded-full" />
      <Skeleton className="mt-2 h-2.5 w-40" />
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-1.5 h-3.5 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-8 w-full rounded-md" />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      {/* Security strip */}
      <Skeleton className="h-[168px] rounded-xl lg:h-[92px]" />
      {/* Exposure card */}
      <div className="rounded-xl border border-white/[.07] bg-[#0e1013] p-5 md:p-6">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-2 h-2.5 w-52" />
        <Skeleton className="mt-5 h-14 w-full rounded-xl md:h-16" />
        <div className="mt-3 flex gap-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      {/* Capability grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <TabCardSkeleton key={i} />
        ))}
      </div>
      {/* Recent activity */}
      <div className="rounded-xl border border-white/[.07] bg-[#0e1013] p-4 md:p-5">
        <Skeleton className="h-3 w-28" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

function TabsSkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <TabCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function AgentsSkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function SecuritySkeleton() {
  return (
    <div className="space-y-8">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
