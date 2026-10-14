import assert from "node:assert/strict";
import test from "node:test";
import { linkCitations, presentAnswer, removeUnsourcedSentences, researchAnswer } from "./research-answer.ts";

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
  assert.deepEqual(presentAnswer("Summarize Arc mainnet settlement", ""), { text: "", sources: [], replacedStale: false, corrections: [], removed: [] });
});

test("an uncited roadmap sentence about Stablecoin Services and the Privacy Sector is removed, and its removal is reported", () => {
  const answer = [
    "Arc deterministic finality means a committed block is final.",
    "Future features such as Stablecoin Services or the Privacy Sector may expand payment options, but they are not live yet.",
  ].join(" ");
  const shown = presentAnswer("Summarize what Arc mainnet settlement means for an agent payment.", answer);
  assert.equal(shown.text.includes("Stablecoin Services"), false);
  assert.equal(shown.text.includes("Arc deterministic finality means a committed block is final."), true);
  assert.deepEqual(shown.removed, [
    "Future features such as Stablecoin Services or the Privacy Sector may expand payment options, but they are not live yet.",
  ]);
});

test("a cited roadmap sentence is kept, and its marker links to the official page", () => {
  const shown = presentAnswer(
    "Summarize Arc settlement.",
    "Stablecoin Services will expand payment options [S5]. Arc Privacy Sector is on the roadmap and is not yet available [S9].",
  );
  assert.equal(shown.removed.length, 0);
  assert.equal(shown.text.includes("[Opt-in privacy](https://docs.arc.io/arc/concepts/opt-in-privacy)"), true);
  assert.equal(shown.text.includes("[S9]"), false);
});

test("a sentence without a roadmap name is not removed", () => {
  assert.deepEqual(removeUnsourcedSentences("Finality is deterministic. Gas is paid in USDC.").removed, []);
});

test("a removed sentence is not reported for a non-Arc answer", () => {
  const shown = presentAnswer("Summarize a privacy sector report", "The privacy sector is growing.");
  assert.deepEqual(shown.removed, []);
  assert.equal(shown.text, "The privacy sector is growing.");
});

test("when every sentence is removed, the answer says the sources do not cover it", () => {
  const shown = presentAnswer("Summarize Arc settlement.", "Stablecoin Services will expand payment options.");
  assert.match(shown.text, /do not cover this question, so no answer is given/);
  assert.equal(shown.removed.length, 1);
});

test("linkCitations titles a known fact and drops an unknown marker's address", () => {
  assert.equal(
    linkCitations("Gas is USDC [S5] and [S99](https://evil.example/phish)."),
    "Gas is USDC [Stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model) and S99.",
  );
  assert.equal(linkCitations("Finality [S3](javascript:alert(1)).").includes("javascript:"), false);
  assert.equal(
    linkCitations("Finality [S3](https://evil.example/wrong)."),
    "Finality [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality).",
  );
  assert.equal(
    linkCitations("Finality [S3]() and [S3](https://docs.arc.io/arc/concepts/deterministic-finality"),
    "Finality [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality) and [Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)",
  );
});

/** The answer stored in Chrome for receipt 0x53fc6e7c43b71cd14f98e70f8fbd182d55b55d3bed471f56ac5d0a00a88e6ebc. */
const CHROME_ANSWER =
  "Arc mainnet settlement for an agent payment means that the transaction is finalized in under one second with deterministic finality, so once the block is committed it is irreversible and no re\u2011orgs occur [S3](https://docs.arc.io/arc/concepts/deterministic-finality). The payment is processed on an EVM\u2011compatible Layer\u20111 chain (Chain\u202fID\u202f5042) using the Malachite Tendermint\u2011based BFT consensus run by a permissioned Proof\u2011of\u2011Authority validator set [S1](https://docs.arc.io/arc/references/rpc-endpoints)[S2](https://docs.arc.io/arc-chain.md)[S4](https://docs.arc.io/arc/concepts/consensus-layer). Gas fees for the payment are paid in USDC, which serves as the native gas token on Arc [S5](https://docs.arc.io/arc/concepts/stablecoin-native-model).";

test("the Chrome answer keeps its sentences and turns concatenated citations into separate official links", () => {
  const shown = presentAnswer("Summarize what Arc mainnet settlement means for an agent payment.", CHROME_ANSWER);
  assert.equal(shown.text.includes("finalized in under one second"), true);
  assert.equal(shown.text.includes("Malachite"), true);
  assert.equal(shown.text.includes("native gas token"), true);
  assert.equal(shown.text.includes("5042"), true);
  assert.equal(/\[S\d+\]/.test(shown.text), false);
  assert.equal(shown.text.includes("](") && shown.text.includes(")["), false);
  assert.equal(shown.text.includes(")(https://"), false);
  assert.equal(shown.text.includes("[Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)"), true);
  assert.equal(
    shown.text.includes(
      "[RPC endpoints](https://docs.arc.io/arc/references/rpc-endpoints), [Arc chain](https://docs.arc.io/arc-chain.md), [Consensus layer](https://docs.arc.io/arc/concepts/consensus-layer)",
    ),
    true,
  );
  assert.equal(shown.text.includes("[Stablecoin-native model](https://docs.arc.io/arc/concepts/stablecoin-native-model)"), true);
  assert.deepEqual(
    shown.sources.map((source) => source.href),
    [
      "https://docs.arc.io/arc/concepts/deterministic-finality",
      "https://docs.arc.io/arc/references/rpc-endpoints",
      "https://docs.arc.io/arc-chain.md",
      "https://docs.arc.io/arc/concepts/consensus-layer",
      "https://docs.arc.io/arc/concepts/stablecoin-native-model",
    ],
  );
});

test("a glued docs address is split before it is linked", () => {
  const linked = linkCitations(
    "See https://docs.arc.io/arc/concepts/deterministic-finalityhttps://docs.arc.io/arc/concepts/consensus-layer.",
  );
  assert.equal(linked.includes("finalityhttps://"), false);
  assert.equal(linked.includes("[Deterministic finality](https://docs.arc.io/arc/concepts/deterministic-finality)"), true);
  assert.equal(linked.includes("[Consensus layer](https://docs.arc.io/arc/concepts/consensus-layer)"), true);
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
