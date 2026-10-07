import assert from "node:assert/strict";
import test from "node:test";
import { withRpcRetry } from "../src/chain.js";
import { RequestError } from "../src/validate.js";

test("one rate-limited Arc read becomes a retry sentence", async () => {
  await assert.rejects(
    () => withRpcRetry(async () => {
      throw new Error("HTTP request failed. Status: 429");
    }, 1),
    (error: unknown) => error instanceof RequestError && error.status === 429 && error.message === "Arc is rate limiting reads. Try again in a moment.",
  );
});
