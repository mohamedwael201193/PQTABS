export type BackupVerdict = "match" | "missing" | "mismatch";

/** The unlocked backup must be the treasury key. A missing chain key is not a match. */
export function backupMatchesRoot(unlockedVk: string | null | undefined, rootVk: string | null | undefined): BackupVerdict {
  const local = (unlockedVk ?? "").trim();
  const chain = (rootVk ?? "").trim();
  if (!local || !chain) return "missing";
  return local.toLowerCase() === chain.toLowerCase() ? "match" : "mismatch";
}

export function backupRefusal(verdict: Exclude<BackupVerdict, "match">): string {
  if (verdict === "mismatch") return "This backup is not the verifying key for this treasury. Nothing was signed.";
  return "The treasury verifying key could not be read. Nothing was signed.";
}
