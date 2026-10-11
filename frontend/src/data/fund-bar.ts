export type FundSegmentKey = "available" | "allocated" | "reclaimable";

export function fundBar(input: { inRoot: number; reach: number; reclaimable: number }) {
  const inRoot = Math.max(0, input.inRoot);
  const reach = Math.max(0, input.reach);
  const reclaimable = Math.max(0, input.reclaimable);
  const held = inRoot + reach + reclaimable;
  const share = (value: number) => (held > 0 ? (value / held) * 100 : 0);
  const reachableShare = share(reach);
  return {
    held,
    reachableShare,
    headline: `${reachableShare.toFixed(1)}% agent reachable`,
    segments: [
      { key: "available" as const, share: share(inRoot), label: "Root cash" },
      { key: "allocated" as const, share: reachableShare, label: "Reachable" },
      { key: "reclaimable" as const, share: share(reclaimable), label: "Awaiting reclaim" },
    ],
  };
}
