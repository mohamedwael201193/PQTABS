import assert from "node:assert/strict";
import test from "node:test";
import { answerMarkdown } from "./answer-prose.ts";

test("a packed model answer becomes a title and a list", () => {
  const markdown = answerMarkdown(
    "**Arc mainnet settlement** 1. **On-chain finality** – Payments settle on Arc. 2. **Lower cost** – One network fee. In short, the agent can see the transfer.",
  );
  assert.match(markdown, /^## Arc mainnet settlement\n\n1\. \*\*On-chain finality\*\*/);
  assert.match(markdown, /\n\n2\. \*\*Lower cost\*\*/);
  assert.match(markdown, /\n\nIn short,/);
  assert.equal(markdown.includes("**Arc mainnet settlement**"), false);
});

test("an empty answer stays empty", () => {
  assert.equal(answerMarkdown("   "), "");
});
