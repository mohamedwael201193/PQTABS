export const RESEARCH_URL = "https://text.pollinations.ai/openai";

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
