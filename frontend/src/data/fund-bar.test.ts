import assert from "node:assert/strict";
import test from "node:test";
import { fundBar } from "./fund-bar.ts";

test("an expired balance fills the bar without saying the agent can reach it", () => {
  const bar = fundBar({ inRoot: 0, reach: 0, reclaimable: 0.009988 });
  assert.equal(bar.reachableShare, 0);
  assert.equal(bar.headline, "0.0% agent reachable");
  const filled = bar.segments.find((segment) => segment.share === 100);
  assert.equal(filled?.key, "reclaimable");
  assert.equal(filled?.label, "Awaiting reclaim");
});

test("root cash after a reclaim is not labeled as a reachable share", () => {
  const bar = fundBar({ inRoot: 0.009988, reach: 0, reclaimable: 0 });
  assert.equal(bar.headline, "0.0% agent reachable");
  assert.equal(bar.segments.find((segment) => segment.share === 100)?.label, "Root cash");
});
