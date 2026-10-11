import assert from "node:assert/strict";
import test from "node:test";
import { sameVerifyingKey } from "./pq-vault.ts";

test("a re-encrypted backup must match the current root verifying key", () => {
  const key = "3fd28a25582086f9a6d456512e9240242cc896cdba110838269460a4d76d9ea6";
  assert.equal(sameVerifyingKey(`0x${key}`, key), true);
  assert.equal(sameVerifyingKey(key, "5419dd969dc1290bb3cf19d47d5bd0d627fb085c3dc3d38d53a3b1275347bd20"), false);
  assert.equal(sameVerifyingKey("0x1234", key), false);
});
