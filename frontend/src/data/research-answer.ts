/** Sources for Arc claims. Each link is an Arc documentation page or the Arc explorer. */
export const ARC_SOURCES = [
  { title: "Arc deterministic finality (docs)", href: "https://docs.arc.io/arc/concepts/deterministic-finality" },
  { title: "Arc consensus layer (docs)", href: "https://docs.arc.io/arc/concepts/consensus-layer" },
  { title: "Arc gas and fees (docs)", href: "https://docs.arc.io/arc/references/gas-and-fees" },
  { title: "Arc mainnet explorer", href: "https://explorer.arc.io" },
] as const;

const STALE_MAINNET = /mainnet goes live|once the arc mainnet|when the arc mainnet goes live/i;

export type Correction = { text: string; href: string };

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
} {
  const text = modelText.trim();
  if (!text) return { text: "", sources: [], replacedStale: false, corrections: [] };
  if (arcFactQuestion(task) && STALE_MAINNET.test(text)) {
    return {
      replacedStale: true,
      sources: [...ARC_SOURCES],
      corrections: [],
      text: "Arc mainnet is already live on chain id 5042. A capability payment settles when the USDC transfer is included, and finality is that inclusion. The transfer is public on the Arc explorer. This is not a future launch.",
    };
  }
  const aboutArc = arcFactQuestion(task) || /\bArc\b/.test(text);
  return {
    text,
    sources: aboutArc ? [...ARC_SOURCES] : [],
    replacedStale: false,
    corrections: aboutArc ? arcCorrections(text) : [],
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
