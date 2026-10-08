import assert from "node:assert/strict";
import test from "node:test";
import { tabForReceipt } from "./opened-tab.ts";

const older = { txHash: "0xaaa", agentId: "0xagent", status: "active" };
const opened = { txHash: "0xbbb", agentId: "0xagent", status: "active" };

test("a new receipt is not replaced by an older capability for the same agent", () => {
  assert.equal(tabForReceipt([older], "0xbbb"), undefined);
  assert.equal(tabForReceipt([older, opened], "0xBBB"), opened);
});
