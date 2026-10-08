import assert from "node:assert/strict";
import test from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { browserHoldsAgentKey, forgetAgentKeys, rememberAgentKey, recallAgentKey } from "./agent-session.ts";

test("this browser can select an agent only after its key is remembered here", () => {
  forgetAgentKeys();
  const privateKey = generatePrivateKey();
  const address = privateKeyToAccount(privateKey).address;
  const other = "0x0000000000000000000000000000000000000001";
  assert.equal(browserHoldsAgentKey(address), false);
  assert.equal(browserHoldsAgentKey(other), false);
  rememberAgentKey(address, privateKey);
  assert.equal(browserHoldsAgentKey(address), true);
  assert.equal(recallAgentKey(address.toLowerCase()), privateKey);
  assert.equal(browserHoldsAgentKey(other), false);
  forgetAgentKeys();
  assert.equal(browserHoldsAgentKey(address), false);
  assert.equal(recallAgentKey(address), null);
});
