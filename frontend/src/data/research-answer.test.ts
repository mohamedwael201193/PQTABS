import assert from "node:assert/strict";
import test from "node:test";
import { presentAnswer, researchAnswer } from "./research-answer.ts";

test("a model response keeps the answer and the model name", () => {
  const parsed = researchAnswer({
    model: "gpt-oss-20b",
    choices: [{ message: { role: "assistant", content: "Arc settles the payment in the same block." } }],
  });
  assert.equal(parsed.model, "gpt-oss-20b");
  assert.equal(parsed.text, "Arc settles the payment in the same block.");
});

test("a stale mainnet launch sentence is not the answer", () => {
  const shown = presentAnswer(
    "Summarize what Arc mainnet settlement means for an agent payment.",
    "**Arc mainnet settlement for an agent payment** 1. **On-chain finality** – Once the Arc mainnet goes live, payments routed through agents are settled directly on the blockchain.",
  );
  assert.equal(shown.replacedStale, true);
  assert.equal(/goes live/i.test(shown.text), false);
  assert.equal(shown.text.includes("5042"), true);
  assert.equal(shown.sources.some((source) => source.href === "https://explorer.arc.io"), true);
});

test("an empty model response stays empty", () => {
  assert.deepEqual(presentAnswer("Summarize Arc mainnet settlement", ""), { text: "", sources: [], replacedStale: false });
});

test("an error payload is not an answer", () => {
  assert.deepEqual(researchAnswer({ error: "unavailable", model: "gpt-oss-20b" }), { text: "", model: "" });
  assert.deepEqual(researchAnswer(null), { text: "", model: "" });
});
