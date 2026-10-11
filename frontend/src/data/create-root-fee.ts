/** Arc's observed minimum. A lower eth_gasPrice understates what the wallet submits. */
export const ARC_GAS_PRICE_FLOOR = 20_000_000_000n;

/**
 * Worst fee the wallet may ask for. The displayed quote multiplies by two because
 * a wallet can raise the price after this page reads eth_gasPrice.
 */
export function quotedCreateRootFee(gas: bigint, gasPrice: bigint): bigint {
  if (gas <= 0n) return 0n;
  const price = gasPrice > ARC_GAS_PRICE_FLOOR ? gasPrice : ARC_GAS_PRICE_FLOOR;
  return gas * price * 2n;
}

/** EIP-7702 designator: 0xef0100 followed by the delegated account. */
export function delegatedAccount(code: string): `0x${string}` | null {
  const normalized = code.toLowerCase();
  if (!normalized.startsWith("0xef0100") || normalized.length < 48) return null;
  return `0x${normalized.slice(8, 48)}`;
}

export function createRootAccountRefusal(code: string): string | null {
  if (!delegatedAccount(code)) return null;
  return "This wallet delegates to another contract, which forwards incoming Arc USDC away. It cannot hold the network fee. Nothing was broadcast.";
}

export function createRootFeeRefusal(balance: bigint, fee: bigint): string | null {
  if (fee <= 0n) return "The network fee could not be priced. Nothing was broadcast.";
  if (balance >= fee) return null;
  return "This wallet does not have enough Arc USDC for the network fee. A balance on another network cannot pay it. Nothing was broadcast.";
}

export function formatNativeUsdc(value: bigint): string {
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
