import { type Hex, pad, toHex } from "viem";
import { TRANSFER_TOPIC, USDC_ADDRESS } from "./constants.js";
import type { ArcReceipt } from "./rpc.js";

export type SettlementCheck =
  | { ok: true; blockNumber: bigint }
  | { ok: false; reason: "reverted" | "no_matching_transfer" | "multiple_matching_transfers" };

/**
 * A payment settles only when the receipt succeeded and exactly one ERC-20 USDC Transfer log
 * (6 decimals, address USDC) moves `value` from the capability to the payee.
 * The 18-decimal native system log emitted at 0xffff...fffe does not count.
 * This mirrors backend/src/index/research.ts `oneUsdcTransfer`.
 */
export function checkUsdcSettlement(
  receipt: ArcReceipt,
  expected: { from: string; to: string; value: bigint },
): SettlementCheck {
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  const fromTopic = addressTopic(expected.from);
  const toTopic = addressTopic(expected.to);
  const matches = receipt.logs.filter((log) => {
    if (log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return false;
    const [topic0, topic1, topic2] = log.topics;
    if (topic0?.toLowerCase() !== TRANSFER_TOPIC) return false;
    if (topic1?.toLowerCase() !== fromTopic || topic2?.toLowerCase() !== toTopic) return false;
    try {
      return BigInt(log.data) === expected.value;
    } catch {
      return false;
    }
  });
  if (matches.length === 0) return { ok: false, reason: "no_matching_transfer" };
  if (matches.length > 1) return { ok: false, reason: "multiple_matching_transfers" };
  return { ok: true, blockNumber: receipt.blockNumber };
}

function addressTopic(address: string): Hex {
  return pad(toHex(BigInt(address)), { size: 32 }).toLowerCase() as Hex;
}
