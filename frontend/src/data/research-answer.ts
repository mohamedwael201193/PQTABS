/** Sources for Arc claims. Each link is an Arc documentation page or the Arc explorer. */
export const ARC_SOURCES = [
  { title: "Arc deterministic finality (docs)", href: "https://docs.arc.io/arc/concepts/deterministic-finality" },
  { title: "Arc consensus layer (docs)", href: "https://docs.arc.io/arc/concepts/consensus-layer" },
  { title: "Arc gas and fees (docs)", href: "https://docs.arc.io/arc/references/gas-and-fees" },
  { title: "Arc mainnet explorer", href: "https://explorer.arc.io" },
] as const;

const STALE_MAINNET = /mainnet goes live|once the arc mainnet|when the arc mainnet goes live/i;

export type Correction = { text: string; href: string };

/** Product names that no official Arc page uses. A sentence that names one is removed unless it cites a fact. */
const UNSOURCED_CLAIM = /stablecoin services?|privacy sector|privacy features/i;
const CITED = /\[S\d+\]/;

/** Official page for each [S#] marker the research model writes. Keep in step with backend ARC_FACTS. */
const FACT_LINKS: Record<string, string> = {
  S1: "https://docs.arc.io/arc/references/rpc-endpoints",
  S2: "https://docs.arc.io/arc-chain.md",
  S3: "https://docs.arc.io/arc/concepts/deterministic-finality",
  S4: "https://docs.arc.io/arc/concepts/consensus-layer",
  S5: "https://docs.arc.io/arc/concepts/stablecoin-native-model",
  S6: "https://docs.arc.io/arc/references/contract-addresses",
  S7: "https://docs.arc.io/arc/concepts/post-quantum-security",
  S8: "https://docs.arc.io/arc/concepts/consensus-layer",
  S9: "https://docs.arc.io/arc/concepts/opt-in-privacy",
  S10: "https://docs.arc.io/arc/concepts/post-quantum-security",
  S11: "https://docs.arc.io/arc/concepts/stablecoin-native-model",
};

/** Turns each [S#] marker into a link to its official page. A marker with no known page is left as text. */
export function linkCitations(text: string): string {
  return text.replace(/\[(S\d+)\]/g, (marker, id: string) => (FACT_LINKS[id] ? `[${marker.slice(1, -1)}](${FACT_LINKS[id]})` : marker));
}

/**
 * Removes each sentence that names a product no cited Arc source covers. Line breaks and list markers are kept.
 * Returns the cleaned text and the sentences that were removed, so the reader can see what was taken out.
 */
export function removeUnsourcedSentences(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const lines = text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [line];
    const kept = line.split(/(?<=[.!?])\s+/).filter((sentence) => {
      const drop = UNSOURCED_CLAIM.test(sentence) && !CITED.test(sentence);
      if (drop) removed.push(sentence.trim());
      return !drop;
    });
    return kept.length > 0 ? [kept.join(" ")] : [];
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}

const NO_SOURCED_ANSWER = "The Arc sources available to this service do not cover this question, so no answer is given.";

export function arcFactQuestion(task: string): boolean {
  return /\barc\b/i.test(task) && /mainnet|settlement|settle/i.test(task);
}

/**
 * Corrections for claims the Arc docs contradict. Each correction states the documented fact and links it.
 * They are shown beside the model answer, which is not rewritten.
 */
export function arcCorrections(text: string): Correction[] {
  const corrections: Correction[] = [];
  if (/\bPoS\b|proof[- ]of[- ]stake|\bDAG\b|directed acyclic/i.test(text)) {
    corrections.push({
      text: "Arc's consensus today is Malachite, a Tendermint-style BFT protocol run by a permissioned Proof-of-Authority validator set, not proof-of-stake or a DAG. Circle has said a proof-of-stake launch is planned for later.",
      href: "https://docs.arc.io/arc/concepts/consensus-layer",
    });
  }
  if (/native token[^.]*stable-?coin|stable-?coin[^.]*native token/i.test(text)) {
    corrections.push({
      text: "USDC is Arc's native gas token. Gas is not paid in other stablecoins on Arc today.",
      href: "https://docs.arc.io/arc/references/gas-and-fees",
    });
  }
  if (/within seconds to a few minutes|few minutes/i.test(text)) {
    corrections.push({
      text: "Arc finality is deterministic and under one second. A committed block is irreversible.",
      href: "https://docs.arc.io/arc/concepts/deterministic-finality",
    });
  }
  return corrections;
}

/** Arc mainnet is live. A model that says otherwise is not the answer we show. */
export function presentAnswer(
  task: string,
  modelText: string,
): {
  text: string;
  sources: { title: string; href: string }[];
  replacedStale: boolean;
  corrections: Correction[];
  /** Sentences removed because no cited Arc source covers them. */
  removed: string[];
} {
  const text = modelText.trim();
  if (!text) return { text: "", sources: [], replacedStale: false, corrections: [], removed: [] };
  if (arcFactQuestion(task) && STALE_MAINNET.test(text)) {
    return {
      replacedStale: true,
      sources: [...ARC_SOURCES],
      corrections: [],
      removed: [],
      text: "Arc mainnet is already live on chain id 5042. A capability payment settles when the USDC transfer is included, and finality is that inclusion. The transfer is public on the Arc explorer. This is not a future launch.",
    };
  }
  const aboutArc = arcFactQuestion(task) || /\bArc\b/.test(text);
  if (!aboutArc) {
    return { text, sources: [], replacedStale: false, corrections: [], removed: [] };
  }
  const cleaned = removeUnsourcedSentences(text);
  return {
    text: cleaned.text ? linkCitations(cleaned.text) : NO_SOURCED_ANSWER,
    sources: [...ARC_SOURCES],
    replacedStale: false,
    corrections: arcCorrections(cleaned.text),
    removed: cleaned.removed,
  };
}

export function researchAnswer(payload: unknown): { text: string; model: string } {
  if (!payload || typeof payload !== "object") return { text: "", model: "" };
  const body = payload as { model?: unknown; choices?: unknown; error?: unknown };
  if (body.error) return { text: "", model: "" };
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!Array.isArray(body.choices) || body.choices.length === 0) return { text: "", model };
  const choice = body.choices[0];
  if (!choice || typeof choice !== "object") return { text: "", model };
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== "object") return { text: "", model };
  const content = (message as { content?: unknown }).content;
  const text = typeof content === "string" ? content.trim() : "";
  return { text, model };
}
