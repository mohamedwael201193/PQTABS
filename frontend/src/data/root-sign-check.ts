/** Stop a root signature when the chain no longer matches the action that was prepared. */
export function rootSignatureBlock(input: {
  unlockedVk: string | null;
  chainVk: string;
  chainNonce: string;
  preparedNonce: string;
  now: bigint;
  expiry?: string;
}): string | null {
  const chainVk = input.chainVk.trim();
  const unlocked = (input.unlockedVk ?? "").trim();
  if (!chainVk) return "The root verifying key could not be read. Nothing was signed.";
  if (!unlocked || unlocked.toLowerCase() !== chainVk.toLowerCase()) {
    return "This backup belongs to an older security key. Nothing was signed.";
  }
  if (!input.chainNonce || input.chainNonce !== input.preparedNonce) {
    return "The root nonce changed. Nothing was signed.";
  }
  if (input.now <= BigInt(0)) return "Could not read Arc's clock. Nothing was signed.";
  if (input.expiry !== undefined) {
    if (!/^[0-9]+$/.test(input.expiry)) return "The capability expiry could not be read. Nothing was signed.";
    if (input.now >= BigInt(input.expiry)) return "The capability expires too soon. Nothing was signed.";
  }
  return null;
}
