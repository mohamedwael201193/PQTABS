export function spendKind(to: string | undefined, root: string): "reclaim" | "payment" {
  return to && root && to.toLowerCase() === root.toLowerCase() ? "reclaim" : "payment";
}
