import assert from "node:assert/strict";
import test from "node:test";
import { researchAnswer } from "./research-answer.ts";

test("a model response keeps the answer and the model name", () => {
  const parsed = researchAnswer({
    model: "gpt-oss-20b",
    choices: [{ message: { role: "assistant", content: "Arc settles the payment in the same block." } }],
  });
  assert.equal(parsed.model, "gpt-oss-20b");
  assert.equal(parsed.text, "Arc settles the payment in the same block.");
});

test("an error payload is not an answer", () => {
  assert.deepEqual(researchAnswer({ error: "unavailable", model: "gpt-oss-20b" }), { text: "", model: "" });
  assert.deepEqual(researchAnswer(null), { text: "", model: "" });
});
