// Measures real Groq token usage for research tasks through the backend's production askGroq (same prompt, model,
// max_tokens 400, reasoning_effort low). It wraps fetch only to read the usage block that Groq returns.
// It calls the provider directly with GROQ_API_KEY from the repository .env. It does not call PQTABS, Arc, or any payment path.
// Prints and saves token counts and costs. The key, the answers, and the Groq response bodies are never printed or saved.
//
// Usage: node packages/scripts/groq-usage-measure.mjs [--out <file>]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const outArg = process.argv.indexOf("--out");
const outFile = outArg > 0 ? process.argv[outArg + 1] : join(here, "evidence", "groq-usage-2026-10-13.json");

// Groq list prices in USD per 1M tokens (https://console.groq.com/docs/model/openai/gpt-oss-120b, fetched 2026-10-13).
const INPUT_PER_M = 0.15;
const OUTPUT_PER_M = 0.6;

function loadGroqEnv() {
  const env = {};
  for (const line of readFileSync(join(repo, ".env"), "utf8").split(/\r?\n/)) {
    const match = /^\s*(GROQ_[A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is empty in .env. Nothing was measured.");
  return env;
}

// Curated: a spread of Arc questions, one long question, and one question with no source (the answer must refuse).
// This is a sample, not a production log. The live backend now logs usage counts with event research_usage.
const TASKS = [
  "What is Arc and who runs it?",
  "Which token pays gas on Arc, and how many decimals does the native balance use?",
  "What chain ID does Arc mainnet use?",
  "Explain the difference between the 6-decimal USDC ERC-20 interface and the 18-decimal native balance on Arc.",
  "What is EIP-3009 transferWithAuthorization and why does a relayer need it?",
  "What is CCTP and which Arc networks support it?",
  "How does finality work on Arc, and when should an app treat a payment as settled?",
  "What is the Arc testnet chain ID and where is its RPC endpoint?",
  "Give three steps for checking a USDC transfer on Arc with a block explorer.",
  "What is a post-quantum signature and where does Arc expose SLH-DSA verification?",
  "Why do getLogs queries on Arc sometimes need smaller block ranges, and what should a client do when a node returns a rate limit?",
  "I am building a payment flow on Arc. Walk me through how I should handle a quote that expires before the payment is relayed, how I should prevent a payment from being counted twice when the same transaction is retried, how I should decide which block range to read for the receipt, and which fields of the receipt I should check before I tell the user their answer is paid for.",
  "What will the Arc mainnet USDC price be next year?",
];

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function summary(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    n: values.length,
    mean: Math.round((total / values.length) * 10) / 10,
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    max: Math.max(...values),
  };
}

const env = loadGroqEnv();
const research = await import(pathToFileURL(join(repo, "backend", "dist", "src", "index", "research.js")).href);

const rows = [];
for (const [index, task] of TASKS.entries()) {
  const captured = { usage: null, finish: null, status: null };
  const fetchImpl = async (url, init) => {
    const response = await fetch(url, init);
    captured.status = response.status;
    try {
      const body = await response.clone().json();
      captured.usage = body.usage ?? null;
      captured.finish = body.choices?.[0]?.finish_reason ?? null;
    } catch {
      captured.usage = null;
    }
    return response;
  };
  const started = Date.now();
  const answer = await research.askGroq(task, env, fetchImpl);
  const latencyMs = Date.now() - started;
  const usage = captured.usage ?? {};
  const promptTokens = usage.prompt_tokens ?? null;
  const completionTokens = usage.completion_tokens ?? null;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? null;
  const costRaw6 = promptTokens == null || completionTokens == null ? null : promptTokens * INPUT_PER_M + completionTokens * OUTPUT_PER_M;
  rows.push({
    id: index + 1,
    taskChars: task.length,
    answered: answer.text.length > 0,
    httpStatus: captured.status,
    finishReason: captured.finish,
    model: answer.model || null,
    promptTokens,
    completionTokens,
    reasoningTokens,
    answerWords: answer.text ? answer.text.split(/\s+/).length : 0,
    costRaw6: costRaw6 == null ? null : Math.round(costRaw6 * 1000) / 1000,
    latencyMs,
  });
  process.stderr.write(`task ${index + 1}/${TASKS.length}: answered=${answer.text.length > 0} prompt=${promptTokens} completion=${completionTokens}\n`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

const measured = rows.filter((row) => row.answered && row.promptTokens != null);
const result = {
  measuredOn: "2026-10-13",
  model: rows.find((row) => row.model)?.model ?? null,
  maxTokens: 400,
  reasoningEffort: "low",
  prices: { inputPerMillionUsd: INPUT_PER_M, outputPerMillionUsd: OUTPUT_PER_M, rawUnitsPerUsdc: 1_000_000 },
  tasksRun: rows.length,
  tasksAnswered: measured.length,
  promptTokens: summary(measured.map((row) => row.promptTokens)),
  completionTokens: summary(measured.map((row) => row.completionTokens)),
  reasoningTokens: summary(measured.map((row) => row.reasoningTokens ?? 0)),
  costRaw6: summary(measured.map((row) => row.costRaw6)),
  latencyMs: summary(rows.map((row) => row.latencyMs)),
  finishReasons: rows.reduce((counts, row) => ({ ...counts, [row.finishReason ?? "none"]: (counts[row.finishReason ?? "none"] ?? 0) + 1 }), {}),
  rows,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...result, rows: undefined, out: outFile }, null, 2));
