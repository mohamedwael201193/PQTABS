import assert from "node:assert/strict";
import { test } from "node:test";
import { busyMessage, indexingPause } from "./limits.ts";

test("a refused request says the browser sent too many requests and nothing was sent", () => {
  assert.match(busyMessage("rate_limited") ?? "", /Too many requests.*Nothing was sent/);
  const fromServer = "Too many requests from this connection. Wait 40 seconds, then try again. Nothing was sent.";
  assert.equal(busyMessage(fromServer), fromServer);
});

test("other errors are not reported as rate limits", () => {
  assert.equal(busyMessage(undefined), null);
  assert.equal(busyMessage("Arc is rate limiting reads. Try again in a moment."), null);
  assert.equal(busyMessage("bad_address"), null);
});

test("the indexing poll backs off from 3 seconds to a 15 second cap", () => {
  assert.equal(indexingPause(3_000), 4_500);
  assert.equal(indexingPause(10_000), 15_000);
  assert.equal(indexingPause(15_000), 15_000);
});
