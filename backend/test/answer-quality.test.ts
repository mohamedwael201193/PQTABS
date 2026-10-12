import assert from "node:assert/strict";
import { test } from "node:test";
import { ARC_FACTS, keepSentence, NO_SOURCED_ANSWER, sanitizeAnswer } from "../src/index/answer-quality.js";
import { askGroq, RESEARCH_MAX_TOKENS, RESEARCH_SYSTEM_PROMPT } from "../src/index/research.js";

test("a sentence cited to a live fact is kept", () => {
  const text = "Finality is deterministic and under one second [S3].";
  assert.equal(sanitizeAnswer(text), text);
});

test("an uncited sentence about Arc is removed, and the cited one stays", () => {
  const text = "Arc settles payments in seconds. Finality is deterministic and under one second [S3].";
  assert.equal(sanitizeAnswer(text), "Finality is deterministic and under one second [S3].");
});

test("a sentence that names Stablecoin Services is removed even with a citation", () => {
  const text = "Stablecoin Services will expand payment options [S5]. Gas is paid in USDC [S5].";
  assert.equal(sanitizeAnswer(text), "Gas is paid in USDC [S5].");
});

test("a dated or future launch claim is removed", () => {
  assert.equal(keepSentence("Proof-of-stake arrives in 2027 [S8]."), false);
  assert.equal(keepSentence("Arc will launch the privacy sector next quarter [S9]."), false);
  assert.equal(keepSentence("Q3 mainnet launch [S1]."), false);
});

test("a citation to an unknown fact id is removed", () => {
  assert.equal(keepSentence("Arc has a new validator set [S99]."), false);
});

test("a planned fact may be stated as not live", () => {
  const text = "Arc Privacy Sector is on the roadmap and is not yet available [S9].";
  assert.equal(sanitizeAnswer(text), text);
});

test("a numbered list keeps its markers and drops only the unsupported item", () => {
  const text = [
    "1. Finality is deterministic [S3].",
    "2. Arc will launch proof-of-stake in 2027 [S8].",
    "3. USDC is the gas token [S5].",
  ].join("\n");
  assert.equal(sanitizeAnswer(text), "1. Finality is deterministic [S3].\n3. USDC is the gas token [S5].");
});

test("a table row that names an unsourced product is removed, and the other rows stay", () => {
  const text = [
    "| Feature | Status |",
    "|---|---|",
    "| Stablecoin Services | planned |",
    "| Finality | live [S3] |",
  ].join("\n");
  assert.equal(sanitizeAnswer(text), "| Feature | Status |\n|---|---|\n| Finality | live [S3] |");
});

test("an answer with nothing sourced says the sources do not cover it, and never invents one", () => {
  assert.equal(sanitizeAnswer("Arc will launch in 2027 with a new fee model."), NO_SOURCED_ANSWER);
});

test("an empty model reply stays empty", () => {
  assert.equal(sanitizeAnswer("   "), "");
});

test("the system prompt lists every fact with its id and marks planned facts as not live", () => {
  for (const fact of ARC_FACTS) assert.equal(RESEARCH_SYSTEM_PROMPT.includes(`[${fact.id}]`), true, fact.id);
  assert.equal(RESEARCH_SYSTEM_PROMPT.includes("(NOT live) [S9]") || RESEARCH_SYSTEM_PROMPT.includes("(NOT live) Arc Privacy"), true);
  assert.equal(RESEARCH_SYSTEM_PROMPT.includes("Never state a launch date"), true);
});

test("the research max token budget is unchanged, because the quote body hash depends on it", () => {
  assert.equal(RESEARCH_MAX_TOKENS, 400);
});

test("askGroq sends the cited prompt and returns the sanitized answer", async () => {
  const sent: { system: string; max_tokens: number } = { system: "", max_tokens: 0 };
  const fakeFetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[]; max_tokens: number };
    sent.system = body.messages[0]?.content ?? "";
    sent.max_tokens = body.max_tokens;
    return new Response(
      JSON.stringify({
        model: "openai/gpt-oss-120b",
        choices: [{ message: { role: "assistant", content: "Gas is paid in USDC [S5]. Stablecoin Services will expand options." } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  const result = await askGroq("Summarize Arc settlement.", { GROQ_API_KEY: "test-key" } as NodeJS.ProcessEnv, fakeFetch);
  assert.equal(result.text, "Gas is paid in USDC [S5].");
  assert.equal(result.model, "openai/gpt-oss-120b");
  assert.equal(sent.system, RESEARCH_SYSTEM_PROMPT);
  assert.equal(sent.max_tokens, 400);
});

test("askGroq with no key returns no answer, so the paid task stays pending", async () => {
  const result = await askGroq("anything", {} as NodeJS.ProcessEnv, (async () => new Response("{}")) as typeof fetch);
  assert.deepEqual(result, { text: "", model: "" });
});
