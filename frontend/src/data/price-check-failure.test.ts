import assert from "node:assert/strict";
import test from "node:test";
import { priceCheckFailure } from "./price-check-failure.ts";

test("a rate-limited price check keeps the Arc reason and signs nothing", () => {
  assert.equal(
    priceCheckFailure("Arc is rate limiting reads. Try again in a moment.", "Network reads are busy. Your last confirmed state is still safe."),
    "Arc is rate limiting reads. Try again in a moment. Nothing was signed. Nothing was broadcast.",
  );
});

test("a price check without a detail still says nothing was signed", () => {
  assert.equal(
    priceCheckFailure(undefined, ""),
    "The price could not be checked against this capability. Nothing was signed. Nothing was broadcast.",
  );
});
