// Fail-closed agent signer check. Read-only: derives an address from a key in the process environment
// and compares it with the capability's on-chain agent. It never prints the key, never reads a file,
// and never writes anything. Exit 0 only when the key exists and derives the expected agent.
//
// Usage (key supplied for this one process, never stored in a file here):
//   node packages/scripts/agent-signer-check.mjs --expected 0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865
// The key is read from PQTABS_AGENT_PRIVATE_KEY, falling back to AGENT_PRIVATE_KEY.

import { privateKeySigner } from "../pqtabs-sdk/dist/src/index.js";

const args = process.argv.slice(2);
const flag = args.indexOf("--expected");
const expected = flag >= 0 ? args[flag + 1] : undefined;

function fail(message) {
  console.log(JSON.stringify({ ok: false, reason: message }, null, 2));
  process.exit(1);
}

if (!expected || !/^0x[0-9a-fA-F]{40}$/.test(expected)) fail("--expected must be the capability's on-chain agent address");

const key = (process.env.PQTABS_AGENT_PRIVATE_KEY ?? process.env.AGENT_PRIVATE_KEY ?? "").trim();
if (!key) fail("no agent key in the environment (PQTABS_AGENT_PRIVATE_KEY or AGENT_PRIVATE_KEY). Nothing was signed.");
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail("the agent key is not a 32-byte hex value. Fix it or unset it. Nothing was signed.");

let derived;
try {
  derived = privateKeySigner(key).address;
} catch {
  fail("the agent key could not be parsed. Nothing was signed.");
}

const matches = derived.toLowerCase() === expected.toLowerCase();
console.log(
  JSON.stringify(
    {
      ok: matches,
      expectedAgent: expected.toLowerCase(),
      derivedAgent: derived.toLowerCase(),
      reason: matches ? "derived address matches the capability agent" : "derived address does NOT match the capability agent; paid calls are refused",
    },
    null,
    2,
  ),
);
process.exit(matches ? 0 : 1);
