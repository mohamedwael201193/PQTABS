import { USDC } from "../constants.js";

/** EIP-7708 native USDC emitter. 18-decimal Transfer. Not an ERC-20 balance event. */
export const NATIVE_USDC_EMITTER = "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE";

/**
 * One ERC-20 transfer also emits a native Transfer from the system address.
 * Only the 6-decimal log from the ERC-20 contract is a spend amount.
 * Gas emits no Transfer, so this returns null for every other emitter.
 */
export function erc20SpendRaw(emitter: string, value: bigint): string | null {
  if (emitter.toLowerCase() !== USDC.toLowerCase()) return null;
  return value.toString();
}
