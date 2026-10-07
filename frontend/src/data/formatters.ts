/** Shared value formatters — single source of truth for number and time display. */

export function usd(n: number, opts?: { decimals?: number }): string {
  const decimals = opts?.decimals ?? (Math.abs(n) > 0 && Math.abs(n) < 1 ? 6 : 2);
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return `${text} USDC`;
}

export function usdCompact(n: number): string {
  return usd(n);
}

/** "2h ago" / "3d ago" style labels from relative hour offsets. */
export function relTime(hoursAgo: number): string {
  if (hoursAgo < 1) {
    const m = Math.max(1, Math.round(hoursAgo * 60));
    return `${m}m ago`;
  }
  if (hoursAgo < 24) return `${roundHours(hoursAgo)}h ago`;
  const d = hoursAgo / 24;
  return `${d >= 10 ? Math.round(d) : Math.floor(d)}d ago`;
}

/** "in 18h" / "in 3d" style labels for expirations. */
export function relFuture(hours: number): string {
  if (hours <= 0) return "expired";
  if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `in ${roundHours(hours)}h`;
  const d = hours / 24;
  return `in ${d >= 10 ? Math.round(d) : Math.floor(d)}d`;
}

function roundHours(h: number): number {
  const r = Math.round(h);
  return r === 0 ? 1 : r;
}

export function pct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function shortAddr(address: string): string {
  // Addresses are stored pre-shortened ("agt_0x7C3a…F18b"); pass through.
  return address;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
