/**
 * Official Arc facts the research model may cite. Each id is a marker the model writes as [S1] etc.
 * Status is what the cited page says on the date it was checked (2026-10-12). "planned" and
 * "not_supported" facts may be stated only as not live. Nothing here carries a date.
 */
export const ARC_FACTS = [
  { id: "S1", status: "live", url: "https://docs.arc.io/arc/references/rpc-endpoints", text: "Arc mainnet chain ID is 5042." },
  { id: "S2", status: "live", url: "https://docs.arc.io/arc-chain.md", text: "Arc is an EVM-compatible Layer-1 blockchain." },
  { id: "S3", status: "live", url: "https://docs.arc.io/arc/concepts/deterministic-finality", text: "Finality is deterministic and under one second. A committed block is irreversible, and there is no reorg handling." },
  { id: "S4", status: "live", url: "https://docs.arc.io/arc/concepts/consensus-layer", text: "Consensus is Malachite, a Tendermint-based BFT protocol, run by a permissioned Proof-of-Authority validator set." },
  { id: "S5", status: "live", url: "https://docs.arc.io/arc/concepts/stablecoin-native-model", text: "USDC is the native gas token. Gas fees are paid in USDC." },
  { id: "S6", status: "live", url: "https://docs.arc.io/arc/references/contract-addresses", text: "The USDC ERC-20 interface is 0x3600000000000000000000000000000000000000 and uses 6 decimals. The native balance uses 18 decimals." },
  { id: "S7", status: "live", url: "https://docs.arc.io/arc/concepts/post-quantum-security", text: "SLH-DSA-SHA2-128s signature verification is live on Arc mainnet." },
  { id: "S8", status: "planned", url: "https://docs.arc.io/arc/concepts/consensus-layer", text: "A move from Proof-of-Authority to permissioned proof-of-stake is a potential future transition, not live." },
  { id: "S9", status: "planned", url: "https://docs.arc.io/arc/concepts/opt-in-privacy", text: "Arc Privacy Sector is on the roadmap and is not yet available." },
  { id: "S10", status: "planned", url: "https://docs.arc.io/arc/concepts/post-quantum-security", text: "Native post-quantum wallet transaction signing is a future milestone, not live." },
  { id: "S11", status: "not_supported", url: "https://docs.arc.io/arc/concepts/stablecoin-native-model", text: "Gas paid in other stablecoins through paymasters is not supported at launch." },
] as const;

export type FactId = (typeof ARC_FACTS)[number]["id"];

const KNOWN_IDS = new Set<string>(ARC_FACTS.map((fact) => fact.id));

/** A date or a month in the answer. The facts carry no dates, so a date in an answer is unsupported. */
const DATE = /\b(19|20)\d{2}\b|\bQ[1-4]\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
/** Launch or timing language. A future launch is never stated as fact. */
const FUTURE = /\b(will (launch|go live|be live|ship|release|arrive)|coming soon|upcoming|expected to (launch|go live)|next (year|quarter|month)|by the end of)\b/i;
/** Product names that no official Arc page uses. */
const UNSOURCED_NAME = /stablecoin services?/i;
/** Topics that need a citation before a sentence may say them. */
const ARC_TOPIC = /\b(arc|usdc|finality|validator|validators|gas|fee|fees|consensus|privacy|post-quantum|quantum|mainnet|testnet|chain|settlement|malachite|reorg)\b/i;
const CITATION = /\[(S\d+)\]/g;

function citations(sentence: string): string[] {
  return [...sentence.matchAll(CITATION)].map((match) => match[1] ?? "");
}

/** A sentence stays only if it has no date or future-launch claim, no unsourced product name, and every citation is a known fact. */
export function keepSentence(sentence: string): boolean {
  if (DATE.test(sentence) || FUTURE.test(sentence) || UNSOURCED_NAME.test(sentence)) return false;
  const cited = citations(sentence);
  if (cited.some((id) => !KNOWN_IDS.has(id))) return false;
  if (cited.length === 0 && ARC_TOPIC.test(sentence)) return false;
  return true;
}

/**
 * Returns the cleaned line, "" for a line that was already blank, or null when every part of it was removed.
 * Table rows and headings are kept whole unless they carry an unsupported claim. Other lines are checked sentence by sentence.
 */
function cleanLine(line: string): string | null {
  const marker = /^(\s*(?:[-*]|\d+\.)\s+)/.exec(line)?.[1] ?? "";
  const body = line.slice(marker.length).trim();
  if (!body) return "";
  if (/^\|/.test(body) || /^#{1,6}\s/.test(body)) return keepSentence(body) ? line : null;
  const kept = body.split(/(?<=[.!?])\s+/).filter((sentence) => keepSentence(sentence));
  return kept.length > 0 ? `${marker}${kept.join(" ")}` : null;
}

export const NO_SOURCED_ANSWER = "The Arc sources available to this service do not cover this question, so no answer is given.";

/**
 * Removes every sentence the sources do not support. The text is kept otherwise.
 * If nothing is left, the answer says that the sources do not cover the question. It never invents an answer.
 */
export function sanitizeAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const kept: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const cleaned = cleanLine(line);
    if (cleaned === null) continue;
    // Keep at most one blank line between blocks, and never start with one.
    if (cleaned === "" && (kept.length === 0 || kept[kept.length - 1] === "")) continue;
    kept.push(cleaned);
  }
  const result = kept.join("\n").trim();
  if (!result || kept.every((line) => line === "")) return NO_SOURCED_ANSWER;
  return result;
}
