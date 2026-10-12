import assert from "node:assert/strict";
import test from "node:test";
import { answerIncomplete, answerMarkdown } from "./answer-prose.ts";

const TABLE_ANSWER = [
  "**Arc Mainnet Settlement — What It Means for an Agent Payment**",
  "",
  "| Aspect | What It Is |",
  "|--------|------------|",
  "| **On-chain finality** | Payments are recorded on Arc. |",
  "| **Transparent audit trail** | Every settlement is a public transaction hash. |",
  "",
  "Auditors can verify each payment on the explorer.",
].join("\n");

test("a table keeps its rows on separate lines and its title becomes a heading", () => {
  const markdown = answerMarkdown(TABLE_ANSWER);
  assert.match(markdown, /^## Arc Mainnet Settlement — What It Means for an Agent Payment\n\n\| Aspect \| What It Is \|\n\|--------\|/m);
  assert.match(markdown, /\n\| \*\*Transparent audit trail\*\* \| Every settlement is a public transaction hash\. \|\n/);
});

test("an answer that stops mid-sentence is incomplete", () => {
  assert.equal(answerIncomplete("Auditors can verify that agents were paid the correct amount without needing"), true);
  assert.equal(answerIncomplete(TABLE_ANSWER), false);
});

test("a finished answer, a table row, or an emphasised close is complete", () => {
  assert.equal(answerIncomplete("Arc finality is under one second."), false);
  assert.equal(answerIncomplete("| **On-chain finality** | Payments are recorded on Arc. |"), false);
  assert.equal(answerIncomplete("It is **final**"), false);
  assert.equal(answerIncomplete("   "), false);
});

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
