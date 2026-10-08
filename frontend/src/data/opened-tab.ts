export function tabForReceipt<T extends { txHash?: string }>(tabs: readonly T[], hash: string): T | undefined {
  const wanted = hash.toLowerCase();
  return tabs.find((item) => item.txHash?.toLowerCase() === wanted);
}
