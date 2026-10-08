import assert from "node:assert/strict";
import test from "node:test";
import { presentedAgent } from "./agent-labels.ts";

test("the pay harness name is shown as the research agent", () => {
  const shown = presentedAgent("Arc payer", "Pays one Arc service inside a capability.");
  assert.equal(shown.name, "Research agent");
  assert.match(shown.role, /external inference/);
});

test("another agent name stays as entered", () => {
  const shown = presentedAgent("Service payer", "Named on this device.");
  assert.equal(shown.name, "Service payer");
  assert.equal(shown.role, "Named on this device.");
});
