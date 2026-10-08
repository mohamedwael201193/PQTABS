/** Newest chain position first. A missing block stays after a known one. Timestamp is not an order. */
export function compareChainActivity(
  a: { block?: string; logIndex?: string },
  b: { block?: string; logIndex?: string },
): number {
  const block = compareNewest(a.block, b.block);
  if (block !== 0) return block;
  return compareNewest(a.logIndex, b.logIndex);
}

function compareNewest(left: string | undefined, right: string | undefined): number {
  const a = position(left);
  const b = position(right);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function position(value: string | undefined): bigint | null {
  if (!value || !/^[0-9]+$/.test(value)) return null;
  return BigInt(value);
}
