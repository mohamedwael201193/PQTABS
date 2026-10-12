export const RESEARCH_URL = "https://text.pollinations.ai/openai";

export const ARC_SOURCES = [
  { title: "Arc mainnet explorer", href: "https://explorer.arc.io" },
  { title: "Arc SLH-DSA precompile", href: "https://github.com/circlefin/arc-node" },
] as const;

const STALE_MAINNET = /mainnet goes live|once the arc mainnet|when the arc mainnet goes live/i;

export function arcFactQuestion(task: string): boolean {
  return /\barc\b/i.test(task) && /mainnet|settlement|settle/i.test(task);
}

/** Arc mainnet is live. A model that says otherwise is not the answer we show. */
export function presentAnswer(
  task: string,
  modelText: string,
): { text: string; sources: { title: string; href: string }[]; replacedStale: boolean } {
  const text = modelText.trim();
  if (!text) return { text: "", sources: [], replacedStale: false };
  if (arcFactQuestion(task) && STALE_MAINNET.test(text)) {
    return {
      replacedStale: true,
      sources: [...ARC_SOURCES],
      text: "Arc mainnet is already live on chain id 5042. A capability payment settles when the USDC transfer is included, and finality is that inclusion. The transfer is public on the Arc explorer. This is not a future launch.",
    };
  }
  if (arcFactQuestion(task)) return { text, sources: [...ARC_SOURCES], replacedStale: false };
  return { text, sources: [], replacedStale: false };
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
