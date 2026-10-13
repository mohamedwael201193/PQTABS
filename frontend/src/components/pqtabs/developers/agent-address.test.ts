import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyAgentInput } from "./agent-address.ts";

const ADDRESS = "0x2c0e47e0950e7fE6C62D5F4E70d8C0b51d8B4865";
// A placeholder shaped like a key. It is not a real key and holds no funds.
const KEY_SHAPED = `0x${"11".repeat(32)}`;

test("a public address is accepted, trimmed, and returned for the config snippet", () => {
  assert.deepEqual(classifyAgentInput(`  ${ADDRESS}\n`), { kind: "valid", address: ADDRESS });
});

test("a key-shaped value is refused, with or without the 0x prefix", () => {
  assert.deepEqual(classifyAgentInput(KEY_SHAPED), { kind: "key" });
  assert.deepEqual(classifyAgentInput("11".repeat(32)), { kind: "key" });
  assert.deepEqual(classifyAgentInput(` ${KEY_SHAPED} `), { kind: "key" });
});

test("an empty field is empty, and other text is invalid, not accepted", () => {
  assert.deepEqual(classifyAgentInput("   "), { kind: "empty" });
  assert.deepEqual(classifyAgentInput("0x123"), { kind: "invalid" });
  assert.deepEqual(classifyAgentInput("hello"), { kind: "invalid" });
  assert.deepEqual(classifyAgentInput(`${ADDRESS}0`), { kind: "invalid" });
});
