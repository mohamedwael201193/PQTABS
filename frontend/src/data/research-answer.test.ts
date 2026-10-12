import assert from "node:assert/strict";
import test from "node:test";
import { presentAnswer, researchAnswer, unverifiedSentences } from "./research-answer.ts";

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
  assert.deepEqual(presentAnswer("Summarize Arc mainnet settlement", ""), { text: "", sources: [], replacedStale: false, corrections: [], unverified: [] });
});

test("the roadmap sentence about Stablecoin Services and the Privacy Sector is flagged, and the text is kept", () => {
  const answer = [
    "Arc deterministic finality means a committed block is final.",
    "Future features such as Stablecoin Services or the Privacy Sector may expand payment options, but they are not live yet.",
  ].join(" ");
  const shown = presentAnswer("Summarize what Arc mainnet settlement means for an agent payment.", answer);
  assert.equal(shown.text, answer);
  assert.deepEqual(shown.unverified, [
    "Future features such as Stablecoin Services or the Privacy Sector may expand payment options, but they are not live yet.",
  ]);
});

test("a sentence without a roadmap name is not flagged", () => {
  assert.deepEqual(unverifiedSentences("Finality is deterministic. Gas is paid in USDC."), []);
});

test("a flagged sentence is not returned for a non-Arc answer", () => {
  const shown = presentAnswer("Summarize a privacy sector report", "The privacy sector is growing.");
  assert.deepEqual(shown.unverified, []);
});

/** The stored answer for receipt 0x74ce7b557f8e5156af8fca701b40d833651ff1d206442f0a3ef4c801698f1b15, with its table and its two wrong claims. */
const STORED_ANSWER = [
  "**Arc Mainnet Settlement — What It Means for an Agent Payment**",
  "",
  "| Aspect | What It Is | Why It Matters for Agents |",
  "|--------|------------|---------------------------|",
  "| **On-chain finality** | Payments are recorded on Arc's live, public blockchain rather than a testnet or off-chain ledger. | Agents receive a provable receipt that the funds have been transferred. |",
  "| **Native token usage** | The settlement occurs in Arc's native token (or a supported stablecoin on the mainnet). | No need for fiat conversion or third-party gateways. |",
  "| **Instant confirmation** | Arc's consensus (typically a PoS or DAG-based model) confirms transactions within seconds to a few minutes. | Agents get paid quickly. |",
  "| **Transparent audit trail** | Every settlement is a public transaction hash that anyone can query. | Auditors can verify that agents were paid the correct amount without needing",
].join("\n");

test("the stored answer gets corrections for PoS, DAG, and stablecoin gas, with documented sources", () => {
  const shown = presentAnswer("Summarize Arc Mainnet Settlement for an agent payment", STORED_ANSWER);
  assert.equal(shown.replacedStale, false);
  assert.equal(shown.text, STORED_ANSWER);
  const texts = shown.corrections.map((item) => item.text);
  assert.equal(texts.some((text) => /Malachite/.test(text) && /not proof-of-stake or a DAG/.test(text)), true);
  assert.equal(texts.some((text) => /USDC is Arc's native gas token/.test(text)), true);
  assert.equal(shown.corrections.every((item) => item.href.startsWith("https://docs.arc.io/") || item.href === "https://explorer.arc.io"), true);
  assert.equal(shown.sources.some((source) => source.href === "https://docs.arc.io/arc/concepts/consensus-layer"), true);
});

test("a correct answer gets no corrections", () => {
  const shown = presentAnswer(
    "What consensus does Arc use?",
    "Arc uses Malachite, a Tendermint-style BFT protocol run by a permissioned Proof-of-Authority validator set. Finality is deterministic and under one second.",
  );
  assert.deepEqual(shown.corrections, []);
});

test("an error payload is not an answer", () => {
  assert.deepEqual(researchAnswer({ error: "unavailable", model: "gpt-oss-20b" }), { text: "", model: "" });
  assert.deepEqual(researchAnswer(null), { text: "", model: "" });
});
