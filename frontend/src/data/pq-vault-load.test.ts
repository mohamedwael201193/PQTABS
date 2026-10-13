import assert from "node:assert/strict";
import test from "node:test";
import { securityKeyLoadError } from "./pq-vault.ts";

test("an aborted signer download can be retried", () => {
  const aborted = new Error("WebAssembly compilation aborted: Network error: Response body loading was aborted");
  assert.match(securityKeyLoadError(aborted) ?? "", /Try unlock again/);
  assert.equal(securityKeyLoadError(new Error("decrypt failed")), null);
});
